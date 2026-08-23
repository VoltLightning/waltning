/**
 * The device's half of the registry — `create_account` and `create_transaction`
 * as the phone applies them.
 *
 * `write.test.ts` proves the *path* with hand-written executors standing in for
 * real ones. This proves the real ones: that a capture materialises with the
 * columns the schema demands, that `mints` is right (the one mistake that
 * produces a 404 for something nobody did wrong), that the provisional rate is
 * resolved in the right direction, and that replaying an entry after a crash
 * reproduces the row — the property the whole registry exists for.
 *
 * The two-file harness, not the merged one: a write's two commits go to two
 * databases and a merged harness would make every crash test pass by
 * construction.
 */

import { accountingDate } from "@waltning/core/date";
import { type Id, id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import { createAccountExecutor } from "../accounts/create-account.executor.ts";
import type { LocalExecutor } from "../executor.ts";
import { readAppliedSeq } from "../migrate.ts";
import { recoverOnLaunch } from "../recover.ts";
import { ledgerRegistry } from "../registry.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import { createTransactionExecutor } from "../transactions/create-transaction.executor.ts";
import type { Capture, LocalTx, LocalWriteResult } from "../write.ts";
import { writeLocally } from "../write.ts";
import { type ScratchStores, scratchStores } from "./stores.ts";

const { accounts, currencies, fxRates, outbox, transactions } = schema;

/* ── placeholders ────────────────────────────────────────────────────────── */

/**
 * Ids are UUIDs because `zId` says so — `createTransactionInput` refuses
 * anything else, which is itself worth knowing: a test using `"acc-1"` would
 * fail at the parse and never reach an executor.
 */
const ACCOUNT_USD = id<"accounts">("11111111-1111-4111-8111-111111111111");
const ACCOUNT_PLN = id<"accounts">("22222222-2222-4222-8222-222222222222");
const ACCOUNT_CHF = id<"accounts">("33333333-3333-4333-8333-333333333333");
const ACCOUNT_NEW = id<"accounts">("44444444-4444-4444-8444-444444444444");
const TXN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TXN_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const USD = currencyCode("USD");
const PLN = currencyCode("PLN");
const CHF = currencyCode("CHF");

/**
 * The last-known rate for the pair, in `fx_rates`' own direction: **units per
 * pivot**, so 4.0231 PLN to one USD.
 *
 * Chosen so a reciprocal error is unmissable. At 1.0 or 2.0 a flipped rate is
 * either invisible or a factor most readers would not question; 4.0231 inverts
 * to 0.248564539783, which shares no digits with it.
 */
const PLN_PER_PIVOT = "4.0231";
const PIVOT_PER_PLN = "0.248564539783";

const capture: Capture = { timeZone: "Europe/Warsaw", offsetMinutes: 60 };

let s: ScratchStores;

beforeEach(() => {
  s = scratchStores();
  seed();
});

afterEach(() => {
  s?.close();
});

/**
 * The rows the executors' foreign keys point at.
 *
 * The replica has foreign keys **on**, so this is not scaffolding — an insert
 * naming a currency or an account that is not here is genuinely refused, which
 * is §14.6's *"the phone refuses what the server would refuse, at capture
 * time"* doing its job.
 */
function seed() {
  const db = s.ledger.replica.db;

  db.insert(currencies)
    .values([
      { code: USD, name: "Placeholder", isPivot: true },
      { code: PLN, name: "Placeholder" },
      { code: CHF, name: "Placeholder" },
    ])
    .run();

  db.insert(accounts)
    .values([
      { id: ACCOUNT_USD, name: "Bank A · USD", currency: USD },
      { id: ACCOUNT_PLN, name: "Bank B · PLN", currency: PLN },
      { id: ACCOUNT_CHF, name: "Bank C · CHF", currency: CHF },
    ])
    .run();

  db.insert(fxRates)
    .values([
      // Older, and must lose to the one below — "last-known" is a max over date.
      {
        base: USD,
        quote: PLN,
        date: accountingDate("2026-01-04"),
        rate: money.unitsPerPivot("3.1500"),
        source: "nbp",
      },
      {
        base: USD,
        quote: PLN,
        date: accountingDate("2026-03-01"),
        rate: money.unitsPerPivot(PLN_PER_PIVOT),
        source: "nbp",
      },
      /**
       * A row quoted the **other way round**, which §7.7 says is never stored
       * and which the `where` clause therefore excludes explicitly. If the
       * lookup filtered on `quote` alone, this newer row would win and the
       * transaction would be valued at 5× rather than 0.248×.
       */
      {
        base: PLN,
        quote: USD,
        date: accountingDate("2026-06-01"),
        rate: money.unitsPerPivot("5.0000"),
        source: "manual",
      },
    ])
    .run();
}

/* ── inputs ──────────────────────────────────────────────────────────────── */

const accountInput = (accountId: Id<"accounts">) => ({
  id: accountId,
  name: "Bank D · PLN",
  currency: "PLN",
});

const expenseInput = (txnId: string, accountId: Id<"accounts">, currency: string) => ({
  id: txnId,
  date: "2026-03-12",
  type: "expense",
  accountId,
  amountOriginal: "18.00",
  currency,
});

/**
 * A capture through the real path, with the real registry.
 *
 * The executor parameter is typed over `LocalTx<unknown, …>` — the same shape
 * the executors declare — so this helper proves at compile time that a driver-
 * agnostic executor is usable against a concrete `better-sqlite3` ledger. That
 * is the one thing about the `unknown` run-result that could have failed
 * quietly, and it fails here loudly instead.
 */
function write<Input extends z.ZodTypeAny, Row>(
  executor: LocalExecutor<Input, Row, LocalTx<unknown, typeof schema>>,
  input: unknown,
): LocalWriteResult<Row> {
  return writeLocally(s.ledger, { executor, registry: ledgerRegistry, input, capture });
}

const entries = () => s.ledger.outbox.db.select().from(outbox).all();
const txnRows = () => s.ledger.replica.db.select().from(transactions).all();

/* ── the capture lands ───────────────────────────────────────────────────── */

describe("create_account materialises and records its intent", () => {
  it("lands the row, the entry, and a watermark that matches", () => {
    const result = write(createAccountExecutor, accountInput(ACCOUNT_NEW));

    const rows = s.ledger.replica.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, ACCOUNT_NEW))
      .all();

    expect(rows).toHaveLength(1);
    expect(result.row.name).toBe("Bank D · PLN");
    // The defaults come from the shared schema, not from this executor — an
    // account nobody has classified is honestly `other` (§6.3).
    expect(result.row.kind).toBe("other");
    expect(result.row.openingBalance).toBe("0.00000000");

    const [entry] = entries();
    expect(entry?.operation).toBe("create_account");
    expect(entry?.opVersion).toBe(1);
    expect(readAppliedSeq(s.ledger.replica.db)).toBe(result.seq);
  });
});

describe("create_transaction materialises and records its intent", () => {
  it("lands the row, the entry, and a watermark that matches", () => {
    const result = write(createTransactionExecutor, expenseInput(TXN_A, ACCOUNT_USD, "USD"));

    expect(txnRows()).toHaveLength(1);
    expect(result.row.id).toBe(TXN_A);
    // `zMoney` normalises to the storage scale on the way in, so "18.00" and
    // "18" are the same stored value.
    expect(result.row.amountOriginal).toBe("18.00000000");
    expect(entries()[0]?.operation).toBe("create_transaction");
    expect(readAppliedSeq(s.ledger.replica.db)).toBe(result.seq);
  });

  it("refuses a payload the operation would refuse, before either store", () => {
    // A transfer with no destination leg — `createTransactionInput`'s own
    // refinement, reached here because the executor declares that schema rather
    // than one of its own.
    expect(() =>
      write(createTransactionExecutor, {
        ...expenseInput(TXN_A, ACCOUNT_USD, "USD"),
        type: "transfer",
      }),
    ).toThrow();

    expect(entries()).toHaveLength(0);
    expect(txnRows()).toHaveLength(0);
  });
});

/* ── mints ───────────────────────────────────────────────────────────────── */

describe("what a write mints is what a later write can depend on", () => {
  it("holds a transaction behind the account it names", () => {
    const account = write(createAccountExecutor, accountInput(ACCOUNT_NEW));
    const txn = write(createTransactionExecutor, expenseInput(TXN_A, ACCOUNT_NEW, "PLN"));

    // Once a backend is added, sending in the other order would name an account
    // it has never seen, and block — for something nobody did wrong.
    expect(txn.deps).toEqual([account.entryId]);
    expect(account.deps).toEqual([]);
  });

  it("invents no dependency on an account the server already has", () => {
    const txn = write(createTransactionExecutor, expenseInput(TXN_A, ACCOUNT_USD, "USD"));

    // `ACCOUNT_USD` was in the replica before any of this — nothing queued
    // mints it, so nothing may hold the capture back.
    expect(txn.deps).toEqual([]);
  });

  it("does not claim to mint the accounts a transaction merely names", () => {
    // The inverse mistake, and the expensive one: an operation that declared
    // `accountId` as minted would make every later write naming that account
    // depend on this entry, and a queue that serialises on an unrelated row is
    // one that stops draining the first time an entry blocks.
    expect(createTransactionExecutor.mintedIds(expenseInput(TXN_A, ACCOUNT_USD, "USD"))).toEqual([
      TXN_A,
    ]);
    expect(createAccountExecutor.mintedIds(accountInput(ACCOUNT_NEW))).toEqual([ACCOUNT_NEW]);
  });
});

/* ── the provisional rate ────────────────────────────────────────────────── */

describe("the rate the phone writes into a NOT NULL column", () => {
  it("writes exactly 1 when the transaction is already in the pivot currency", () => {
    const result = write(createTransactionExecutor, expenseInput(TXN_A, ACCOUNT_USD, "USD"));

    // Not an estimate — there is no conversion to be wrong about.
    expect(result.row.fxRate).toBe("1.000000000000");
  });

  it("flips the last-known rate exactly once, into pivot-per-unit", () => {
    const result = write(createTransactionExecutor, expenseInput(TXN_A, ACCOUNT_PLN, "PLN"));

    // `fx_rates.rate` is units per pivot and `transactions.fx_rate` is pivot per
    // unit. Storing 4.0231 here would value an 18 PLN coffee at 72 USD.
    expect(result.row.fxRate).toBe(PIVOT_PER_PLN);
    expect(result.row.fxRate).not.toBe("4.023100000000");
  });

  it("prefers a rate the caller asserted over anything cached", () => {
    // §7.6 level 1 — the rate your bank actually applied. The server has no
    // better source for it, and the cache is not evidence about this payment.
    const result = write(createTransactionExecutor, {
      ...expenseInput(TXN_A, ACCOUNT_PLN, "PLN"),
      fxRate: "0.2400",
    });

    expect(result.row.fxRate).toBe("0.2400");
  });

  it("refuses a cross-currency capture it cannot value, and keeps the intent", () => {
    // CHF is in the ledger and has no rate row — a currency added while the
    // phone was offline. Writing 1 here would value a CHF row as if it were
    // USD, in every pivot total on the dashboard, with nothing marking it.
    expect(() => write(createTransactionExecutor, expenseInput(TXN_A, ACCOUNT_CHF, "CHF"))).toThrow(
      /no last-known rate for USD\/CHF/,
    );

    // The capture is not lost. The outbox entry committed first (§14.6), so
    // this is the ordinary crash window: the write drains to a server that can
    // value it, and the row is honestly missing until it does.
    expect(entries()).toHaveLength(1);
    expect(txnRows()).toHaveLength(0);
    expect(readAppliedSeq(s.ledger.replica.db)).toBe(0);
  });

  it("refuses rather than guessing when the replica names no pivot currency", () => {
    s.ledger.replica.db.update(currencies).set({ isPivot: false }).run();

    // Without a pivot, "is this currency the pivot?" is unanswerable — and `1`
    // is only correct if the answer is yes.
    expect(() => write(createTransactionExecutor, expenseInput(TXN_A, ACCOUNT_USD, "USD"))).toThrow(
      /no pivot currency/,
    );
  });

  it("does not stamp the destination rate, which the column lets it leave open", () => {
    const result = write(createTransactionExecutor, {
      id: TXN_A,
      date: "2026-03-12",
      type: "transfer",
      accountId: ACCOUNT_USD,
      amountOriginal: "100.00",
      currency: "USD",
      toAccountId: ACCOUNT_PLN,
      // Typed by the person, never derived from the cache: deriving it values
      // both legs at the same pivot amount and §7.5's margin is then
      // identically zero for every transfer in the ledger.
      toAmount: "402.31",
      toCurrency: "PLN",
    });

    expect(result.row.toFxRate).toBeNull();
    expect(result.row.toAmount).toBe("402.31000000");
    // The server answers this at drain; `false` is the column's default and not
    // a claim this executor made.
    expect(result.row.fxRateEstimated).toBe(false);
  });
});

/* ── replay ──────────────────────────────────────────────────────────────── */

describe("an entry replayed after a crash produces the same row", () => {
  /** Everything except the identity and the row's own bookkeeping. */
  const shape = (row: typeof transactions.$inferSelect) => {
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = row;
    return rest;
  };

  it("reapplies a create_transaction the replica half never saw", () => {
    // A real capture first, so the payload replayed below is exactly what
    // `writeLocally` stores — parsed, branded, normalised — rather than a
    // hand-written approximation of it.
    const landed = write(createTransactionExecutor, expenseInput(TXN_A, ACCOUNT_PLN, "PLN"));
    const [first] = s.ledger.outbox.db
      .select()
      .from(outbox)
      .where(eq(outbox.id, landed.entryId))
      .all();
    if (!first) throw new Error("the capture wrote no entry");

    // The crash: the second capture's intent is durable and its effect is not.
    // Nothing simulates a kill — the work simply is not done, which is the
    // state a kill leaves.
    s.ledger.outbox.db
      .insert(outbox)
      .values({
        seq: 2,
        operation: "create_transaction",
        opVersion: 1,
        payload: { ...first.payload, id: TXN_B },
        deps: [],
        capturedTz: capture.timeZone,
        capturedOffsetMinutes: capture.offsetMinutes,
      })
      .run();

    s.reopen();
    const recovery = recoverOnLaunch(s.ledger, ledgerRegistry);

    expect(recovery.halted).toBeNull();
    expect(recovery.replayed).toHaveLength(1);
    expect(readAppliedSeq(s.ledger.replica.db)).toBe(2);

    const rows = txnRows();
    expect(rows.map((row) => row.id).sort()).toEqual([TXN_A, TXN_B].sort());

    const applied = rows.find((row) => row.id === TXN_A);
    const replayed = rows.find((row) => row.id === TXN_B);
    if (!applied || !replayed) throw new Error("both rows must exist");
    // The whole point of an addressable executor: the closure that knew how to
    // apply this is long gone, and the operation *name* found it again.
    expect(shape(replayed)).toEqual(shape(applied));
    // Including the rate, which is resolved at apply and therefore resolved
    // again here — from the same replica, so to the same number.
    expect(replayed.fxRate).toBe(PIVOT_PER_PLN);
  });

  it("reapplies a create_account over a row that is already there", () => {
    write(createAccountExecutor, accountInput(ACCOUNT_NEW));

    /**
     * **A refetch, not a crash** — §14.6: *"a refetch resets the watermark to
     * nothing, which is correct rather than exceptional"*, and the outbox keeps
     * its entries through it because the two are separate files. So replay meets
     * an entry whose row is already present. The upsert is what makes that a
     * no-op rather than a primary-key violation, which `recover.ts` would treat
     * as terminal and halt on — blocking every entry behind a row that was
     * already correct.
     */
    s.ledger.replica.db.run(sql`update "local_meta" set "applied_seq" = 0 where "id" = 1`);

    const recovery = recoverOnLaunch(s.ledger, ledgerRegistry);

    expect(recovery.halted).toBeNull();
    expect(recovery.replayed).toHaveLength(1);
    const rows = s.ledger.replica.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, ACCOUNT_NEW))
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Bank D · PLN");
  });
});
