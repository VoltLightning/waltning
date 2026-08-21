/**
 * The local write path, tested on the property that matters: **both, or
 * neither.**
 *
 * `architecture/14` §14.1 says a write materialises into the local tables and
 * records its intent in the outbox. Two separate statements would satisfy that
 * sentence and still be wrong, because a process can die between them — iOS
 * force-quit gives no callback at all — and both halves of the failure are
 * silent:
 *
 * - a row with no entry looks like an ordinary transaction and never reaches a
 *   server;
 * - an entry with no row sends a write for something that is not there.
 *
 * So the tests below do not check that two writes happened. They check that a
 * failure between them leaves nothing.
 */

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { outbox, transactions } from "../schema.ts";

import { writeLocally } from "../write.ts";
import { type LedgerTx, type Scratch, scratchLedger } from "./scratch.ts";

let s: Scratch;

beforeEach(() => {
  s = scratchLedger();
});

afterEach(() => {
  s?.close();
});

/** A capture, as `create_transaction` would hand it over. */
const capture = {
  operation: "create_transaction",
  opVersion: 1,
  payload: { account_id: "acc-1", amount_original: "18.00000000" },
};

function insertTransaction(id: string) {
  return (tx: LedgerTx) =>
    tx
      .insert(transactions)
      .values({
        id,
        date: "2026-03-12",
        type: "expense",
        accountId: "acc-1",
        amountOriginal: "18.00000000",
        currency: "PLN",
        fxRate: "1.000000000000",
      })
      .returning()
      .all()[0];
}

describe("a write with no backend in existence", () => {
  it("is on the ledger immediately, with exactly one outbox entry", () => {
    const result = writeLocally(s.db, { ...capture, apply: insertTransaction("txn-1") });

    const rows = s.db.select().from(transactions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("txn-1");

    const entries = s.db.select().from(outbox).all();
    expect(entries, "exactly one entry — not zero, not two").toHaveLength(1);
    expect(entries[0]?.id).toBe(result.entryId);
    expect(entries[0]?.operation).toBe("create_transaction");
    expect(entries[0]?.state, "queued, not sent — there is nothing to send to").toBe("pending");
  });

  it("records the payload as the drain will replay it", () => {
    writeLocally(s.db, { ...capture, apply: insertTransaction("txn-1") });

    const [entry] = s.db.select().from(outbox).all();
    // Read back through the driver, not from the object we passed in: `json`
    // mode has to survive the round trip or the drain replays a string.
    expect(entry?.payload).toEqual(capture.payload);
    expect(entry?.opVersion, "the version at capture, for the upcasters (C24)").toBe(1);
  });

  it("orders entries by `seq`, which is not the id and not the clock", () => {
    writeLocally(s.db, { ...capture, apply: insertTransaction("txn-1") });
    writeLocally(s.db, { ...capture, apply: insertTransaction("txn-2") });
    writeLocally(s.db, { ...capture, apply: insertTransaction("txn-3") });

    const seqs = s.db
      .select({ seq: outbox.seq })
      .from(outbox)
      .all()
      .map((e) => e.seq);
    expect(
      seqs.sort((a, b) => a - b),
      "consecutive, allocated inside the transaction",
    ).toEqual([1, 2, 3]);
  });
});

describe("a failure between the two writes leaves neither", () => {
  /**
   * **The card's own acceptance, and the reason the path is one transaction.**
   *
   * Throwing from `apply` stands in for the process dying: whatever the local
   * tables had done is undone, and no entry is left pointing at a row that does
   * not exist.
   */
  it("rolls back the row when applying it fails", () => {
    expect(() =>
      writeLocally(s.db, {
        ...capture,
        apply: (tx) => {
          insertTransaction("txn-1")(tx);
          throw new Error("killed mid-write");
        },
      }),
    ).toThrow("killed mid-write");

    expect(s.db.select().from(transactions).all(), "no orphan row").toHaveLength(0);
    expect(s.db.select().from(outbox).all(), "no orphan entry").toHaveLength(0);
  });

  /**
   * The other direction, and the one a two-statement implementation gets wrong
   * most often: the row lands, the entry does not, and the ledger looks
   * perfectly normal while that transaction can never reach a server.
   */
  it("rolls back the row when the outbox insert fails", () => {
    // Remove the table the second half writes to. The first half still
    // succeeds, which is precisely the shape of the bug.
    s.sqlite.exec("drop table outbox");

    expect(() => writeLocally(s.db, { ...capture, apply: insertTransaction("txn-1") })).toThrow();

    expect(
      s.db.select().from(transactions).all(),
      "the row must not survive an entry that failed",
    ).toHaveLength(0);
  });

  it("leaves earlier writes untouched", () => {
    writeLocally(s.db, { ...capture, apply: insertTransaction("txn-1") });

    expect(() =>
      writeLocally(s.db, {
        ...capture,
        apply: () => {
          throw new Error("killed mid-write");
        },
      }),
    ).toThrow();

    // A rollback that took the whole database with it would be a worse bug than
    // the one being prevented.
    expect(s.db.select().from(transactions).all()).toHaveLength(1);
    expect(s.db.select().from(outbox).all()).toHaveLength(1);
  });
});

describe("the ledger survives the app going away", () => {
  it("a committed write is still there on the next open", () => {
    writeLocally(s.db, { ...capture, apply: insertTransaction("txn-1") });

    // The nearest thing to a force-quit an in-memory database allows: drop
    // every prepared statement and read again through a fresh query path. The
    // durable version of this belongs to the migrator card, which owns the file
    // on disk.
    const rows = s.sqlite.prepare("select id from transactions where id = ?").all("txn-1");
    const entries = s.sqlite.prepare("select state from outbox").all();

    expect(rows).toHaveLength(1);
    expect(entries).toHaveLength(1);
  });

  it("an entry can be found by the id the caller was given", () => {
    const { entryId } = writeLocally(s.db, { ...capture, apply: insertTransaction("txn-1") });

    // That id is the idempotency key the server deduplicates on, so a caller
    // that cannot find its own entry cannot retry safely.
    const found = s.db.select().from(outbox).where(eq(outbox.id, entryId)).all();
    expect(found).toHaveLength(1);
  });
});
