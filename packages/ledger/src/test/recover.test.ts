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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineLocalExecutor, localRegistry } from "../executor.ts";
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
});
