/**
 * Launch recovery — the other half of the two-file bargain.
 *
 * `write.test.ts` proves the window a crash opens is *an entry whose row is
 * missing*. This proves that window closes.
 *
 * The crash is not simulated with a mock. Each test does **only the first half
 * of a write** — the outbox entry, committed alone, exactly as `writeLocally`
 * commits it — and then launches. That is not an approximation of a kill; it is
 * the state a kill leaves, produced the same way.
 */

import { accountingDate } from "@waltning/core/date";
import { type Id, id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import type Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineLocalExecutor, LocalDeferral, LocalRefusal, localRegistry } from "../executor.ts";
import { readAppliedSeq } from "../migrate.ts";
import { recoverOnLaunch } from "../recover.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import { type ScratchStores, scratchStores } from "./stores.ts";

const { accounts, currencies, outbox, transactions } = schema;

type Tx = LocalTx<Database.RunResult, typeof schema>;

let s: ScratchStores;

beforeEach(() => {
  s = scratchStores();
  deferGate = true;
  s.ledger.replica.db
    .insert(currencies)
    .values({ code: currencyCode("PLN"), name: "Placeholder" })
    .run();
  s.ledger.replica.db
    .insert(accounts)
    .values({ id: id<"accounts">("acc-1"), name: "Bank A · PLN", currency: currencyCode("PLN") })
    .run();
});

afterEach(() => {
  s?.close();
});

const CREATE_TRANSACTION = z.object({ id: z.string(), amount_original: z.string() });

const createTransaction = defineLocalExecutor<typeof CREATE_TRANSACTION, { id: string }, Tx>({
  operation: "create_transaction",
  opVersion: 1,
  input: CREATE_TRANSACTION,
  mints: (input) => [input.id],
  apply: (input, tx) => {
    const [row] = tx
      .insert(transactions)
      .values({
        id: id<"transactions">(input.id) as Id<"transactions">,
        date: accountingDate("2026-03-12"),
        type: "expense",
        accountId: id<"accounts">("acc-1"),
        amountOriginal: money.toMoney(input.amount_original),
        currency: currencyCode("PLN"),
        fxRate: money.pivotPerUnit("1.000000000000"),
      })
      .returning({ id: transactions.id })
      .all();
    if (!row) throw new Error("no row returned");
    return row;
  },
});

const registry = localRegistry<Tx>([createTransaction]);

/** Always throws `LocalRefusal` — the business-rule case, R3 M2's own test. */
const refusingTransaction = defineLocalExecutor<typeof CREATE_TRANSACTION, { id: string }, Tx>({
  operation: "refuses",
  opVersion: 1,
  input: CREATE_TRANSACTION,
  mints: (input) => [input.id],
  apply: () => {
    throw new LocalRefusal("refuses on every attempt");
  },
});

/**
 * Throws `LocalDeferral` while `deferGate` is `true` — the missing-local-state
 * case — and applies normally once it flips, standing in for a rate row (or
 * any other local fact) arriving between two launches. Reset in `beforeEach`
 * so one test's flip cannot leak into the next.
 */
let deferGate = true;
const deferringTransaction = defineLocalExecutor<typeof CREATE_TRANSACTION, { id: string }, Tx>({
  operation: "defers",
  opVersion: 1,
  input: CREATE_TRANSACTION,
  mints: (input) => [input.id],
  apply: (input, tx) => {
    if (deferGate) {
      throw new LocalDeferral("missing local state, not yet supplied");
    }
    const [row] = tx
      .insert(transactions)
      .values({
        id: id<"transactions">(input.id) as Id<"transactions">,
        date: accountingDate("2026-03-12"),
        type: "expense",
        accountId: id<"accounts">("acc-1"),
        amountOriginal: money.toMoney(input.amount_original),
        currency: currencyCode("PLN"),
        fxRate: money.pivotPerUnit("1.000000000000"),
      })
      .returning({ id: transactions.id })
      .all();
    if (!row) throw new Error("no row returned");
    return row;
  },
});

const registryWithFailures = localRegistry<Tx>([
  createTransaction,
  refusingTransaction,
  deferringTransaction,
]);

/**
 * The first half of a write, and nothing else.
 *
 * This is what is on disk when the process dies between the two commits: the
 * entry is durable, its effect is not, and the watermark has not moved.
 */
function intentOnly(seq: number, txnId: string, operation = "create_transaction") {
  s.ledger.outbox.db
    .insert(outbox)
    .values({
      seq,
      operation,
      opVersion: 1,
      payload: { id: txnId, amount_original: "18.00000000" },
      deps: [],
      capturedTz: "Europe/Warsaw",
      capturedOffsetMinutes: 60,
    })
    .run();
}

const rows = () => s.ledger.replica.db.select().from(transactions).all();

describe("an entry interrupted mid-request goes back to the queue", () => {
  it("resets sending to pending, and names what it reset", () => {
    intentOnly(1, "txn-1");
    s.ledger.outbox.db.update(outbox).set({ state: "sending" }).run();

    const recovery = recoverOnLaunch(s.ledger, registry);

    expect(recovery.requeued).toHaveLength(1);
    const [entry] = s.ledger.outbox.db.select().from(outbox).all();
    // iOS force-quit gives no callback, so without this the entry orphans
    // forever and the pending count never moves.
    expect(entry?.state).toBe("pending");
  });
});

describe("a row lost between the two commits comes back", () => {
  it("replays the entry and advances the watermark to it", () => {
    intentOnly(1, "txn-1");
    expect(rows()).toHaveLength(0);
    expect(readAppliedSeq(s.ledger.replica.db)).toBe(0);

    const recovery = recoverOnLaunch(s.ledger, registry);

    expect(rows().map((r) => r.id)).toEqual(["txn-1"]);
    expect(recovery.replayed).toHaveLength(1);
    expect(recovery.halted).toBeNull();
    expect(readAppliedSeq(s.ledger.replica.db)).toBe(1);
  });

  it("replays in seq order, because a later entry may name an earlier row", () => {
    intentOnly(1, "txn-1");
    intentOnly(2, "txn-2");
    intentOnly(3, "txn-3");

    recoverOnLaunch(s.ledger, registry);

    expect(rows().map((r) => r.id)).toEqual(["txn-1", "txn-2", "txn-3"]);
    expect(readAppliedSeq(s.ledger.replica.db)).toBe(3);
  });

  it("survives the process actually going away", () => {
    intentOnly(1, "txn-1");

    // Not a simulation: the files are closed and opened again, migrators and
    // all, which is what a launch is.
    s.reopen();
    recoverOnLaunch(s.ledger, registry);

    expect(rows().map((r) => r.id)).toEqual(["txn-1"]);
  });
});

describe("replay is bounded by the watermark", () => {
  it("does not re-apply an entry whose effect already landed", () => {
    intentOnly(1, "txn-1");
    recoverOnLaunch(s.ledger, registry);

    // The entry is still queued — nothing has drained, and with no backend
    // nothing ever will. Replaying it again would insert a duplicate row, or
    // throw on the primary key, on every launch forever.
    const second = recoverOnLaunch(s.ledger, registry);

    expect(second.replayed).toEqual([]);
    // Asserted explicitly, because without it this test passes for the wrong
    // reason: a re-replay collides on the primary key, throws, and is caught by
    // the halt path — so `replayed` is empty either way. `halted` is what
    // distinguishes "correctly did nothing" from "tried and failed".
    expect(second.halted).toBeNull();
    expect(rows()).toHaveLength(1);
  });

  it("leaves an entry alone once its seq is at the watermark", () => {
    intentOnly(1, "txn-1");
    intentOnly(2, "txn-2");
    recoverOnLaunch(s.ledger, registry);
    expect(rows()).toHaveLength(2);

    const again = recoverOnLaunch(s.ledger, registry);
    expect(again.replayed).toEqual([]);
    expect(again.halted).toBeNull();
    expect(rows()).toHaveLength(2);
  });
});

describe("an entry that cannot be replayed stops replay, and says why", () => {
  it("blocks it terminally rather than throwing or skipping", () => {
    intentOnly(1, "txn-1");
    intentOnly(2, "txn-2", "an_operation_this_build_forgot");
    intentOnly(3, "txn-3");

    const recovery = recoverOnLaunch(s.ledger, registry);

    // The first landed.
    expect(recovery.replayed).toHaveLength(1);
    expect(recovery.halted?.seq).toBe(2);
    expect(recovery.halted?.operation).toBe("an_operation_this_build_forgot");

    const [blocked] = s.ledger.outbox.db.select().from(outbox).where(eq(outbox.seq, 2)).all();
    expect(blocked?.state).toBe("blocked");
    expect(blocked?.blockedKind).toBe("terminal");
    expect(blocked?.blockedReason).toContain("an_operation_this_build_forgot");
    // R2 M4 — `replay_halted`, never `write.ts`'s `refused`: local replay is
    // what stalled, not the write itself. The drain may still send it.
    expect(blocked?.disposition).toBe("replay_halted");
  });

  it("leaves the watermark below it, so nothing claims the missing effect landed", () => {
    intentOnly(1, "txn-1");
    intentOnly(2, "txn-2", "an_operation_this_build_forgot");
    intentOnly(3, "txn-3");

    recoverOnLaunch(s.ledger, registry);

    // Advancing past it would say txn-2 is present when it is not, and would
    // then apply txn-3 over a ledger missing a row it might name.
    expect(readAppliedSeq(s.ledger.replica.db)).toBe(1);
    expect(rows().map((r) => r.id)).toEqual(["txn-1"]);
  });

  it("does not lose the entry, which is the whole of `08`'s never-drop rule", () => {
    intentOnly(1, "txn-1", "an_operation_this_build_forgot");

    recoverOnLaunch(s.ledger, registry);

    const [entry] = s.ledger.outbox.db.select().from(outbox).all();
    // Readable and exportable on S30, with its payload intact — the app that
    // could not replay it is not the app that gets to discard it.
    expect(entry).toBeDefined();
    expect(entry?.payload).toEqual({ id: "txn-1", amount_original: "18.00000000" });
  });

  /**
   * R2 L1 — if marking the entry `blocked` itself throws, the replay
   * failure that got it there must not be lost either: it travels as
   * `cause` rather than being swallowed by whatever broke the second write.
   */
  it("attaches the original replay failure as `cause` when marking it blocked also fails", () => {
    intentOnly(1, "txn-1", "an_operation_this_build_forgot");
    const blockWriteError = new Error("outbox db is locked");
    const updateSpy = vi.spyOn(s.ledger.outbox.db, "update").mockImplementation(() => {
      throw blockWriteError;
    });

    let caught: unknown;
    try {
      recoverOnLaunch(s.ledger, registry);
    } catch (e) {
      caught = e;
    } finally {
      updateSpy.mockRestore();
    }

    expect(caught).toBeInstanceOf(Error);
    const err = caught as Error;
    expect(err.message).toContain("failed to mark");
    expect(err.message).toContain("outbox db is locked");
    expect(err.cause).toBeInstanceOf(Error);
    expect((err.cause as Error).message).toContain("an_operation_this_build_forgot");
  });
});

/**
 * R2 M4 — `blocked(terminal)` used to mean two different things: `write.ts`'s
 * own refusal ("never send") and this file's own replay halt ("send later").
 * `disposition` names which, and `outstanding`'s query reads it.
 */
describe("a `refused` entry is skipped on later launches", () => {
  it("does not re-attempt it, and lets entries behind it replay past it", () => {
    intentOnly(1, "txn-1");
    intentOnly(2, "txn-2");
    intentOnly(3, "txn-3");
    // Simulate `write.ts` having already refused entry 2, on an earlier
    // launch — a folded-name collision or a stale version, say.
    s.ledger.outbox.db
      .update(outbox)
      .set({
        state: "blocked",
        blockedKind: "terminal",
        disposition: "refused",
        blockedReason: "refused before this launch",
      })
      .where(eq(outbox.seq, 2))
      .run();

    const recovery = recoverOnLaunch(s.ledger, registry);

    // Not re-halted: a `refused` entry's `apply` would only throw the same
    // way again, so it is not retried at all, and entries 1 and 3 replay.
    expect(recovery.halted).toBeNull();
    expect(recovery.replayed).toHaveLength(2);
    expect(rows().map((r) => r.id)).toEqual(["txn-1", "txn-3"]);
    // It created nothing when it was refused, so there is nothing for a
    // later entry to depend on — the watermark is free to jump past it.
    expect(readAppliedSeq(s.ledger.replica.db)).toBe(3);

    const [entry2] = s.ledger.outbox.db.select().from(outbox).where(eq(outbox.seq, 2)).all();
    expect(entry2?.state).toBe("blocked");
    expect(entry2?.disposition).toBe("refused");
  });

  it("still halts on a `replay_halted` entry, on every launch, never skipping it", () => {
    intentOnly(1, "txn-1");
    intentOnly(2, "txn-2", "an_operation_this_build_forgot");
    intentOnly(3, "txn-3");

    const first = recoverOnLaunch(s.ledger, registry);
    expect(first.halted?.seq).toBe(2);
    expect(first.replayed).toHaveLength(1);

    // A second launch tries again rather than silently accepting the halt —
    // an app update may since have supplied the missing executor.
    const second = recoverOnLaunch(s.ledger, registry);
    expect(second.halted?.seq).toBe(2);
    expect(second.replayed).toEqual([]);
    expect(rows().map((r) => r.id)).toEqual(["txn-1"]);
  });
});

/**
 * R3 M2 — before this fix, a `LocalRefusal` met *during* replay (as opposed
 * to one already `blocked` from an earlier launch, above) fell into the
 * generic catch and called `haltAt`: `replay_halted`, and everything behind
 * it stopped, on every launch, forever — the mirror image of the bug M2
 * names. Now it is marked `blocked(refused)` in the same step `write.ts`
 * itself would have, and replay continues.
 */
describe("a refusal met during replay is blocked and skipped, not halted (R3 M2)", () => {
  it("marks it refused, applies the entries behind it, and does not halt", () => {
    intentOnly(1, "txn-1");
    intentOnly(2, "txn-2", "refuses");
    intentOnly(3, "txn-3");

    const recovery = recoverOnLaunch(s.ledger, registryWithFailures);

    expect(recovery.halted).toBeNull();
    expect(rows().map((r) => r.id)).toEqual(["txn-1", "txn-3"]);

    const [entry2] = s.ledger.outbox.db.select().from(outbox).where(eq(outbox.seq, 2)).all();
    expect(entry2?.state).toBe("blocked");
    expect(entry2?.blockedKind).toBe("terminal");
    expect(entry2?.disposition).toBe("refused");
    expect(entry2?.blockedReason).toBe("refuses on every attempt");
  });

  it("is not re-attempted on the next launch, same as a refusal write.ts itself marked", () => {
    intentOnly(1, "txn-1");
    intentOnly(2, "txn-2", "refuses");
    intentOnly(3, "txn-3");

    recoverOnLaunch(s.ledger, registryWithFailures);
    const second = recoverOnLaunch(s.ledger, registryWithFailures);

    expect(second.halted).toBeNull();
    expect(second.replayed).toEqual([]);
    expect(rows().map((r) => r.id)).toEqual(["txn-1", "txn-3"]);
  });
});

/**
 * R4 C2 — the counterpart for `LocalDeferral`: marked `disposition:
 * "deferred"`, `state` left `pending`, so — unlike a refusal — it is
 * genuinely retried at every launch, and succeeds the moment whatever local
 * state it was missing arrives.
 */
describe("a deferral met during replay is marked deferred, not blocked (R4 C2)", () => {
  it("does not halt, applies the entries behind it, and leaves the entry pending", () => {
    intentOnly(1, "txn-1");
    intentOnly(2, "txn-2", "defers");
    intentOnly(3, "txn-3");

    const recovery = recoverOnLaunch(s.ledger, registryWithFailures);

    expect(recovery.halted).toBeNull();
    expect(rows().map((r) => r.id)).toEqual(["txn-1", "txn-3"]);

    const [entry2] = s.ledger.outbox.db.select().from(outbox).where(eq(outbox.seq, 2)).all();
    expect(entry2?.state).toBe("pending");
    expect(entry2?.blockedKind).toBeNull();
    expect(entry2?.disposition).toBe("deferred");
  });

  it("is retried on the next launch, unlike a refusal, and applies once resolved", () => {
    intentOnly(1, "txn-1", "defers");

    const first = recoverOnLaunch(s.ledger, registryWithFailures);
    expect(first.halted).toBeNull();
    expect(first.replayed).toEqual([]);
    expect(rows()).toHaveLength(0);
    const [deferred] = s.ledger.outbox.db.select().from(outbox).where(eq(outbox.seq, 1)).all();
    expect(deferred?.disposition).toBe("deferred");

    // Whatever local state `apply` was missing has arrived by the next launch
    // — a fresh rate row, say. Nothing about the entry itself changed; only
    // what the executor can now do with it.
    deferGate = false;
    const second = recoverOnLaunch(s.ledger, registryWithFailures);

    expect(second.halted).toBeNull();
    expect(second.replayed).toHaveLength(1);
    expect(rows().map((r) => r.id)).toEqual(["txn-1"]);
    expect(readAppliedSeq(s.ledger.replica.db)).toBe(1);

    // Cleared the moment it actually applied — nothing left marking it as
    // still outstanding.
    const [resolved] = s.ledger.outbox.db.select().from(outbox).where(eq(outbox.seq, 1)).all();
    expect(resolved?.disposition).toBeNull();
  });
});

/**
 * R4 C2 — the finding this whole rename exists to fix: before it, a deferred
 * entry's `seq` sitting below a watermark a *later* entry advanced past it
 * made `outstanding`'s plain `gt(seq, applied)` filter hide it forever. Both
 * paths that can produce that shape are proven here: replay (this describe)
 * and `write.ts` itself (`write.test.ts`'s own mirror of this).
 */
describe("a deferred entry is not lost once a later entry advances the watermark past it (R4 C2)", () => {
  it("keeps finding it at every launch, and applies it once the missing state arrives", () => {
    intentOnly(1, "txn-1", "defers");
    intentOnly(2, "txn-2");

    const first = recoverOnLaunch(s.ledger, registryWithFailures);

    // Entry 2 genuinely applied, so the watermark reads 2 — *above* the
    // still-deferred entry 1's own seq. The old `gt(seq, applied)` filter
    // would have hidden entry 1 on every launch from here on.
    expect(readAppliedSeq(s.ledger.replica.db)).toBe(2);
    expect(first.replayed).toHaveLength(1);
    expect(rows().map((r) => r.id)).toEqual(["txn-2"]);

    const [deferred] = s.ledger.outbox.db.select().from(outbox).where(eq(outbox.seq, 1)).all();
    expect(deferred?.disposition).toBe("deferred");

    // A second launch, still deferred: still found, still retried, still not
    // applied — proving it was never hidden by the watermark in between.
    const second = recoverOnLaunch(s.ledger, registryWithFailures);
    expect(second.replayed).toEqual([]);
    expect(readAppliedSeq(s.ledger.replica.db)).toBe(2);

    // The missing state arrives. A third launch finds entry 1 again — by
    // `disposition`, not by `seq` versus a watermark that is already past
    // it — and applies it.
    deferGate = false;
    const third = recoverOnLaunch(s.ledger, registryWithFailures);
    expect(third.replayed).toHaveLength(1);
    expect(
      rows()
        .map((r) => r.id)
        .sort(),
    ).toEqual(["txn-1", "txn-2"]);

    const [resolved] = s.ledger.outbox.db.select().from(outbox).where(eq(outbox.seq, 1)).all();
    expect(resolved?.disposition).toBeNull();
  });

  it("holds with a deferral on both sides of an entry that applies in between", () => {
    // seq 1 and 3 both defer while seq 2 applies normally, in one launch.
    intentOnly(1, "txn-1", "defers");
    intentOnly(2, "txn-2");
    intentOnly(3, "txn-3", "defers");

    const first = recoverOnLaunch(s.ledger, registryWithFailures);
    expect(first.replayed).toHaveLength(1);
    expect(readAppliedSeq(s.ledger.replica.db)).toBe(2);

    const stillDeferred = s.ledger.outbox.db
      .select({ seq: outbox.seq, disposition: outbox.disposition })
      .from(outbox)
      .where(eq(outbox.disposition, "deferred"))
      .all();
    expect(stillDeferred.map((e) => e.seq).sort()).toEqual([1, 3]);

    deferGate = false;
    const second = recoverOnLaunch(s.ledger, registryWithFailures);
    // Both resolve in the same launch, in seq order.
    expect(second.replayed).toHaveLength(2);
    expect(
      rows()
        .map((r) => r.id)
        .sort(),
    ).toEqual(["txn-1", "txn-2", "txn-3"]);

    const remaining = s.ledger.outbox.db
      .select({ disposition: outbox.disposition })
      .from(outbox)
      .where(eq(outbox.disposition, "deferred"))
      .all();
    expect(remaining).toEqual([]);
  });
});

/**
 * R4 H1 — a `LocalRefusal` met while an earlier entry is itself still
 * `deferred` is not trustworthy: the refusal was decided against a replica
 * that is known incomplete (the deferred entry ahead of it has not written
 * its row yet), so it must not be treated as terminal.
 */
describe("a refusal caused by a deferral ahead of it is deferred, not refused (R4 H1)", () => {
  it("marks the refusal deferred rather than terminal while the entry ahead of it is still outstanding", () => {
    // 1 = create_transaction txn-A (deferred); 2 = an update that only
    // succeeds once txn-A exists, so it refuses — as long as 1 is still
    // outstanding, that refusal is untrustworthy.
    const updateInput = z.object({ id: z.string() });
    let deferFirst = true;
    const createsA = defineLocalExecutor<typeof CREATE_TRANSACTION, { id: string }, Tx>({
      operation: "creates_a",
      opVersion: 1,
      input: CREATE_TRANSACTION,
      mints: (input) => [input.id],
      apply: (input, tx) => {
        if (deferFirst) throw new LocalDeferral("no rate yet");
        const [row] = tx
          .insert(transactions)
          .values({
            id: id<"transactions">(input.id) as Id<"transactions">,
            date: accountingDate("2026-03-12"),
            type: "expense",
            accountId: id<"accounts">("acc-1"),
            amountOriginal: money.toMoney(input.amount_original),
            currency: currencyCode("PLN"),
            fxRate: money.pivotPerUnit("1.000000000000"),
          })
          .returning({ id: transactions.id })
          .all();
        if (!row) throw new Error("no row returned");
        return row;
      },
    });
    const updatesA = defineLocalExecutor<typeof updateInput, { id: string }, Tx>({
      operation: "updates_a",
      opVersion: 1,
      input: updateInput,
      mints: () => [],
      apply: (input, tx) => {
        const [row] = tx
          .select({ id: transactions.id })
          .from(transactions)
          .where(eq(transactions.id, id<"transactions">(input.id) as Id<"transactions">))
          .all();
        if (!row) throw new LocalRefusal(`no transaction ${input.id}`);
        return row;
      },
    });
    const registryH1 = localRegistry<Tx>([createsA, updatesA]);

    s.ledger.outbox.db
      .insert(outbox)
      .values({
        seq: 1,
        operation: "creates_a",
        opVersion: 1,
        payload: { id: "txn-A", amount_original: "18.00000000" },
        deps: [],
        capturedTz: "Europe/Warsaw",
        capturedOffsetMinutes: 60,
      })
      .run();
    s.ledger.outbox.db
      .insert(outbox)
      .values({
        seq: 2,
        operation: "updates_a",
        opVersion: 1,
        payload: { id: "txn-A" },
        deps: [],
        capturedTz: "Europe/Warsaw",
        capturedOffsetMinutes: 60,
      })
      .run();

    const first = recoverOnLaunch(s.ledger, registryH1);
    expect(first.halted).toBeNull();
    expect(first.replayed).toEqual([]);

    const [entry1, entry2] = s.ledger.outbox.db.select().from(outbox).orderBy(outbox.seq).all();
    expect(entry1?.disposition).toBe("deferred");
    expect(entry1?.state).toBe("pending");
    // The refusal is recorded as `deferred`, never `refused` — `refused`
    // would strand it forever once entry 1 does resolve.
    expect(entry2?.disposition).toBe("deferred");
    expect(entry2?.state).toBe("pending");

    // The rate arrives. Both resolve, in order, on the same launch: entry 1
    // applies first and creates the row, entry 2's refusal no longer fires.
    deferFirst = false;
    const second = recoverOnLaunch(s.ledger, registryH1);
    expect(second.replayed).toHaveLength(2);
    expect(rows().map((r) => r.id)).toEqual(["txn-A"]);

    const [resolved1, resolved2] = s.ledger.outbox.db
      .select()
      .from(outbox)
      .orderBy(outbox.seq)
      .all();
    expect(resolved1?.disposition).toBeNull();
    expect(resolved2?.disposition).toBeNull();
  });
});
