/**
 * The outbox entry, tested on the two things a column can silently fail at.
 *
 * The first is the **driver**. `architecture/08` specifies an entry shape, and
 * every field in it that does not survive a round trip through SQLite fails
 * later and quietly: `deps` read back as the string `'["e1"]'` is not an empty
 * dependency list, it is a list of one dependency named `[`, and the drain would
 * never notice. So nothing here trusts the object it passed in — every
 * assertion reads back through the database, and twice through the raw handle
 * where the *stored* representation is the claim.
 *
 * The second is **derivation**. `deps` is derived at enqueue rather than
 * hand-maintained precisely because a person maintaining it will be wrong, and
 * a scan that only looks at the top level of a payload is the same bug with
 * fewer people to blame: it returns an empty list for a payload that nests, and
 * an empty list is indistinguishable from "nothing to wait for".
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BLOCKED_KIND,
  claimSeq,
  deriveDeps,
  type OutboxPayload,
  outbox,
  type UnacknowledgedEntry,
} from "../outbox.ts";
import { type Scratch, scratchLedger } from "./scratch.ts";

let s: Scratch;

beforeEach(() => {
  s = scratchLedger();
});

afterEach(() => {
  s?.close();
});

/**
 * The columns every entry must carry, so a test can say only what it is about.
 *
 * `capturedTz` and `capturedOffsetMinutes` are here rather than defaulted in
 * the table for the reason the column documents — the capture site is the only
 * thing that knows them — which makes them a fixture's job.
 */
const base = {
  operation: "create_transaction",
  opVersion: 1,
  payload: { account_id: "acc-1" },
  capturedTz: "Europe/Warsaw",
  capturedOffsetMinutes: 120,
} as const;

/** Whole seconds: `mode: "timestamp"` stores unix seconds, so millis do not survive. */
function secondsPrecision(ms: number): Date {
  return new Date(Math.floor(ms / 1000) * 1000);
}

function enqueue(values: Partial<typeof outbox.$inferInsert> = {}) {
  const [entry] = s.db
    .insert(outbox)
    .values({ ...base, seq: claimSeq(s.db), ...values })
    .returning()
    .all();
  if (!entry) throw new Error("insert returned no row");
  return entry;
}

describe("the entry shape survives the driver", () => {
  it("round-trips every column `08` names", () => {
    const sentAt = secondsPrecision(Date.parse("2026-03-12T09:15:00Z"));

    const written = enqueue({
      state: "blocked",
      deps: ["entry-a", "entry-b"],
      blockedKind: "repairable",
      blockedReason: "dated inside a period closed while you were offline",
      lastError: "PERIOD_CLOSED",
      attempts: 3,
      sentAt,
      capturedTz: "Asia/Tbilisi",
      capturedOffsetMinutes: 240,
    });

    // Read back, not asserted on what went in: the insert's `returning()` can
    // report the values it was handed rather than the values SQLite stored.
    const [entry] = s.db.select().from(outbox).where(eq(outbox.id, written.id)).all();

    expect(entry?.deps, "a JSON array, not the text of one").toEqual(["entry-a", "entry-b"]);
    expect(entry?.blockedKind).toBe("repairable");
    expect(entry?.blockedReason).toBe("dated inside a period closed while you were offline");
    expect(entry?.lastError).toBe("PERIOD_CLOSED");
    expect(entry?.sentAt).toBeInstanceOf(Date);
    expect(entry?.sentAt?.getTime()).toBe(sentAt.getTime());
    expect(entry?.capturedTz).toBe("Asia/Tbilisi");
    expect(entry?.capturedOffsetMinutes, "an offset the zone alone cannot give back").toBe(240);
  });

  it("stores `deps` as JSON text and the timestamp as an integer", () => {
    const entry = enqueue({ deps: ["entry-a"], sentAt: new Date(1_772_270_100_000) });

    // Through the raw handle, because the mapper that writes is the mapper that
    // reads: a symmetric mistake round-trips perfectly and stores nonsense.
    const stored = s.sqlite.prepare("select deps, sent_at from outbox where id = ?").get(entry.id);

    expect(stored).toEqual({ deps: '["entry-a"]', sent_at: 1_772_270_100 });
  });

  it("defaults a fresh entry to pending, undepended and unsent", () => {
    const entry = enqueue();

    const [read] = s.db.select().from(outbox).where(eq(outbox.id, entry.id)).all();

    expect(read?.state).toBe("pending");
    expect(read?.deps, "empty, not null — `may send now` is a fact the drain reads").toEqual([]);
    expect(read?.blockedKind).toBeNull();
    expect(read?.blockedReason).toBeNull();
    expect(read?.sentAt, "nothing has been on the wire").toBeNull();
  });

  it("refuses an entry with no timezone", () => {
    // The drift check reads `capturedTz` and nothing else, so an entry without
    // one is invisible to it — a `notNull` the database is asked to hold rather
    // than a convention the capture sheet is asked to remember.
    expect(() =>
      s.sqlite
        .prepare(
          "insert into outbox (id, seq, operation, payload, deps, op_version, state, attempts, captured_at, captured_offset_minutes) " +
            "values ('e1', 1, 'create_transaction', '{}', '[]', 1, 'pending', 0, 0, 120)",
        )
        .run(),
    ).toThrow(/NOT NULL constraint failed: outbox.captured_tz/);
  });
});

describe("`blockedKind` says whether blocked is forever", () => {
  it("stores each of the two kinds", () => {
    for (const kind of BLOCKED_KIND) {
      const entry = enqueue({ state: "blocked", blockedKind: kind });
      const [read] = s.db.select().from(outbox).where(eq(outbox.id, entry.id)).all();
      expect(read?.blockedKind).toBe(kind);
    }
  });

  it("refuses a third kind — in the type, and only in the type", () => {
    const entry = enqueue({
      state: "blocked",
      // @ts-expect-error — the guard being asserted. `typecheck` runs this file,
      // so removing the enum from the column makes this line fail the gate.
      blockedKind: "recompressing",
    });

    const [read] = s.db.select().from(outbox).where(eq(outbox.id, entry.id)).all();

    // And here is the limitation, stated where someone will trip over it:
    // SQLite stored it anyway. Drizzle emits no CHECK for an `enum`, and this
    // table's DDL belongs to the migrator, so a raw insert — an importer, a
    // repair script, a future drain written in SQL — has nothing stopping it.
    expect(read?.blockedKind, "the database is not the one enforcing this").toBe("recompressing");
  });
});

describe("`deps` is derived from the payload, not maintained by hand", () => {
  const queue: readonly UnacknowledgedEntry[] = [
    { id: "entry-cp", mintedIds: ["cp-1"] },
    { id: "entry-txn", mintedIds: ["txn-1"] },
  ];

  it("depends on the entry that mints an id the payload names", () => {
    expect(deriveDeps({ counterparty_id: "cp-1", amount: "18.00" }, queue)).toEqual(["entry-cp"]);
  });

  it("depends on an entry the payload names directly", () => {
    // The entry id is minted by the same generator and handed back by
    // `writeLocally`, so a payload built from a previous result can carry it.
    expect(deriveDeps({ entry_id: "entry-txn" }, queue)).toEqual(["entry-txn"]);
  });

  it("depends on nothing when the id it names is not in the queue", () => {
    // `acc-1` is a synced account: real, already on the server, and not a
    // reason to hold a send back.
    expect(deriveDeps({ account_id: "acc-1", counterparty_id: "cp-9" }, queue)).toEqual([]);
  });

  it("depends on nothing when the payload names nothing", () => {
    expect(deriveDeps({}, queue)).toEqual([]);
    expect(deriveDeps({ amount: "18.00", is_business: true, note: null }, queue)).toEqual([]);
  });

  it("finds an id nested inside arrays and objects", () => {
    // The shape a split transaction actually arrives in. A top-level scan
    // returns `[]` here, which reads exactly like "nothing to wait for".
    const payload: OutboxPayload = {
      transaction: {
        lines: [
          { amount: "10.00", counterparty_id: "cp-1" },
          { amount: "8.00", tags: [{ target: "txn-1" }] },
        ],
      },
    };

    expect(deriveDeps(payload, queue)).toEqual(["entry-cp", "entry-txn"]);
  });

  it("names each dependency once, in queue order", () => {
    const twice: readonly UnacknowledgedEntry[] = [{ id: "entry-cp", mintedIds: ["cp-1", "cp-2"] }];

    expect(deriveDeps({ from: "cp-2", to: "cp-1" }, twice)).toEqual(["entry-cp"]);
  });

  it("terminates on a payload that points at itself", () => {
    // Not JSON yet — `deriveDeps` runs on the object the caller built, before
    // anything serialises it. A cycle here would hang the write path rather
    // than throw, which is the worst of the two failures.
    const payload: OutboxPayload = { counterparty_id: "cp-1" };
    payload["self"] = payload;

    expect(deriveDeps(payload, queue)).toEqual(["entry-cp"]);
  });
});

describe("`seq` never goes backwards", () => {
  it("hands out consecutive numbers", () => {
    expect([enqueue(), enqueue(), enqueue()].map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it("does not reuse a number after every entry has drained", () => {
    // **The property the replica's `applied_seq` watermark depends on**, and the
    // one `max(seq) + 1` got wrong: an emptied queue would start again at 1,
    // below a watermark that still reads 3, and the reconciler would never look
    // at that entry again. It only ever happens after a first successful drain,
    // which is why it cannot be found by using the app for an afternoon.
    enqueue();
    enqueue();
    enqueue();
    s.db.delete(outbox).run();

    expect(enqueue().seq, "4, not 1 — the counter outlives the rows").toBe(4);
  });

  it("keeps the counter when a middle entry drains", () => {
    const first = enqueue({ state: "blocked", blockedKind: "terminal" });
    const drained = enqueue();
    s.db.delete(outbox).where(eq(outbox.id, drained.id)).run();

    const later = enqueue();

    expect(later.seq).toBe(3);

    const order = s.db
      .select({ id: outbox.id })
      .from(outbox)
      .orderBy(outbox.seq)
      .all()
      .map((e) => e.id);

    // The blocked entry stays the oldest thing in the queue however many
    // entries drain past it — the ordering `seq` exists for.
    expect(order).toEqual([first.id, later.id]);
  });

  it("allocates once per claim, and rolls back with the write that claimed it", () => {
    // The number is claimed *inside* the insert's transaction, so an abandoned
    // write must not burn one — a queue that skips numbers would leave the
    // reconciler waiting on an entry that never existed.
    expect(() =>
      s.db.transaction((tx) => {
        claimSeq(tx);
        throw new Error("killed mid-write");
      }),
    ).toThrow("killed mid-write");

    expect(enqueue().seq, "the abandoned claim left nothing behind").toBe(1);
  });
});
