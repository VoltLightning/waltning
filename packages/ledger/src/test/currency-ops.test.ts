/**
 * The seven FX operations, as the phone applies them — `add_currency`
 * `archive_currency` `set_rate_source` `set_pinned` `change_pivot`
 * `set_manual_rate` `clear_manual_rate` — plus `readRate`, `readCoverage`
 * and `listFxRates`.
 *
 * Same harness as `account-ops.test.ts` and `category-ops.test.ts`: real
 * two-file writes through `writeLocally` and the real `ledgerRegistry`.
 */

import { accountingDate, addDays } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { updateCurrencyInput } from "@waltning/core/registry/inputs";
import Database from "better-sqlite3";
import { and, eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { addCurrencyExecutor } from "../currencies/add-currency.executor.ts";
import { archiveCurrencyExecutor } from "../currencies/archive-currency.executor.ts";
import {
  assertEveryDerivedRowTraces,
  changePivotExecutor,
  type PendingRow,
} from "../currencies/change-pivot.executor.ts";
import { clearManualRateExecutor } from "../currencies/clear-manual-rate.executor.ts";
import { readCurrencies } from "../currencies/read-currencies.ts";
import { readCurrencySettings } from "../currencies/read-currency-settings.ts";
import {
  listFxRates,
  readCoverage,
  readCrossRate,
  readNearestRate,
  readRate,
} from "../currencies/read-rate.ts";
import { setManualRateExecutor } from "../currencies/set-manual-rate.executor.ts";
import { setPinnedExecutor } from "../currencies/set-pinned.executor.ts";
import { setRateSourceExecutor } from "../currencies/set-rate-source.executor.ts";
import { updateCurrencyExecutor } from "../currencies/update-currency.executor.ts";
import type { LocalExecutor } from "../executor.ts";
import { recoverOnLaunch } from "../recover.ts";
import { ledgerRegistry } from "../registry.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import { createTransactionExecutor } from "../transactions/create-transaction.executor.ts";
import { deleteTransactionExecutor } from "../transactions/delete-transaction.executor.ts";
import type { Capture, LocalTx, LocalWriteResult } from "../write.ts";
import { writeLocally } from "../write.ts";
import { type ScratchStores, scratchStores } from "./stores.ts";

const { accounts, currencies, fxRates, outbox, recurringTransactions, transactions } = schema;

const PLN = currencyCode("PLN");
const USD = currencyCode("USD");
const EUR = currencyCode("EUR");
const GBP = currencyCode("GBP");
const ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const TXN = id<"transactions">("22222222-2222-4222-8222-222222222222");

const capture: Capture = { timeZone: "Europe/Warsaw", offsetMinutes: 60 };

let s: ScratchStores;

beforeEach(() => {
  s = scratchStores();
  s.ledger.replica.db
    .insert(currencies)
    .values([
      { code: PLN, name: "Placeholder", decimals: 2, isPivot: true },
      { code: USD, name: "Placeholder", decimals: 2 },
      { code: EUR, name: "Placeholder", decimals: 2 },
    ])
    .run();
  s.ledger.replica.db
    .insert(accounts)
    .values({ id: ACCOUNT, name: "Bank A · PLN", currency: PLN })
    .run();
});

afterEach(() => s?.close());

function write<Input extends z.ZodTypeAny, Row>(
  executor: LocalExecutor<Input, Row, LocalTx<unknown, typeof schema>>,
  input: unknown,
): LocalWriteResult<Row> {
  return writeLocally(s.ledger, { executor, registry: ledgerRegistry, input, capture });
}

const entries = () => s.ledger.outbox.db.select().from(outbox).all();

const currencyRow = (code: string) =>
  s.ledger.replica.db
    .select()
    .from(currencies)
    .where(eq(currencies.code, currencyCode(code)))
    .all()[0];

const rateRows = () => s.ledger.replica.db.select().from(fxRates).all();

/* ── add_currency ────────────────────────────────────────────────────────── */

describe("add_currency", () => {
  it("lands with the given fields and archived/isPivot false", () => {
    const result = write(addCurrencyExecutor, { code: "chf", name: "Swiss Franc" });

    expect(result.row.code).toBe("CHF");
    expect(result.row.archived).toBe(false);
    expect(result.row.isPivot).toBe(false);
  });

  it("mints its own code, not a uuid", () => {
    expect(addCurrencyExecutor.mintedIds({ code: "chf", name: "Swiss Franc" })).toEqual(["CHF"]);
  });

  it("refuses a code that already exists, live", () => {
    expect(() => write(addCurrencyExecutor, { code: "USD", name: "US Dollar" })).toThrow(
      /already exists/,
    );
  });

  it("refuses a code that already exists, archived — and names the fix", () => {
    s.ledger.replica.db
      .update(currencies)
      .set({ archived: true })
      .where(eq(currencies.code, USD))
      .run();

    expect(() => write(addCurrencyExecutor, { code: "USD", name: "US Dollar" })).toThrow(
      /un-archive/,
    );
  });
});

/* ── archive_currency ────────────────────────────────────────────────────── */

describe("archive_currency", () => {
  it("archives a currency nothing references", () => {
    const result = write(archiveCurrencyExecutor, { code: "EUR", version: 1 });
    expect(result.row.archived).toBe(true);
  });

  it("refuses the pivot", () => {
    expect(() => write(archiveCurrencyExecutor, { code: "PLN", version: 1 })).toThrow(
      /is the pivot/,
    );
  });

  it("refuses a currency a live account still references", () => {
    s.ledger.replica.db
      .insert(accounts)
      .values({
        id: id<"accounts">("33333333-3333-4333-8333-333333333333"),
        name: "Cash · USD",
        currency: USD,
      })
      .run();

    expect(() => write(archiveCurrencyExecutor, { code: "USD", version: 1 })).toThrow(
      /live account/,
    );
  });

  it("refuses a currency a live transaction still references", () => {
    s.ledger.replica.db
      .insert(transactions)
      .values({
        id: TXN,
        date: accountingDate("2026-03-12"),
        type: "expense",
        accountId: ACCOUNT,
        amountOriginal: money.toMoney("10.00"),
        currency: EUR,
        fxRate: money.pivotPerUnit("1"),
      })
      .run();

    expect(() => write(archiveCurrencyExecutor, { code: "EUR", version: 1 })).toThrow(
      /live transaction/,
    );
  });

  it("refuses a stale version", () => {
    write(archiveCurrencyExecutor, { code: "EUR", version: 1 });
    expect(() => write(archiveCurrencyExecutor, { code: "EUR", version: 1 })).toThrow();
  });

  // BLOCKER — a live transaction can reference a currency through
  // `debt_currency` alone (§7, `coalesce(debt_currency, currency)`): a
  // `currency: USD` transaction with `counterpartyRole: 'debt'` and
  // `debtCurrency: EUR` names EUR, and archiving EUR must be refused just as
  // it would be if EUR were the transaction's own `currency`.
  it("refuses a currency a live transaction references only through debt_currency", () => {
    s.ledger.replica.db
      .insert(transactions)
      .values({
        id: TXN,
        date: accountingDate("2026-03-12"),
        type: "expense",
        accountId: ACCOUNT,
        amountOriginal: money.toMoney("10.00"),
        currency: USD,
        fxRate: money.pivotPerUnit("1"),
        counterpartyRole: "debt",
        debtCurrency: EUR,
        debtAmount: money.toMoney("10.00"),
      })
      .run();

    expect(() => write(archiveCurrencyExecutor, { code: "EUR", version: 1 })).toThrow(
      /live transaction/,
    );
  });
});

/* ── update_currency ──────────────────────────────────────────────────────── */

describe("update_currency", () => {
  it("patches symbol, symbolPosition and decimals, and bumps the version", () => {
    const result = write(updateCurrencyExecutor, {
      code: "USD",
      version: 1,
      patch: { symbol: "US$", symbolPosition: "P", decimals: 2 },
    });
    expect(result.row.symbol).toBe("US$");
    expect(result.row.symbolPosition).toBe("P");
    expect(result.row.decimals).toBe(2);
    expect(result.row.version).toBe(2);
  });

  it("refuses a stale version", () => {
    write(updateCurrencyExecutor, { code: "USD", version: 1, patch: { decimals: 0 } });
    expect(() =>
      write(updateCurrencyExecutor, { code: "USD", version: 1, patch: { decimals: 3 } }),
    ).toThrow(/stale version/);
  });

  it("refuses an empty patch at the schema, before it ever reaches the executor", () => {
    const parsed = updateCurrencyInput.safeParse({ code: "USD", version: 1, patch: {} });
    expect(parsed.success).toBe(false);
  });

  it("never touches the code, rateSource, pinned or isPivot — each has its own operation", () => {
    const result = write(updateCurrencyExecutor, {
      code: "USD",
      version: 1,
      patch: { symbol: "US$" },
    });
    expect(result.row.code).toBe("USD");
    expect(result.row.pinned).toBe(false);
    expect(result.row.isPivot).toBe(false);
  });

  // H5 — shrinking `decimals` truncates every existing figure in that
  // currency (`4.20` at 2dp reads `4` at 0dp). Refused while a live account
  // or transaction still holds the currency; allowed once nothing does.
  describe("a decimals decrease (H5)", () => {
    it("is refused, naming the count, while a live account holds the currency", () => {
      s.ledger.replica.db
        .insert(accounts)
        .values({
          id: id("33333333-3333-4333-8333-333333333333"),
          name: "Bank B · EUR",
          currency: EUR,
        })
        .run();

      expect(() =>
        write(updateCurrencyExecutor, { code: "EUR", version: 1, patch: { decimals: 0 } }),
      ).toThrow(/1 live account/);
    });

    it("is refused while a live transaction holds the currency", () => {
      write(createTransactionExecutor, {
        id: TXN,
        date: accountingDate("2026-03-12"),
        type: "expense",
        accountId: ACCOUNT,
        amountOriginal: money.toMoney("10.00"),
        currency: PLN,
      });

      // PLN is the pivot, but `update_currency` has no pivot guard (unlike
      // `archive_currency`) — the write itself only cares about references.
      // `ACCOUNT` (`beforeEach`) plus this transaction is two live refs.
      expect(() =>
        write(updateCurrencyExecutor, { code: "PLN", version: 1, patch: { decimals: 0 } }),
      ).toThrow(/2 live account\(s\)\/transaction\(s\)/);
    });

    it("is allowed on a currency nothing live holds", () => {
      const result = write(updateCurrencyExecutor, {
        code: "EUR",
        version: 1,
        patch: { decimals: 0 },
      });
      expect(result.row.decimals).toBe(0);
    });

    /**
     * H3 — `anyStoredFigureOverScale` (the local mirror of C1's
     * `assert_currency_decimals_safe`) omitted `recurring_transactions`
     * entirely: the phone admitted a shrink Postgres already refuses for
     * this table.
     */
    it("is refused while a recurring transaction's own amount would land over the new scale (H3)", () => {
      s.ledger.replica.db
        .insert(recurringTransactions)
        .values({
          id: id("44444444-4444-4444-8444-444444444444"),
          type: "expense",
          accountId: ACCOUNT,
          amountOriginal: money.toMoney("1.005"),
          currency: EUR,
          rrule: "FREQ=MONTHLY",
        })
        .run();

      expect(() =>
        write(updateCurrencyExecutor, { code: "EUR", version: 1, patch: { decimals: 1 } }),
      ).toThrow(/figure already stored/);
    });

    /**
     * M1 — a soft-deleted transaction used to be invisible to this scan
     * (`isNull(transactions.deletedAt)`), so a shrink under it was wrongly
     * admitted; a later restore would then walk the row past the guarantee
     * with nothing left to catch it.
     */
    it("is refused while the only over-scale transaction is soft-deleted (M1)", () => {
      // Raw, already soft-deleted — bypassing `create_transaction` entirely
      // (both its own scale check and its FX-rate resolution, neither of
      // which this scenario is about) the same way a real FX-converted
      // figure can fold to sub-cent precision at 8dp and a row can be
      // soft-deleted long before a currency's own decimals ever shrink.
      s.ledger.replica.db
        .insert(transactions)
        .values({
          id: TXN,
          date: accountingDate("2026-03-12"),
          type: "expense",
          accountId: ACCOUNT,
          amountOriginal: money.toMoney("18.005"),
          currency: EUR,
          fxRate: money.pivotPerUnit("1"),
          deletedAt: new Date(),
        })
        .run();

      expect(() =>
        write(updateCurrencyExecutor, { code: "EUR", version: 1, patch: { decimals: 1 } }),
      ).toThrow(/figure already stored/);
    });

    /**
     * H — before `validate` existed on this executor, this exact refusal ran
     * only inside `apply`, *after* the outbox entry had already committed
     * (`write.ts`'s ordering) — leaving a stuck entry `recoverOnLaunch` would
     * halt on terminally at every later launch, since a refused shrink is
     * never recoverable by a replay of the identical input. `validate` (run
     * before the outbox transaction even opens) is what keeps this refusal
     * from ever reaching the outbox at all.
     */
    it("a refused shrink leaves no outbox entry, and a later launch replays nothing", () => {
      s.ledger.replica.db
        .insert(transactions)
        .values({
          id: TXN,
          date: accountingDate("2026-03-12"),
          type: "expense",
          accountId: ACCOUNT,
          amountOriginal: money.toMoney("18.005"),
          currency: EUR,
          fxRate: money.pivotPerUnit("1"),
          deletedAt: new Date(),
        })
        .run();

      expect(() =>
        write(updateCurrencyExecutor, { code: "EUR", version: 1, patch: { decimals: 1 } }),
      ).toThrow(/figure already stored/);
      expect(entries()).toHaveLength(0);

      s.reopen();
      const recovery = recoverOnLaunch(s.ledger, ledgerRegistry);
      expect(recovery.halted).toBeNull();
      expect(recovery.replayed).toHaveLength(0);
    });

    it("growing decimals is allowed even while a live account holds the currency", () => {
      s.ledger.replica.db
        .insert(accounts)
        .values({
          id: id("33333333-3333-4333-8333-333333333333"),
          name: "Bank B · EUR",
          currency: EUR,
        })
        .run();

      const result = write(updateCurrencyExecutor, {
        code: "EUR",
        version: 1,
        patch: { decimals: 4 },
      });
      expect(result.row.decimals).toBe(4);
    });
  });
});

/* ── set_rate_source / set_pinned ────────────────────────────────────────── */

describe("set_rate_source", () => {
  it("writes the source and bumps the version", () => {
    const result = write(setRateSourceExecutor, { code: "USD", version: 1, rateSource: "ecb" });
    expect(result.row.rateSource).toBe("ecb");
    expect(result.row.version).toBe(2);
  });

  it("accepts null — no source chosen", () => {
    write(setRateSourceExecutor, { code: "USD", version: 1, rateSource: "ecb" });
    const result = write(setRateSourceExecutor, { code: "USD", version: 2, rateSource: null });
    expect(result.row.rateSource).toBeNull();
  });
});

describe("set_pinned", () => {
  it("pins a currency to the header toggle", () => {
    const result = write(setPinnedExecutor, { code: "USD", version: 1, pinned: true });
    expect(result.row.pinned).toBe(true);
  });
});

/* ── change_pivot ────────────────────────────────────────────────────────── */

describe("change_pivot", () => {
  it("refuses while any transaction exists", () => {
    s.ledger.replica.db
      .insert(transactions)
      .values({
        id: TXN,
        date: accountingDate("2026-03-12"),
        type: "expense",
        accountId: ACCOUNT,
        amountOriginal: money.toMoney("10.00"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
      })
      .run();

    expect(() => write(changePivotExecutor, { code: "USD" })).toThrow(/cannot re-rate/);
  });

  it("refuses a currency that is already the pivot", () => {
    expect(() => write(changePivotExecutor, { code: "PLN" })).toThrow(/already the pivot/);
  });

  // SHOULD-FIX — `computations.md` §1's T: a soft-deleted transaction is not
  // live and must not count against "any transaction exists", the same rule
  // every other read in this file already applies with `deleted_at is null`.
  it("is allowed once the only transaction has been soft-deleted", () => {
    write(createTransactionExecutor, {
      id: TXN,
      date: accountingDate("2026-03-12"),
      type: "expense",
      accountId: ACCOUNT,
      amountOriginal: money.toMoney("10.00"),
      currency: PLN,
    });
    write(deleteTransactionExecutor, { id: TXN, version: 1 });

    expect(() => write(changePivotExecutor, { code: "USD" })).not.toThrow();
  });

  /**
   * PLN (old pivot) → USD (new pivot), with a bridge rate of 0.25 USD per
   * PLN. Chosen so every quotient is exact — this proves the *direction* of
   * the rewrite, not decimal.js's own rounding.
   */
  it("rewrites every fx_rates row by division, and flips isPivot", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.25"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: EUR,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.23"),
          source: "nbp",
        },
      ])
      .run();

    const result = write(changePivotExecutor, { code: "USD" });

    expect(result.row.isPivot).toBe(true);
    expect(currencyRow("PLN")?.isPivot).toBe(false);

    const rows = rateRows();
    expect(rows).toHaveLength(2); // the PLN→USD bridge is consumed, not left standing

    const usdToPln = rows.find((r) => r.base === USD && r.quote === PLN);
    const usdToEur = rows.find((r) => r.base === USD && r.quote === EUR);
    // 1 PLN = 0.25 USD  ⇒  1 USD = 4 PLN
    expect(usdToPln?.rate).toBe(money.unitsPerPivot("4"));
    // 1 PLN = 0.23 EUR, 1 PLN = 0.25 USD  ⇒  1 USD = 0.23/0.25 = 0.92 EUR
    expect(usdToEur?.rate).toBe(money.unitsPerPivot("0.92"));
  });

  it("drops a date with no bridging rate rather than leaving it mis-quoted", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values({
        base: PLN,
        quote: EUR,
        date: accountingDate("2026-01-01"),
        rate: money.unitsPerPivot("0.23"),
        source: "nbp",
      })
      .run();

    write(changePivotExecutor, { code: "USD" });

    expect(rateRows()).toHaveLength(0);
  });

  // C2 — a carried-forward row copies its rate from an earlier real quote;
  // dropping that origin's date (no bridge) and keeping the carried child
  // would leave a row whose rate traces to nothing. §7.6: never invented.
  it("drops a carried_forward row along with an origin whose date had no bridge", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        // Day 1 — EUR's real quote, no bridge to USD this day: dropped.
        {
          base: PLN,
          quote: EUR,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.23"),
          source: "nbp",
        },
        // Day 2 — the bridge to USD, and EUR carried forward from day 1.
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-02"),
          rate: money.unitsPerPivot("0.25"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: EUR,
          date: accountingDate("2026-01-02"),
          rate: money.unitsPerPivot("0.23"),
          source: "carried_forward",
        },
      ])
      .run();

    write(changePivotExecutor, { code: "USD" });

    const rows = rateRows();
    // EUR's carried row is gone with its dead origin, on a date that
    // otherwise had a bridge and would have rebased it.
    expect(rows.find((r) => r.quote === "EUR")).toBeUndefined();
    // The bridge's own reciprocal still lands.
    expect(rows.find((r) => r.base === "USD" && r.quote === "PLN")).toBeDefined();
  });

  // C1/C2-r6 — a carried leg holds no rate of its own, only a copy of an
  // earlier real quote, so the rewrite does not re-base it at all: the
  // origin's own date produces the `derived` row, and carry-forward reaches
  // it at *read* time with the true age. Writing a rebased copy instead put
  // the staleness into `source`, which is provenance and not a clock.
  it("C1-r6 — drops a carried_forward leg; its origin's date carries the pair, read-side", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        // Day 1 — EUR's real quote, and the bridge to USD.
        {
          base: PLN,
          quote: EUR,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.23"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.25"),
          source: "nbp",
        },
        // Day 2 — EUR carried forward from day 1, and its own bridge.
        {
          base: PLN,
          quote: EUR,
          date: accountingDate("2026-01-02"),
          rate: money.unitsPerPivot("0.23"),
          source: "carried_forward",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-02"),
          rate: money.unitsPerPivot("0.20"),
          source: "nbp",
        },
      ])
      .run();

    write(changePivotExecutor, { code: "USD" });

    const rows = rateRows();
    const eurRows = rows.filter((r) => r.base === "USD" && r.quote === "EUR");
    // One row, on the origin's own date: 0.23 / 0.25 = 0.92, stamped for what
    // produced it. Day 2's carried copy is simply not written.
    expect(eurRows).toHaveLength(1);
    expect(eurRows[0]?.date).toBe(accountingDate("2026-01-01"));
    expect(eurRows[0]?.source).toBe("derived");
    expect(eurRows[0]?.rate).toBe(money.unitsPerPivot("0.92"));

    // …and day 2 still answers, by carrying forward one day from that row —
    // an honest age, where the written copy claimed none at all.
    const day2 = readRate(s.ledger.replica.db, {
      base: USD,
      quote: EUR,
      date: accountingDate("2026-01-02"),
    });
    expect(day2?.rate).toBe(money.unitsPerPivot("0.92"));
    expect(day2?.carriedDays).toBe(1);
  });

  // M8-r6 — §7.6: a carried row is a copy of the nearest earlier real quote,
  // and that must still hold after a pivot rewrite. Re-basing a carried row
  // by *its own date's* bridge (0.20 on day 2) would make it 0.23/0.20 =
  // 1.15 while its origin became 0.23/0.25 = 0.92 — one stored rate, two
  // rebased answers, a copy of nothing. Dropping the copy outright settles
  // the question: there is one row, on the origin's date, and every later
  // day reads it through carry-forward rather than through a second figure.
  it("M8-r6 — a carried copy never becomes a second, differently-rebased answer", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.25"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-02"),
          rate: money.unitsPerPivot("0.20"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: EUR,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.23"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: EUR,
          date: accountingDate("2026-01-02"),
          rate: money.unitsPerPivot("0.23"),
          source: "carried_forward",
        },
      ])
      .run();

    write(changePivotExecutor, { code: "USD" });

    const eurRows = rateRows().filter((r) => r.base === "USD" && r.quote === "EUR");
    // One row only — the origin's — at 0.23 / 0.25 = 0.92. Never a second at
    // the carried row's own-date bridge answer of 0.23 / 0.20 = 1.15.
    expect(eurRows).toHaveLength(1);
    expect(eurRows.map((r) => r.rate)).toEqual([money.unitsPerPivot("0.92")]);
    expect(eurRows.map((r) => r.date)).toEqual([accountingDate("2026-01-01")]);
  });

  // L3-r6 — a date with no bridge of its own is dropped whole, carried rows
  // included, and `droppedDates` says so. Nothing is lost by it: day 2 here
  // holds only a copy of day 1's EUR quote, and day 1 rebased, so day 2's
  // answer is a carry-forward away — with the age stated, which the copy
  // could not have carried through the rewrite.
  it("L3-r6 — a date with no bridge of its own is dropped whole, and counted", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        // Day 1 — EUR's real quote, and the bridge to USD.
        {
          base: PLN,
          quote: EUR,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.23"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.25"),
          source: "nbp",
        },
        // Day 2 — EUR carried forward from day 1, and no bridge at all.
        {
          base: PLN,
          quote: EUR,
          date: accountingDate("2026-01-02"),
          rate: money.unitsPerPivot("0.23"),
          source: "carried_forward",
        },
      ])
      .run();

    const { row } = write(changePivotExecutor, { code: "USD" });

    const eurRows = rateRows().filter((r) => r.base === "USD" && r.quote === "EUR");
    expect(eurRows).toHaveLength(1);
    expect(eurRows[0]?.date).toBe(accountingDate("2026-01-01"));
    // Rebased by day 1's own bridge: 0.23 / 0.25 = 0.92.
    expect(eurRows[0]?.rate).toBe(money.unitsPerPivot("0.92"));
    expect(row.droppedDates).toBe(1);

    const day2 = readRate(s.ledger.replica.db, {
      base: USD,
      quote: EUR,
      date: accountingDate("2026-01-02"),
    });
    expect(day2?.rate).toBe(money.unitsPerPivot("0.92"));
    expect(day2?.carriedDays).toBe(1);
  });

  // M1/H2 — the exact scenario the reciprocal insert used to mint an orphan
  // for: the *bridge itself* is a carried-forward copy with no real quote
  // anywhere before it. The per-row loop already refuses to rebase a row
  // like this (C2's origin guard); the reciprocal `(newPivot, oldPivot)` row
  // this test scans for must be refused the same way, never minted as a
  // `carried_forward` row with nothing real behind it — the exact row
  // `readNearestRate` (H2) and `capturable` both refuse to serve.
  it("M1 — never mints an orphaned carried_forward reciprocal for the new pair", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        // The earliest bridge date in range — carried forward, and with no
        // real (PLN, USD) quote anywhere before it to trace to.
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-03"),
          rate: money.unitsPerPivot("0.25"),
          source: "carried_forward",
        },
        // The only real quote for the pair, strictly after the carried row.
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-05"),
          rate: money.unitsPerPivot("0.25"),
          source: "nbp",
        },
      ])
      .run();

    write(changePivotExecutor, { code: "USD" });

    // Scan the whole table for the new pair: not one row is a carried copy
    // with no real source anywhere before it.
    const usdToPln = rateRows().filter((r) => r.base === "USD" && r.quote === "PLN");
    for (const row of usdToPln) {
      if (row.source !== "carried_forward") continue;
      const hasRealBefore = usdToPln.some(
        (other) => other.source !== "carried_forward" && other.date <= row.date,
      );
      expect(hasRealBefore).toBe(true);
    }

    // The carried date is dropped outright, never carried into the new pair.
    expect(usdToPln.find((r) => r.date === accountingDate("2026-01-03"))).toBeUndefined();
    // The real quote's date still rebases. H1-r6 — the reciprocal keeps the
    // *bridge's own* source: `nbp` published this pair, and its reciprocal is
    // the same publication read the other way round, not a triangulation.
    // Only a cross computed *through* the bridge is `derived`.
    const day5 = usdToPln.find((r) => r.date === accountingDate("2026-01-05"));
    expect(day5?.source).toBe("nbp");
    expect(day5?.rate).toBe(money.unitsPerPivot("4")); // 1 PLN = 0.25 USD ⇒ 1 USD = 4 PLN
  });

  // M1/M2 — the origin guard used to gate only the reciprocal: a carried
  // bridge dropped `(newPivot, oldPivot)` correctly, but a *different* real
  // quote sharing that same date still divided by the carried bridge and
  // landed stamped as if it were fresh. One rule for the whole date now: a
  // bridge that is not a real published quote prices nothing on its date,
  // not the reciprocal and not any other quote either.
  it("M1/M2 — a carried bridge drops the whole date, never rebasing another quote off it", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        // Day 1 — the bridge to EUR, carried forward with no real (PLN, EUR)
        // quote anywhere before it: an orphan.
        {
          base: PLN,
          quote: EUR,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.90"),
          source: "carried_forward",
        },
        // Day 1 — an unrelated real quote sharing the orphan's date. This is
        // exactly the row the old code wrongly rebased.
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.25"),
          source: "nbp",
        },
        // Day 2 — a real bridge, and a real quote that rebases off it
        // normally: proof the fix does not over-skip.
        {
          base: PLN,
          quote: EUR,
          date: accountingDate("2026-01-02"),
          rate: money.unitsPerPivot("0.92"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-02"),
          rate: money.unitsPerPivot("0.20"),
          source: "nbp",
        },
      ])
      .run();

    write(changePivotExecutor, { code: "EUR" });

    const rows = rateRows();
    // Day 1 — the orphaned bridge date: nothing at all lands for it, derived
    // or reciprocal alike (the extended "no orphan" scan: scan the whole
    // date, not just the reciprocal that used to be checked).
    expect(rows.filter((r) => r.date === accountingDate("2026-01-01"))).toHaveLength(0);
    expect(
      rows.find(
        (r) => r.base === "EUR" && r.quote === "USD" && r.date === accountingDate("2026-01-01"),
      ),
    ).toBeUndefined();
    expect(
      rows.find(
        (r) => r.base === "EUR" && r.quote === "PLN" && r.date === accountingDate("2026-01-01"),
      ),
    ).toBeUndefined();

    // Day 2 — the real bridge still prices both the reciprocal and the
    // unrelated quote sharing its date.
    const eurToPln = rows.find(
      (r) => r.base === "EUR" && r.quote === "PLN" && r.date === accountingDate("2026-01-02"),
    );
    const eurToUsd = rows.find(
      (r) => r.base === "EUR" && r.quote === "USD" && r.date === accountingDate("2026-01-02"),
    );
    expect(eurToPln?.source).toBe("nbp"); // the reciprocal keeps the bridge's own source
    expect(eurToUsd?.source).toBe("derived"); // a cross: 0.20 / 0.92
  });

  // H1-r6 — the reciprocal keeps the bridge's own source, and `manual` is the
  // case that makes the rule worth stating: the person asserted this pair
  // (§7.6 level 2), and the reciprocal of an assertion is the same assertion
  // read the other way round, not a computation. A cross reached *through*
  // that manual leg is `derived` all the same — nobody asserted EUR/USD.
  it("H1-r6 — the reciprocal of a manual bridge stays manual; a cross through it is derived", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        {
          base: PLN,
          quote: EUR,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.25"),
          source: "manual",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.50"),
          source: "nbp",
        },
      ])
      .run();

    write(changePivotExecutor, { code: "EUR" });

    const rows = rateRows();
    const eurToPln = rows.find((r) => r.base === "EUR" && r.quote === "PLN");
    expect(eurToPln?.source).toBe("manual");
    expect(eurToPln?.rate).toBe(money.unitsPerPivot("4")); // 1 / 0.25
    const eurToUsd = rows.find((r) => r.base === "EUR" && r.quote === "USD");
    expect(eurToUsd?.source).toBe("derived");
    expect(eurToUsd?.rate).toBe(money.unitsPerPivot("2")); // 0.50 / 0.25
  });

  // H2-r6 — `change_pivot` mints rates by division and parses none of them,
  // so it is the one writer that can produce a figure outside the interval
  // every parsed rate is held to (`money.rateInBounds`). A tiny bridge under
  // an ordinary quote is the shape that does it: the rebased cross overflows
  // `numeric(24,12)`, and the reciprocal `create_transaction` would take of
  // it truncates to zero — the throw that used to land inside `apply`, after
  // the outbox entry had already committed. Dropped, counted, never written.
  it("H2-r6 — a date whose rebased rate would fall outside the bounds is dropped and counted", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        // A bridge at the very bottom of the interval…
        {
          base: PLN,
          quote: EUR,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.000000000002"),
          source: "nbp",
        },
        // …under an ordinary quote. The reciprocal is fine (1 / 2e-12 =
        // 5e11, inside), so it is the *cross* that fails: 3 / 2e-12 = 1.5e12,
        // past the top of the interval and past `numeric(24,12)` with it.
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("3"),
          source: "nbp",
        },
        // A perfectly ordinary date, to prove the drop is per-date.
        {
          base: PLN,
          quote: EUR,
          date: accountingDate("2026-01-02"),
          rate: money.unitsPerPivot("0.25"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-02"),
          rate: money.unitsPerPivot("0.50"),
          source: "nbp",
        },
      ])
      .run();

    const { row } = write(changePivotExecutor, { code: "EUR" });

    const rows = rateRows();
    // Nothing at all from the out-of-bounds date — not the cross, and not
    // the reciprocal it shared the date with.
    expect(rows.filter((r) => r.date === accountingDate("2026-01-01"))).toHaveLength(0);
    expect(row.droppedDates).toBe(1);
    // The ordinary date is untouched.
    expect(rows.filter((r) => r.date === accountingDate("2026-01-02"))).toHaveLength(2);
  });

  /**
   * C1/C2-r6 — the reviewer's own two fixtures, and the invariant
   * `pivot-change.journey.test.ts` states, run over **both** of them.
   *
   * Round 5 stamped a real leg `carried_forward` whenever its bridge was one,
   * which broke two different readers at once with the same row: with no real
   * `EUR/USD` row behind it, the new pair became an orphan (`readRate`
   * refuses, `capturable` reads `false`, `droppedDates` said `0`); and with a
   * real row behind it, `readRate` walked past the fresh figure to a
   * ten-day-old origin while `listFxRates` showed the fresh one — S18 and the
   * capture disagreeing about the same date.
   *
   * Both fixtures share one shape: a real bridge on 01-01, a *carried* bridge
   * on 01-11, and a real `USD` quote on each. The 01-11 bridge is not a
   * published rate, so 01-11 is dropped whole and counted; 01-01 rebases; and
   * 01-11's answer comes from carry-forward, ten days out, which is inside
   * §7.7's cap. The two differ only in the 01-11 `USD` quote (0.25 / 0.50),
   * which is precisely the figure round 5 wrote and then read back wrong.
   */
  const REVIEWER_FIXTURES = [
    { name: "an unchanged quote on the carried date", usdOn11: "0.25" },
    { name: "a doubled quote on the carried date", usdOn11: "0.50" },
  ] as const;

  function seedReviewerFixture(usdOn11: string) {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        {
          base: PLN,
          quote: EUR,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.90"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.25"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: EUR,
          date: accountingDate("2026-01-11"),
          rate: money.unitsPerPivot("0.90"),
          source: "carried_forward",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-11"),
          rate: money.unitsPerPivot(usdOn11),
          source: "nbp",
        },
      ])
      .run();
  }

  // 0.25 / 0.90, at `unitsPerPivot`'s twelve places — the one figure both
  // `readRate` and `listFxRates` must answer with, for both fixtures.
  const REBASED_ON_01 = money.unitsPerPivot("0.277777777778");

  describe.each(REVIEWER_FIXTURES)("the reviewer's fixture — $name", ({ usdOn11 }) => {
    it("drops the carried bridge's date, counts it, and mints no orphan", () => {
      seedReviewerFixture(usdOn11);

      const { row } = write(changePivotExecutor, { code: "EUR" });

      const rows = rateRows();
      expect(row.droppedDates).toBe(1);
      expect(rows.filter((r) => r.date === accountingDate("2026-01-11"))).toHaveLength(0);

      const day1 = rows.find(
        (r) => r.base === "EUR" && r.quote === "USD" && r.date === accountingDate("2026-01-01"),
      );
      expect(day1?.source).toBe("derived");
      expect(day1?.rate).toBe(REBASED_ON_01);
      // The reciprocal keeps the bridge's own source (H1-r6).
      const reciprocal = rows.find((r) => r.base === "EUR" && r.quote === "PLN");
      expect(reciprocal?.source).toBe("nbp");

      // The pivot-change journey's own invariant, run here over *both*
      // fixtures rather than over the one that happened to be in front of it:
      // every non-original row traces to a real, non-carried quote for the
      // same pair at or before its own date.
      for (const r of rows.filter(
        (x) => x.source === "carried_forward" || x.source === "derived",
      )) {
        const hasRealOrigin = rows.some(
          (other) =>
            other.base === r.base &&
            other.quote === r.quote &&
            other.source !== "carried_forward" &&
            other.date <= r.date,
        );
        expect(hasRealOrigin).toBe(true);
      }
    });

    it("still prices 01-11 — carried forward ten days, and capturable", () => {
      seedReviewerFixture(usdOn11);
      write(changePivotExecutor, { code: "EUR" });

      const resolved = readRate(s.ledger.replica.db, {
        base: EUR,
        quote: USD,
        date: accountingDate("2026-01-11"),
      });
      expect(resolved?.rate).toBe(REBASED_ON_01);
      expect(resolved?.asOf).toBe(accountingDate("2026-01-01"));
      expect(resolved?.carriedDays).toBe(10);

      const usd = readCurrencies(s.ledger.replica.db).find((c) => c.code === "USD");
      expect(usd?.capturable).toBe(true);
    });

    it("read equals write on 01-11 — the capture, S18's table, and the estimate flag agree", () => {
      seedReviewerFixture(usdOn11);
      write(changePivotExecutor, { code: "EUR" });

      const nearest = readNearestRate(s.ledger.replica.db, {
        base: EUR,
        quote: USD,
        date: accountingDate("2026-01-11"),
      });
      expect(nearest?.rate).toBe(REBASED_ON_01);
      // Ten days out is inside §7.7's cap, so this is the rate *in effect* on
      // 01-11 — carry-forward, not the "no rate exists at all" fallback — and
      // a capture that day is therefore not an estimate.
      expect(nearest?.inEffect).toBe(true);

      // S18 shows exactly what the capture used: one row, on 01-01, at the
      // same figure. Round 5 showed 0.5556 here and stored 0.2778.
      const table = listFxRates(s.ledger.replica.db, {
        base: EUR,
        quote: USD,
        from: accountingDate("2026-01-01"),
        to: accountingDate("2026-01-11"),
      });
      expect(table.map((r) => r.rate)).toEqual([REBASED_ON_01]);
    });
  });

  /**
   * M1 — `assertEveryDerivedRowTraces` used to seed itself from `written` and
   * check `written` against that same seed, so a `derived` row always
   * "traced" to itself and the throw was unreachable — CLAUDE.md's "break it
   * once", against the helper directly rather than through `changePivot`
   * (a hand-built `written` reaching this shape can never come out of the
   * executor itself, since rule 1 already drops any date whose bridge is
   * missing before a leg like this could be minted).
   */
  describe("assertEveryDerivedRowTraces (M1 — unfalsifiable before the fix)", () => {
    it("throws on a derived row with no same-date reciprocal", () => {
      const written: PendingRow[] = [
        {
          quote: USD,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.25"),
          source: "derived",
          fetchedAt: null,
        },
      ];

      expect(() => assertEveryDerivedRowTraces(PLN, written)).toThrow(/no reciprocal/);
    });

    it("does not throw once the same date's reciprocal is present", () => {
      const written: PendingRow[] = [
        {
          quote: PLN,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("4"),
          source: "nbp",
          fetchedAt: null,
        },
        {
          quote: USD,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.25"),
          source: "derived",
          fetchedAt: null,
        },
      ];

      expect(() => assertEveryDerivedRowTraces(PLN, written)).not.toThrow();
    });
  });

  /**
   * M2 — a second pivot change must re-base off a `derived` bridge, not
   * refuse every date. After PLN→EUR every EUR cross is `derived` (no real
   * `EUR/x` row was ever published), so a rule that only accepted a
   * real-source bridge made EUR→GBP drop every date whole
   * (`droppedDates` 5, 0 rows) — an entire currency's history erased by a
   * second pivot change nobody would expect to be destructive.
   *
   * Chosen so every quotient terminates within twelve places: PLN/USD,
   * PLN/EUR and PLN/GBP divide evenly at every step of both rewrites, so
   * this proves the *rule*, not decimal.js's own rounding.
   */
  describe("M2 — a pivot change re-bases off a real-source or derived bridge", () => {
    const DAILY_RATES = [
      { date: "2026-01-01", usd: "0.20", eur: "0.80", gbp: "0.16" },
      { date: "2026-01-02", usd: "0.25", eur: "0.50", gbp: "0.10" },
      { date: "2026-01-03", usd: "0.40", eur: "0.80", gbp: "0.20" },
      { date: "2026-01-04", usd: "0.20", eur: "0.40", gbp: "0.08" },
      { date: "2026-01-05", usd: "0.50", eur: "1.00", gbp: "0.25" },
    ] as const;

    beforeEach(() => {
      s.ledger.replica.db.insert(currencies).values({ code: GBP, name: "Placeholder" }).run();
      s.ledger.replica.db
        .insert(fxRates)
        .values(
          DAILY_RATES.flatMap(({ date, usd, eur, gbp }) => [
            {
              base: PLN,
              quote: USD,
              date: accountingDate(date),
              rate: money.unitsPerPivot(usd),
              source: "nbp" as const,
            },
            {
              base: PLN,
              quote: EUR,
              date: accountingDate(date),
              rate: money.unitsPerPivot(eur),
              source: "nbp" as const,
            },
            {
              base: PLN,
              quote: GBP,
              date: accountingDate(date),
              rate: money.unitsPerPivot(gbp),
              source: "nbp" as const,
            },
          ]),
        )
        .run();
    });

    it("PLN → EUR → GBP: every date survives both rewrites", () => {
      const first = write(changePivotExecutor, { code: "EUR" });
      expect(first.row.droppedDates).toBe(0);

      const second = write(changePivotExecutor, { code: "GBP" });
      expect(second.row.droppedDates).toBe(0);

      // Three quotes × five dates, plus the reciprocal for each — nothing
      // dropped, nothing orphaned.
      expect(rateRows()).toHaveLength(15);
    });

    it("USD, EUR and PLN all read capturable off the derived-bridge pivot", () => {
      write(changePivotExecutor, { code: "EUR" });
      write(changePivotExecutor, { code: "GBP" });

      const byCode = new Map(readCurrencies(s.ledger.replica.db).map((c) => [c.code, c]));
      expect(byCode.get(USD)?.capturable).toBe(true);
      expect(byCode.get(EUR)?.capturable).toBe(true);
      expect(byCode.get(PLN)?.capturable).toBe(true);
    });

    it("readRate(GBP/USD, day3) equals the cross computed from the original PLN quotes", () => {
      write(changePivotExecutor, { code: "EUR" });
      write(changePivotExecutor, { code: "GBP" });

      const day3 = accountingDate("2026-01-03");
      const resolved = readRate(s.ledger.replica.db, { base: GBP, quote: USD, date: day3 });

      // By hand, from the original PLN-pivot quotes on 01-03 (USD 0.40, GBP
      // 0.20), the same two divisions `change_pivot` performs, each rounded
      // to twelve places exactly as `unitsPerPivot` does:
      //   EUR bridge  = PLN/EUR = 0.80        ⇒ EUR/USD = 0.40 / 0.80 = 0.5
      //   GBP bridge  = EUR/GBP = 0.20 / 0.80 = 0.25 ⇒ GBP/USD = 0.5 / 0.25 = 2
      expect(resolved?.rate).toBe(money.unitsPerPivot("2"));
      expect(resolved?.source).toBe("derived");
    });
  });
});

/**
 * M3 — `fx_rates_rate_bounds`'s SQLite twin (`ddl.ts`'s `__new_fx_rates`
 * rebuild), break it once. A raw insert, not `s.ledger.replica.db.insert`:
 * `fxRates.rate`'s branded `UnitsPerPivot` type refuses an out-of-bounds
 * literal at compile time, which is `zUnitsPerPivot`'s job (`zod.ts`) — this
 * proves the CHECK holds when that layer is bypassed, the same way a bug in
 * the code could.
 */
/** better-sqlite3's own message, under drizzle's wrapping `DrizzleError`. */
function rootCauseMessage(error: unknown): string {
  let current = error;
  while (current instanceof Error && current.cause) current = current.cause;
  return current instanceof Error ? current.message : String(current);
}

describe("fx_rates_rate_bounds (SQLite twin)", () => {
  it("refuses a rate at the floor, 0.000000000001", () => {
    let caught: unknown;
    try {
      s.ledger.replica.db.run(
        sql`INSERT INTO fx_rates (base, quote, date, rate, source) VALUES ('PLN', 'USD', '2026-01-01', '0.000000000001', 'nbp')`,
      );
    } catch (error) {
      caught = error;
    }
    expect(rootCauseMessage(caught)).toMatch(/CHECK constraint failed/);
  });

  it("refuses a rate at the ceiling, 999999999999", () => {
    let caught: unknown;
    try {
      s.ledger.replica.db.run(
        sql`INSERT INTO fx_rates (base, quote, date, rate, source) VALUES ('PLN', 'USD', '2026-01-02', '999999999999', 'nbp')`,
      );
    } catch (error) {
      caught = error;
    }
    expect(rootCauseMessage(caught)).toMatch(/CHECK constraint failed/);
  });

  it("accepts a rate one step inside the floor, 0.000000000002", () => {
    s.ledger.replica.db.run(
      sql`INSERT INTO fx_rates (base, quote, date, rate, source) VALUES ('PLN', 'USD', '2026-01-03', '0.000000000002', 'nbp')`,
    );
    expect(rateRows().find((r) => r.date === "2026-01-03")?.rate).toBe("0.000000000002");
  });

  it("accepts a rate one step inside the ceiling, 999999999998", () => {
    s.ledger.replica.db.run(
      sql`INSERT INTO fx_rates (base, quote, date, rate, source) VALUES ('PLN', 'USD', '2026-01-04', '999999999998', 'nbp')`,
    );
    expect(rateRows().find((r) => r.date === "2026-01-04")?.rate).toBe("999999999998");
  });
});

/* ── set_manual_rate / clear_manual_rate ─────────────────────────────────── */

describe("set_manual_rate", () => {
  it("writes one row per day across the range", () => {
    const result = write(setManualRateExecutor, {
      base: "PLN",
      quote: "USD",
      from: "2026-01-01",
      to: "2026-01-03",
      rate: "0.25",
      today: "2026-06-01",
    });

    expect(result.row).toEqual({ written: 3, replacedManual: 0 });
    expect(rateRows()).toHaveLength(3);
    expect(rateRows().every((r) => r.source === "manual")).toBe(true);
  });

  /**
   * M1 — `today` is optional, and this is the payload a build that predates
   * the field produced. A required field would make it fail `parse` forever,
   * and `recover.ts` halts replay at the first entry it cannot apply — so one
   * queued entry would strand every entry behind it, permanently.
   */
  describe("M1 — `today` omitted, as a queued pre-change entry has it", () => {
    it("writes, deriving the day from where and when the capture happened", () => {
      const result = write(setManualRateExecutor, {
        base: "PLN",
        quote: "USD",
        from: "2026-01-01",
        to: "2026-01-03",
        rate: "0.25",
      });

      expect(result.row).toEqual({ written: 3, replacedManual: 0 });
      expect(rateRows()).toHaveLength(3);
    });

    it("still refuses a future date — the rule moves to the executor, it does not lapse", () => {
      // The capture is `Europe/Warsaw` at a fixed instant, so "today" is that
      // instant's own Warsaw day; a range ending well past it must refuse
      // exactly as the schema's own check would have.
      const at = new Date("2026-03-12T09:00:00Z");
      expect(() =>
        writeLocally(s.ledger, {
          executor: setManualRateExecutor,
          registry: ledgerRegistry,
          input: {
            base: "PLN",
            quote: "USD",
            from: "2099-01-01",
            to: "2099-01-03",
            rate: "0.25",
          },
          capture: { ...capture, at },
        }),
      ).toThrow(/has not happened yet/);
      expect(rateRows()).toHaveLength(0);
    });

    it("accepts a range ending on the capture's own day, in the capture's own zone", () => {
      // 23:30 UTC on the 11th is already the 12th in Warsaw (UTC+1), and the
      // day the ledger means is the local one — C28's own failure, the other
      // way round.
      const at = new Date("2026-03-11T23:30:00Z");
      const result = writeLocally(s.ledger, {
        executor: setManualRateExecutor,
        registry: ledgerRegistry,
        input: {
          base: "PLN",
          quote: "USD",
          from: "2026-03-12",
          to: "2026-03-12",
          rate: "0.25",
        },
        capture: { ...capture, at },
      });

      expect(result.row).toEqual({ written: 1, replacedManual: 0 });
    });
  });

  it("refuses a base that is not the pivot", () => {
    expect(() =>
      write(setManualRateExecutor, {
        base: "USD",
        quote: "EUR",
        from: "2026-01-01",
        to: "2026-01-01",
        rate: "0.9",
        today: "2026-06-01",
      }),
    ).toThrow(/must be the pivot/);
  });

  it("refuses to overwrite an existing manual row without the flag", () => {
    write(setManualRateExecutor, {
      base: "PLN",
      quote: "USD",
      from: "2026-01-01",
      to: "2026-01-01",
      rate: "0.25",
      today: "2026-06-01",
    });

    expect(() =>
      write(setManualRateExecutor, {
        base: "PLN",
        quote: "USD",
        from: "2026-01-01",
        to: "2026-01-01",
        rate: "0.26",
        today: "2026-06-01",
      }),
    ).toThrow(/already has a manual rate/);
  });

  it("overwrites when overwriteManual is set, and counts the replacement", () => {
    write(setManualRateExecutor, {
      base: "PLN",
      quote: "USD",
      from: "2026-01-01",
      to: "2026-01-01",
      rate: "0.25",
      today: "2026-06-01",
    });

    const result = write(setManualRateExecutor, {
      base: "PLN",
      quote: "USD",
      from: "2026-01-01",
      to: "2026-01-01",
      rate: "0.26",
      today: "2026-06-01",
      overwriteManual: true,
    });

    expect(result.row).toEqual({ written: 1, replacedManual: 1 });
    // `zUnitsPerPivot` does not normalize scale the way `zMoney` does —
    // matching `zPivotPerUnit`'s own behaviour — so the raw string lands.
    expect(rateRows()[0]?.rate).toBe("0.26");
  });

  it("nothing is written when a later date in the range conflicts", () => {
    write(setManualRateExecutor, {
      base: "PLN",
      quote: "USD",
      from: "2026-01-02",
      to: "2026-01-02",
      rate: "0.25",
      today: "2026-06-01",
    });

    expect(() =>
      write(setManualRateExecutor, {
        base: "PLN",
        quote: "USD",
        from: "2026-01-01",
        to: "2026-01-03",
        rate: "0.30",
        today: "2026-06-01",
      }),
    ).toThrow();

    // The one row from the first write is untouched — nothing from the
    // second, refused write landed.
    expect(rateRows()).toHaveLength(1);
    expect(rateRows()[0]?.rate).toBe("0.25");
  });

  // H3 — a `carried_forward` row whose origin this write corrects holds a
  // now-stale copy of the old rate; left in place it would keep answering
  // reads with a figure no provider ever published.
  it("H3 — deletes a carried_forward row whose origin is a date this write corrects", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.25"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-05"),
          rate: money.unitsPerPivot("0.25"),
          source: "carried_forward",
        },
      ])
      .run();

    write(setManualRateExecutor, {
      base: "PLN",
      quote: "USD",
      from: "2026-01-01",
      to: "2026-01-01",
      rate: "0.30",
      overwriteManual: true,
      today: "2026-06-01",
    });

    const rows = rateRows();
    expect(rows.find((r) => r.date === accountingDate("2026-01-05"))).toBeUndefined();
    // The raw input string lands — `zUnitsPerPivot` does not normalize scale.
    expect(rows.find((r) => r.date === accountingDate("2026-01-01"))?.rate).toBe("0.30");
  });

  // H3 — a carried row descending from a date *outside* the corrected range
  // is untouched: its origin never changed.
  it("H3 — leaves a carried_forward row alone when its origin is not among the corrected dates", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.25"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-05"),
          rate: money.unitsPerPivot("0.25"),
          source: "carried_forward",
        },
      ])
      .run();

    write(setManualRateExecutor, {
      base: "PLN",
      quote: "USD",
      from: "2026-01-10",
      to: "2026-01-10",
      rate: "0.30",
      today: "2026-06-01",
    });

    expect(rateRows().find((r) => r.date === accountingDate("2026-01-05"))).toBeDefined();
  });

  // H1 — a downstream carried row whose *pre-write* origin sits outside the
  // corrected range must still be deleted when this write turns a date
  // *inside* the range into a nearer real origin for it. Scanning against
  // the pre-write state (the bug) finds the old, still-distant origin and
  // leaves this row in place, answering reads with a rate this write just
  // superseded.
  it("H1 — deletes a downstream carried row whose origin only lands in range after this write", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.25"),
          source: "nbp",
        },
        // Carrying forward from 2026-01-01 — nothing else real exists yet.
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-10"),
          rate: money.unitsPerPivot("0.25"),
          source: "carried_forward",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-15"),
          rate: money.unitsPerPivot("0.25"),
          source: "carried_forward",
        },
      ])
      .run();

    // Corrects 2026-01-10 — a date that was itself carried_forward. Its
    // *pre-write* origin is 2026-01-01, outside this range; only after the
    // write does 2026-01-10 become the nearer real origin for 2026-01-15.
    write(setManualRateExecutor, {
      base: "PLN",
      quote: "USD",
      from: "2026-01-10",
      to: "2026-01-10",
      rate: "0.30",
      today: "2026-06-01",
    });

    const rows = rateRows();
    expect(rows.find((r) => r.date === accountingDate("2026-01-10"))?.source).toBe("manual");
    expect(rows.find((r) => r.date === accountingDate("2026-01-15"))).toBeUndefined();
  });
});

describe("clear_manual_rate", () => {
  it("deletes manual rows only, in range", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("0.25"),
          source: "manual",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-02"),
          rate: money.unitsPerPivot("0.26"),
          source: "nbp",
        },
      ])
      .run();

    const result = write(clearManualRateExecutor, {
      base: "PLN",
      quote: "USD",
      from: "2026-01-01",
      to: "2026-01-03",
    });

    expect(result.row).toEqual({ deleted: 1, restored: 0 });
    expect(rateRows()).toHaveLength(1);
    expect(rateRows()[0]?.source).toBe("nbp");
  });

  // C1 — the worked example: NBP 3.81 → set 3.9 → clear → 3.81 with source
  // `nbp` back. Before this fix, clearing deleted the row outright and left
  // a hole exactly where the provider's own figure used to be.
  it("C1 — restores the row a manual write displaced, source and all", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values({
        base: PLN,
        quote: USD,
        date: accountingDate("2026-01-01"),
        rate: money.unitsPerPivot("3.81"),
        source: "nbp",
      })
      .run();

    write(setManualRateExecutor, {
      base: "PLN",
      quote: "USD",
      from: "2026-01-01",
      to: "2026-01-01",
      rate: "3.9",
      overwriteManual: true,
      today: "2026-06-01",
    });
    expect(rateRows()[0]?.source).toBe("manual");
    expect(rateRows()[0]?.rate).toBe("3.9");

    const result = write(clearManualRateExecutor, {
      base: "PLN",
      quote: "USD",
      from: "2026-01-01",
      to: "2026-01-01",
    });

    expect(result.row).toEqual({ deleted: 0, restored: 1 });
    const rows = rateRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe("nbp");
    expect(rows[0]?.rate).toBe(money.unitsPerPivot("3.81"));
    expect(rows[0]?.displacedRate).toBeNull();
  });

  // C1 — a manual row with nothing displaced (the date held no prior row) is
  // still deleted outright; there is nothing to restore it to.
  it("C1 — deletes outright when the manual row displaced nothing", () => {
    write(setManualRateExecutor, {
      base: "PLN",
      quote: "USD",
      from: "2026-01-01",
      to: "2026-01-01",
      rate: "3.9",
      today: "2026-06-01",
    });

    const result = write(clearManualRateExecutor, {
      base: "PLN",
      quote: "USD",
      from: "2026-01-01",
      to: "2026-01-01",
    });

    expect(result.row).toEqual({ deleted: 1, restored: 0 });
    expect(rateRows()).toHaveLength(0);
  });

  // C1 — a second manual write over an already-manual row must not clobber
  // what the *first* one displaced.
  it("C1 — a second manual write keeps the original displaced row, not the intermediate manual one", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values({
        base: PLN,
        quote: USD,
        date: accountingDate("2026-01-01"),
        rate: money.unitsPerPivot("3.81"),
        source: "nbp",
      })
      .run();

    write(setManualRateExecutor, {
      base: "PLN",
      quote: "USD",
      from: "2026-01-01",
      to: "2026-01-01",
      rate: "3.9",
      overwriteManual: true,
      today: "2026-06-01",
    });
    write(setManualRateExecutor, {
      base: "PLN",
      quote: "USD",
      from: "2026-01-01",
      to: "2026-01-01",
      rate: "4.0",
      overwriteManual: true,
      today: "2026-06-01",
    });

    const result = write(clearManualRateExecutor, {
      base: "PLN",
      quote: "USD",
      from: "2026-01-01",
      to: "2026-01-01",
    });

    const rows = rateRows();
    expect(result.row).toEqual({ deleted: 0, restored: 1 });
    expect(rows[0]?.source).toBe("nbp");
    expect(rows[0]?.rate).toBe(money.unitsPerPivot("3.81"));
  });
});

/* ── readRate / readCoverage / listFxRates ───────────────────────────────── */

describe("readRate", () => {
  beforeEach(() => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("4.00"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-10"),
          rate: money.unitsPerPivot("4.10"),
          source: "nbp",
        },
      ])
      .run();
  });

  it("reads the exact-day row", () => {
    const rate = readRate(s.ledger.replica.db, {
      base: PLN,
      quote: USD,
      date: accountingDate("2026-01-10"),
    });
    expect(rate?.rate).toBe(money.unitsPerPivot("4.10"));
    expect(rate?.carriedDays).toBe(0);
  });

  it("carries forward within the ten-day cap", () => {
    const rate = readRate(s.ledger.replica.db, {
      base: PLN,
      quote: USD,
      date: accountingDate("2026-01-15"),
    });
    expect(rate?.rate).toBe(money.unitsPerPivot("4.10"));
    expect(rate?.carriedDays).toBe(5);
  });

  it("refuses past the ten-day cap", () => {
    const rate = readRate(s.ledger.replica.db, {
      base: PLN,
      quote: USD,
      date: accountingDate("2026-01-21"),
    });
    expect(rate).toBeUndefined();
  });

  it("is undefined with no rows at all", () => {
    const rate = readRate(s.ledger.replica.db, {
      base: PLN,
      quote: EUR,
      date: accountingDate("2026-01-10"),
    });
    expect(rate).toBeUndefined();
  });

  // H3 — a `carried_forward` row's own `rate` is a snapshot taken when it
  // was written; if its origin is later corrected (`set_manual_rate`), the
  // snapshot goes stale. `readRate` must answer with the origin's *current*
  // rate, never the carried copy's own stored value.
  it("H3 — returns the origin's current rate, not the carried copy's stale snapshot", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values({
        base: PLN,
        quote: EUR,
        date: accountingDate("2026-02-01"),
        rate: money.unitsPerPivot("0.20"),
        source: "carried_forward",
      })
      .run();
    // The origin the carried row above descends from — corrected *after*
    // fillForward already copied the old rate into the carried row.
    s.ledger.replica.db
      .insert(fxRates)
      .values({
        base: PLN,
        quote: EUR,
        date: accountingDate("2026-01-28"),
        rate: money.unitsPerPivot("0.99"),
        source: "manual",
      })
      .run();

    const rate = readRate(s.ledger.replica.db, {
      base: PLN,
      quote: EUR,
      date: accountingDate("2026-02-01"),
    });

    expect(rate?.rate).toBe(money.unitsPerPivot("0.99"));
    expect(rate?.source).toBe("manual");
    expect(rate?.asOf).toBe(accountingDate("2026-01-28"));
  });

  // SHOULD-FIX — `fillForward` (`packages/db/src/fx/sources.ts`) stores up to
  // ten `carried_forward` rows *past* a real quote, each stamped with its own
  // date. Measuring `carriedDays` from the latest stored row (itself a
  // `carried_forward` row) rather than from the real quote it was carried
  // from lets a dead pair be read up to ~20 days stale before being refused.
  describe("carry-forward chains through stored carried_forward rows", () => {
    beforeEach(() => {
      // A real quote on day 0, then `fillForward`'s own ten carried rows —
      // exactly what the server would have written for a source that died
      // after 2026-02-01.
      s.ledger.replica.db
        .insert(fxRates)
        .values([
          {
            base: PLN,
            quote: EUR,
            date: accountingDate("2026-02-01"),
            rate: money.unitsPerPivot("4.00"),
            source: "nbp",
          },
          ...Array.from({ length: 10 }, (_, i) => ({
            base: PLN,
            quote: EUR,
            date: accountingDate(`2026-02-${String(2 + i).padStart(2, "0")}`),
            rate: money.unitsPerPivot("4.00"),
            source: "carried_forward" as const,
          })),
        ])
        .run();
    });

    it("measures carriedDays from the real quote, not the last carried row", () => {
      const rate = readRate(s.ledger.replica.db, {
        base: PLN,
        quote: EUR,
        date: accountingDate("2026-02-11"),
      });
      expect(rate?.rate).toBe(money.unitsPerPivot("4.00"));
      expect(rate?.source).toBe("nbp");
      expect(rate?.asOf).toBe(accountingDate("2026-02-01"));
      expect(rate?.carriedDays).toBe(10);
    });

    it("refuses one day past the real quote's ten-day cap", () => {
      const rate = readRate(s.ledger.replica.db, {
        base: PLN,
        quote: EUR,
        date: accountingDate("2026-02-12"),
      });
      expect(rate).toBeUndefined();
    });
  });

  // C2 — `change_pivot` can drop a carried row's origin while leaving the
  // carried row itself (fixed by the orphan-drop test above, but the reader
  // must refuse regardless of how such a row came to exist).
  it("refuses a carried_forward row whose origin is unlocatable, rather than carriedDays: 0", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values({
        base: PLN,
        quote: EUR,
        date: accountingDate("2026-03-05"),
        rate: money.unitsPerPivot("4.00"),
        source: "carried_forward",
      })
      .run();

    const rate = readRate(s.ledger.replica.db, {
      base: PLN,
      quote: EUR,
      date: accountingDate("2026-03-05"),
    });
    expect(rate).toBeUndefined();
  });
});

// H1 — `readNearestRate` compares the calendar distance on both sides of
// `date` rather than always preferring the newest row at-or-before it.
describe("readNearestRate", () => {
  it("prefers the before row when it is closer", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-08"), // 2 days before
          rate: money.unitsPerPivot("4.00"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-20"), // 10 days after
          rate: money.unitsPerPivot("4.50"),
          source: "nbp",
        },
      ])
      .run();

    const rate = readNearestRate(s.ledger.replica.db, {
      base: PLN,
      quote: USD,
      date: accountingDate("2026-01-10"),
    });
    expect(rate?.rate).toBe(money.unitsPerPivot("4.00"));
    expect(rate?.asOf).toBe(accountingDate("2026-01-08"));
  });

  it("prefers the after row when it is closer — a 2020 row must not beat one 26 days later", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2020-01-01"), // years before
          rate: money.unitsPerPivot("3.90"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-27"), // 26 days after
          rate: money.unitsPerPivot("4.10"),
          source: "nbp",
        },
      ])
      .run();

    const rate = readNearestRate(s.ledger.replica.db, {
      base: PLN,
      quote: USD,
      date: accountingDate("2026-01-01"),
    });
    expect(rate?.rate).toBe(money.unitsPerPivot("4.10"));
    expect(rate?.asOf).toBe(accountingDate("2026-01-27"));
  });

  it("ties to the before row when both sides are equally far", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-05"), // 5 days before
          rate: money.unitsPerPivot("4.00"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-15"), // 5 days after
          rate: money.unitsPerPivot("4.50"),
          source: "nbp",
        },
      ])
      .run();

    const rate = readNearestRate(s.ledger.replica.db, {
      base: PLN,
      quote: USD,
      date: accountingDate("2026-01-10"),
    });
    expect(rate?.rate).toBe(money.unitsPerPivot("4.00"));
    expect(rate?.asOf).toBe(accountingDate("2026-01-05"));
  });

  it("falls back to the only row, when it is after date", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values({
        base: PLN,
        quote: USD,
        date: accountingDate("2026-02-01"),
        rate: money.unitsPerPivot("4.20"),
        source: "nbp",
      })
      .run();

    const rate = readNearestRate(s.ledger.replica.db, {
      base: PLN,
      quote: USD,
      date: accountingDate("2026-01-01"),
    });
    expect(rate?.rate).toBe(money.unitsPerPivot("4.20"));
    expect(rate?.asOf).toBe(accountingDate("2026-02-01"));
  });

  it("falls back to the only row, when it is before date", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values({
        base: PLN,
        quote: USD,
        date: accountingDate("2026-01-01"),
        rate: money.unitsPerPivot("3.80"),
        source: "nbp",
      })
      .run();

    const rate = readNearestRate(s.ledger.replica.db, {
      base: PLN,
      quote: USD,
      date: accountingDate("2026-02-01"),
    });
    expect(rate?.rate).toBe(money.unitsPerPivot("3.80"));
    expect(rate?.asOf).toBe(accountingDate("2026-01-01"));
  });

  it("is undefined with no rows at all", () => {
    const rate = readNearestRate(s.ledger.replica.db, {
      base: PLN,
      quote: EUR,
      date: accountingDate("2026-01-10"),
    });
    expect(rate).toBeUndefined();
  });

  // L4 — a real-source hit reports daysAway alongside asOf.
  it("L4 — daysAway is 0 on an exact real-source hit", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values({
        base: PLN,
        quote: USD,
        date: accountingDate("2026-01-10"),
        rate: money.unitsPerPivot("4.00"),
        source: "nbp",
      })
      .run();

    const rate = readNearestRate(s.ledger.replica.db, {
      base: PLN,
      quote: USD,
      date: accountingDate("2026-01-10"),
    });
    expect(rate?.daysAway).toBe(0);
  });

  // H1 — round-4 correction: carry-forward wins before any distance is ever
  // compared. §7.6's table gives *weekend or holiday* its own row — *"carry
  // forward the last published rate"* — and the "nearest in calendar days on
  // either side" sentence sits only under the table's *next* heading, "when
  // no rate exists at all". Step 1 (`readRate`'s own answer) succeeds here —
  // the carried row at the query date traces to the real row 9 days before,
  // still within the ten-day cap — so it wins even though a real row sits
  // only 1 day away on the other side.
  it("H1 — carry-forward (9 days, within the cap) wins over a nearer real row on the other side", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("4.00"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-10"), // the query date, carried from 01-01 (9 days)
          rate: money.unitsPerPivot("4.00"),
          source: "carried_forward",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-11"), // only 1 day after, but never compared
          rate: money.unitsPerPivot("4.90"),
          source: "nbp",
        },
      ])
      .run();

    const rate = readNearestRate(s.ledger.replica.db, {
      base: PLN,
      quote: USD,
      date: accountingDate("2026-01-10"),
    });
    expect(rate?.rate).toBe(money.unitsPerPivot("4.00"));
    expect(rate?.asOf).toBe(accountingDate("2026-01-01"));
    expect(rate?.daysAway).toBe(9);
    expect(rate?.inEffect).toBe(true);
  });

  // H1 — the common weekend case: a source publishes Friday and Monday,
  // carrying forward over the weekend. §7.6's table names this its own
  // row — carry-forward — so Friday's rate (carried through the weekend) is
  // the answer for Sunday, never Monday's, however much nearer Monday sits
  // in calendar days.
  it("H1 — Friday's carried rate wins on a carried Sunday, never Monday's nearer real quote", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-02"), // Friday
          rate: money.unitsPerPivot("4.00"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-03"), // Saturday, carried
          rate: money.unitsPerPivot("4.00"),
          source: "carried_forward",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-04"), // Sunday, carried — the query date
          rate: money.unitsPerPivot("4.00"),
          source: "carried_forward",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-05"), // Monday — nearer, but never compared
          rate: money.unitsPerPivot("4.30"),
          source: "nbp",
        },
      ])
      .run();

    const rate = readNearestRate(s.ledger.replica.db, {
      base: PLN,
      quote: USD,
      date: accountingDate("2026-01-04"),
    });
    expect(rate?.rate).toBe(money.unitsPerPivot("4.00"));
    expect(rate?.asOf).toBe(accountingDate("2026-01-02"));
    // Measured to the origin (Friday), not to the query date's own carried row.
    expect(rate?.daysAway).toBe(2);
    expect(rate?.inEffect).toBe(true);
  });

  // H2 — the nearer candidate is a carried_forward row with no locatable
  // origin at all (no real row anywhere before it). The old code picked it
  // as `nearest` on distance alone, then refused outright on the failed
  // origin walk — although a real row exists further out on the other side.
  it("H2 — an orphaned carried_forward row nearer than the query date must not refuse a usable real rate (before side)", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        // Orphaned: no real (PLN, USD) row anywhere at or before this date.
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-03"),
          rate: money.unitsPerPivot("4.00"),
          source: "carried_forward",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-05"),
          rate: money.unitsPerPivot("4.30"),
          source: "nbp",
        },
      ])
      .run();

    // Queried exactly on the orphan's own date — the old code's "nearest"
    // picked it at distance 0 and refused, exactly the H2 reproduction from
    // `create_transaction`: a real rate exists, but the read still failed.
    const rate = readNearestRate(s.ledger.replica.db, {
      base: PLN,
      quote: USD,
      date: accountingDate("2026-01-03"),
    });
    expect(rate?.rate).toBe(money.unitsPerPivot("4.30"));
    expect(rate?.asOf).toBe(accountingDate("2026-01-05"));
    expect(rate?.daysAway).toBe(2);
    expect(rate?.inEffect).toBe(false);
  });

  // H2, mirrored — the orphaned carried row is nearer on the *after* side,
  // with the only real row further out and strictly before the query date's
  // possible before-candidates (there are none here at all).
  it("H2 — an orphaned carried_forward row nearer than the query date must not refuse a usable real rate (after side)", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        // Orphaned: no real (PLN, USD) row anywhere at or before this date.
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-05"),
          rate: money.unitsPerPivot("4.00"),
          source: "carried_forward",
        },
        // The only real row for the pair — farther away than the orphan,
        // and later still.
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-02-01"),
          rate: money.unitsPerPivot("4.30"),
          source: "nbp",
        },
      ])
      .run();

    // Nothing at or before this date — the orphaned carried row (4 days
    // after) used to win the "nearest, any source" comparison outright,
    // since there was no before-candidate to compare it against.
    const rate = readNearestRate(s.ledger.replica.db, {
      base: PLN,
      quote: USD,
      date: accountingDate("2026-01-01"),
    });
    expect(rate?.rate).toBe(money.unitsPerPivot("4.30"));
    expect(rate?.asOf).toBe(accountingDate("2026-02-01"));
    expect(rate?.daysAway).toBe(31);
    expect(rate?.inEffect).toBe(false);
  });
});

describe("readCoverage", () => {
  it("is 0% for a currency with no rows, and excludes the pivot", () => {
    const coverage = readCoverage(s.ledger.replica.db, accountingDate("2026-01-10"));
    expect(coverage.find((c) => c.code === "PLN")).toBeUndefined();
    expect(coverage.find((c) => c.code === "USD")).toEqual(
      expect.objectContaining({ days: 0, coveragePct: 0 }),
    );
  });

  it("is 100% when every day since the first row has a rate", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("4"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-02"),
          rate: money.unitsPerPivot("4"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-03"),
          rate: money.unitsPerPivot("4"),
          source: "nbp",
        },
      ])
      .run();

    const coverage = readCoverage(s.ledger.replica.db, accountingDate("2026-01-03"));
    expect(coverage.find((c) => c.code === "USD")).toEqual(
      expect.objectContaining({ days: 3, coveragePct: 100 }),
    );
  });

  // H3 — 9 rows over 2,080 calendar days floors to 0%, but 9 rows held is
  // not "no rates yet"; the caller (`CoverageTag`) must decide on `days`
  // against `calendarDays`, never on this rounded percentage.
  it("returns calendarDays alongside days, and floors the percentage while incomplete", () => {
    const first = accountingDate("2020-11-25");
    s.ledger.replica.db
      .insert(fxRates)
      .values(
        Array.from({ length: 9 }, (_, i) => ({
          base: PLN,
          quote: USD,
          date: addDays(first, i),
          rate: money.unitsPerPivot("4.00"),
          source: "nbp" as const,
        })),
      )
      .run();

    const today = addDays(first, 2079); // 2,080 calendar days, inclusive of `first`.
    const coverage = readCoverage(s.ledger.replica.db, today);
    expect(coverage.find((c) => c.code === "USD")).toEqual(
      expect.objectContaining({ days: 9, calendarDays: 2080, coveragePct: 0 }),
    );
  });

  // H4 — `lastDate` is the last *quote*, not the last row. A source dead
  // for ten days leaves nine `carried_forward` rows behind it; the coverage
  // figure must still point at the real day it went dark.
  it("lastDate excludes carried_forward rows — the real last quote date", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-02-01"),
          rate: money.unitsPerPivot("4.00"),
          source: "nbp",
        },
        ...Array.from({ length: 9 }, (_, i) => ({
          base: PLN,
          quote: USD,
          date: accountingDate(`2026-02-${String(2 + i).padStart(2, "0")}`),
          rate: money.unitsPerPivot("4.00"),
          source: "carried_forward" as const,
        })),
      ])
      .run();

    const coverage = readCoverage(s.ledger.replica.db, accountingDate("2026-02-10"));
    expect(coverage.find((c) => c.code === "USD")?.lastDate).toBe(accountingDate("2026-02-01"));
  });

  // H2 — a currency with no real quote at all (every held row `carried_
  // forward`) has no "last quote" to state. `lastRealDate ?? firstDate` used
  // to report the oldest carried row as though it were a real quote date.
  it("H2 — lastDate is null for a currency with no real quote, never the oldest carried row", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values(
        Array.from({ length: 5 }, (_, i) => ({
          base: PLN,
          quote: USD,
          date: accountingDate(`2026-02-${String(1 + i).padStart(2, "0")}`),
          rate: money.unitsPerPivot("4.00"),
          source: "carried_forward" as const,
        })),
      )
      .run();

    const coverage = readCoverage(s.ledger.replica.db, accountingDate("2026-02-05"));
    const row = coverage.find((c) => c.code === "USD");
    expect(row?.lastDate).toBeNull();
    expect(row?.days).toBe(5);
    expect(row?.realDays).toBe(0);
  });

  // M3 — a source dead for months but carried forward every day since reads
  // `days === calendarDays` (100%, "complete") even though only one row is a
  // real quote. `realDays` is the honest decision variable — and (M1)
  // `coveragePct` must be derived from it too, not from `days`: 1 real quote
  // over 10 calendar days is `10%`, never `100%`.
  it("M3 — realDays stays low when a dead source is carried all the way to today", () => {
    const first = accountingDate("2026-01-01");
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        { base: PLN, quote: USD, date: first, rate: money.unitsPerPivot("4.00"), source: "nbp" },
        ...Array.from({ length: 9 }, (_, i) => ({
          base: PLN,
          quote: USD,
          date: addDays(first, i + 1),
          rate: money.unitsPerPivot("4.00"),
          source: "carried_forward" as const,
        })),
      ])
      .run();

    const today = addDays(first, 9); // 10 calendar days, filled by count.
    const coverage = readCoverage(s.ledger.replica.db, today);
    expect(coverage.find((c) => c.code === "USD")).toEqual(
      expect.objectContaining({
        days: 10,
        calendarDays: 10,
        realDays: 1,
        lastDate: first,
        coveragePct: 10,
      }),
    );
  });

  // M4 — a row past `today` must not inflate `days` (or the percentage) past
  // what `calendarDays` — counted only through today — actually covers.
  // `set_manual_rate` refuses `to > today` (L2), so this reads the replica
  // directly rather than through the operation — the scoping in the read
  // itself is the guard now, not an input this executor would ever accept.
  it("M4 — a future-dated row is excluded from days and calendarDays alike", () => {
    const first = accountingDate("2026-01-01");
    const today = accountingDate("2026-01-05");
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        ...Array.from({ length: 5 }, (_, i) => ({
          base: PLN,
          quote: USD,
          date: addDays(first, i),
          rate: money.unitsPerPivot("4.00"),
          source: "nbp" as const,
        })),
        // Past `today` — never written by `set_manual_rate` itself (L2), but
        // the replica could still hold one (a synced row with a provider's
        // clock skew, a pre-existing row from before the refusal shipped).
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-10"),
          rate: money.unitsPerPivot("4.00"),
          source: "manual" as const,
        },
      ])
      .run();

    const coverage = readCoverage(s.ledger.replica.db, today);
    expect(coverage.find((c) => c.code === "USD")).toEqual(
      expect.objectContaining({
        days: 5,
        realDays: 5,
        calendarDays: 5,
        coveragePct: 100,
      }),
    );
  });

  // M7 — one aggregate per currency, never every row materialised.
  it("issues one aggregate query per currency against a 5,000-row fixture", () => {
    const first = accountingDate("2010-01-01");
    s.ledger.replica.db
      .insert(fxRates)
      .values(
        Array.from({ length: 5000 }, (_, i) => ({
          base: PLN,
          quote: USD,
          date: addDays(first, i),
          rate: money.unitsPerPivot("4.00"),
          source: "nbp" as const,
        })),
      )
      .run();

    const today = addDays(first, 4999);

    // L9 — the prior assertion here only pinned the *count* of prepared
    // statements, which proves nothing about what each one fetches. This
    // wraps every fx_rates statement's own `.all()` and bounds the rows the
    // driver actually returns — an aggregate returns one row per currency;
    // a row-per-rate `select` would have returned 5,000.
    const originalPrepare = Database.prototype.prepare;
    const rowCounts: number[] = [];
    const prepareSpy = vi.spyOn(Database.prototype, "prepare").mockImplementation(function (
      this: InstanceType<typeof Database>,
      sqlText: string,
    ) {
      // biome-ignore lint/suspicious/noExplicitAny: forwarding better-sqlite3's own variadic `prepare` signature through a mock
      const stmt = (originalPrepare as any).call(this, sqlText);
      if (sqlText.includes("fx_rates")) {
        const originalAll = stmt.all.bind(stmt);
        stmt.all = (...args: unknown[]) => {
          const rows = originalAll(...args);
          rowCounts.push(Array.isArray(rows) ? rows.length : 1);
          return rows;
        };
      }
      return stmt;
    });

    const coverage = readCoverage(s.ledger.replica.db, today);
    const fxRatesQueries = prepareSpy.mock.calls
      .map(([sqlText]) => sqlText as string)
      .filter((text) => text.includes("fx_rates"));
    prepareSpy.mockRestore();

    expect(coverage.find((c) => c.code === "USD")).toEqual(
      expect.objectContaining({ days: 5000, calendarDays: 5000, coveragePct: 100 }),
    );
    // Aggregate SQL only — never a row fetch that returns anywhere near
    // 5,000 rows to be counted in JavaScript.
    for (const query of fxRatesQueries) {
      expect(query).toMatch(/count\(/i);
    }
    expect(rowCounts.length).toBeGreaterThan(0);
    for (const count of rowCounts) {
      expect(count).toBeLessThanOrEqual(1);
    }
  });
});

describe("listFxRates", () => {
  it("pages S18's table, oldest first, within the range", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-03"),
          rate: money.unitsPerPivot("4.02"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("4.00"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-02-01"),
          rate: money.unitsPerPivot("4.20"),
          source: "nbp",
        },
      ])
      .run();

    const rows = listFxRates(s.ledger.replica.db, {
      base: PLN,
      quote: USD,
      from: accountingDate("2026-01-01"),
      to: accountingDate("2026-01-31"),
    });

    expect(rows.map((r) => r.date)).toEqual(["2026-01-01", "2026-01-03"]);
  });

  it("carries the origin's own age on a carried_forward row — never left for the caller to compute", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-01"),
          rate: money.unitsPerPivot("4.00"),
          source: "nbp",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-04"),
          rate: money.unitsPerPivot("4.00"),
          source: "carried_forward",
        },
      ])
      .run();

    const rows = listFxRates(s.ledger.replica.db, {
      base: PLN,
      quote: USD,
      from: accountingDate("2026-01-01"),
      to: accountingDate("2026-01-04"),
    });

    expect(rows.find((r) => r.source === "nbp")?.carriedDays).toBeUndefined();
    expect(rows.find((r) => r.source === "carried_forward")?.carriedDays).toBe(3);
  });

  // C2 — an unlocatable origin marks the row `carriedDays: null`, explicit
  // and distinct from `0`, which would read as an exact quote.
  it("marks carriedDays null on a carried_forward row with no locatable origin", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values({
        base: PLN,
        quote: USD,
        date: accountingDate("2026-01-05"),
        rate: money.unitsPerPivot("4.00"),
        source: "carried_forward",
      })
      .run();

    const rows = listFxRates(s.ledger.replica.db, {
      base: PLN,
      quote: USD,
      from: accountingDate("2026-01-05"),
      to: accountingDate("2026-01-05"),
    });

    expect(rows[0]?.carriedDays).toBeNull();
  });
});

describe("readCurrencySettings", () => {
  it("lists every non-archived currency with the full row S17 needs", () => {
    write(setPinnedExecutor, { code: "USD", version: 1, pinned: true });

    const rows = readCurrencySettings(s.ledger.replica.db);
    const usd = rows.find((row) => row.code === "USD");

    expect(usd).toEqual(
      expect.objectContaining({ code: "USD", pinned: true, isPivot: false, version: 2 }),
    );
    // PLN is this fixture's pivot (see `beforeEach`) — S17 shows it read-only.
    expect(rows.find((row) => row.code === "PLN")).toEqual(
      expect.objectContaining({ code: "PLN", isPivot: true }),
    );
  });

  it("excludes an archived currency by default, and includes it with the option", () => {
    write(archiveCurrencyExecutor, { code: "EUR", version: 1 });

    expect(readCurrencySettings(s.ledger.replica.db).some((row) => row.code === "EUR")).toBe(false);
    expect(
      readCurrencySettings(s.ledger.replica.db, { includeArchived: true }).some(
        (row) => row.code === "EUR",
      ),
    ).toBe(true);
  });
});

// L1 — `readCurrencies.capturable` must agree with `readNearestRate`'s own
// refusal: a pair whose only rows are `carried_forward`, with no real quote
// anywhere for it to descend from, is not capturable, however many carried
// rows it holds.
describe("readCurrencies", () => {
  it("is capturable once a real quote exists", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values({
        base: PLN,
        quote: USD,
        date: accountingDate("2026-01-01"),
        rate: money.unitsPerPivot("4.00"),
        source: "nbp",
      })
      .run();

    const usd = readCurrencies(s.ledger.replica.db).find((c) => c.code === "USD");
    expect(usd?.capturable).toBe(true);
  });

  it("is not capturable when every row for the pair is an orphaned carried_forward copy", () => {
    s.ledger.replica.db
      .insert(fxRates)
      .values({
        base: PLN,
        quote: USD,
        date: accountingDate("2026-01-05"),
        rate: money.unitsPerPivot("4.00"),
        source: "carried_forward",
      })
      .run();

    const usd = readCurrencies(s.ledger.replica.db).find((c) => c.code === "USD");
    expect(usd?.capturable).toBe(false);
  });
});

/* ── capture, once a rate has been set by hand ───────────────────────────── */

describe("capture in a currency that gained a rate through set_manual_rate", () => {
  it("succeeds offline once a manual rate exists, and prices amount_pivot from it", () => {
    write(setManualRateExecutor, {
      base: "PLN",
      quote: "USD",
      from: "2026-03-12",
      to: "2026-03-12",
      rate: "4.00",
      today: "2026-06-01",
    });

    // A capture in USD now resolves through `lastKnownRate` — the same path
    // an already-synced pair would take, but this pair had no rate at all
    // until the write above.
    const result = write(createTransactionExecutor, {
      id: TXN,
      date: "2026-03-12",
      type: "expense",
      accountId: ACCOUNT,
      amountOriginal: "18.00",
      currency: "USD",
    });

    // fx_rates is PLN→USD at 4.00 units-per-pivot; the transaction's own
    // fx_rate is pivot-per-unit — the reciprocal, 1/4.00 = 0.25.
    expect(result.row.fxRate).toBe(money.pivotPerUnit("0.25"));
  });
});

/* ── readCrossRate ────────────────────────────────────────────────────────── */

describe("readCrossRate", () => {
  const DATE = accountingDate("2026-03-01");

  beforeEach(() => {
    // USD is the pivot for this block — the outer `beforeEach` seeded PLN as
    // the pivot, which every other describe here relies on, so this block
    // flips it rather than reaching for a second `scratchStores()`.
    // `fx_rates.base = pivot` always (§4), so USD↔PLN and USD↔EUR are the
    // only pairs the replica ever stores.
    s.ledger.replica.db
      .update(currencies)
      .set({ isPivot: false })
      .where(eq(currencies.code, PLN))
      .run();
    s.ledger.replica.db
      .update(currencies)
      .set({ isPivot: true })
      .where(eq(currencies.code, USD))
      .run();
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        { base: USD, quote: PLN, date: DATE, rate: money.unitsPerPivot("4.0"), source: "nbp" },
        { base: USD, quote: EUR, date: DATE, rate: money.unitsPerPivot("0.92"), source: "nbp" },
      ])
      .run();
  });

  it("triangulates EUR→PLN — rate(to) ÷ rate(from), rounded once at PivotPerUnit's own scale", () => {
    const cross = readCrossRate(s.ledger.replica.db, { from: EUR, to: PLN, date: DATE });
    // 4.0 / 0.92 = 4.3478260869565217…, rounded half-up at `PivotPerUnit`'s
    // twelve decimal places — not the ledger's usual eight, and not
    // re-rounded a second time by this assertion.
    expect(cross?.rate).toBe(money.crossRate("4.347826086957"));
  });

  it("triangulates PLN→EUR the other way", () => {
    const cross = readCrossRate(s.ledger.replica.db, { from: PLN, to: EUR, date: DATE });
    expect(cross?.rate).toBe(money.crossRate("0.23"));
  });

  it("is exactly 1 when the same currency is on both sides", () => {
    const cross = readCrossRate(s.ledger.replica.db, { from: EUR, to: EUR, date: DATE });
    expect(cross?.rate).toBe(money.crossRate("1"));
  });

  it("collapses to the plain readRate when the pivot is the destination", () => {
    const direct = readRate(s.ledger.replica.db, { base: USD, quote: PLN, date: DATE });
    if (direct === undefined) throw new Error("setup: expected a direct rate");
    const cross = readCrossRate(s.ledger.replica.db, { from: PLN, to: USD, date: DATE });
    // `readRate` holds PLN in units-per-pivot; the cross rate asked for is
    // pivot-per-unit — its reciprocal.
    expect(cross?.rate).toBe(money.crossRate(money.reciprocal(direct.rate)));
  });

  it("collapses to the plain readRate when the pivot is the source", () => {
    const direct = readRate(s.ledger.replica.db, { base: USD, quote: PLN, date: DATE });
    if (direct === undefined) throw new Error("setup: expected a direct rate");
    const cross = readCrossRate(s.ledger.replica.db, { from: USD, to: PLN, date: DATE });
    // Valuing 1 pivot unit in PLN is exactly what `readRate` already holds —
    // rebranded pivot-per-unit, not recomputed.
    expect(cross?.rate).toBe(money.crossRate(direct.rate));
  });

  /**
   * H2 — `readCrossRate` reports both legs whole and unmixed now: the USD
   * (pivot) leg is always the fabricated `source: "pivot"` self-leg and the
   * PLN leg is always the real `nbp` row, regardless of which side of the
   * pair each currency lands on. Picking which of the two to *display* (M1's
   * old concern — never the fabricated leg when a real one exists) moved to
   * `crossRateProvenance` (`packages/client`), tested there.
   */
  it("H2: reports each leg's own provenance — source, asOf and carriedDays together, never mixed across legs", () => {
    const fromPivot = readCrossRate(s.ledger.replica.db, { from: USD, to: PLN, date: DATE });
    expect(fromPivot?.legs.from).toMatchObject({ source: "pivot", asOf: DATE, carriedDays: 0 });
    expect(fromPivot?.legs.to).toMatchObject({ source: "nbp", asOf: DATE, carriedDays: 0 });

    const toPivot = readCrossRate(s.ledger.replica.db, { from: PLN, to: USD, date: DATE });
    expect(toPivot?.legs.from).toMatchObject({ source: "nbp", asOf: DATE, carriedDays: 0 });
    expect(toPivot?.legs.to).toMatchObject({ source: "pivot", asOf: DATE, carriedDays: 0 });
  });

  it("H2: keeps a manual leg's own provenance separate from the other leg's", () => {
    // EUR's leg gets a manual correction; PLN's stays the automatic `nbp`
    // quote seeded in `beforeEach`. Each leg reports its own source, never
    // borrowed onto the other.
    s.ledger.replica.db
      .update(fxRates)
      .set({ source: "manual" })
      .where(and(eq(fxRates.base, USD), eq(fxRates.quote, EUR), eq(fxRates.date, DATE)))
      .run();

    const cross = readCrossRate(s.ledger.replica.db, { from: EUR, to: PLN, date: DATE });
    expect(cross?.legs.from.source).toBe("manual");
    expect(cross?.legs.to.source).toBe("nbp");
  });

  it("is undefined when either leg has no rate at all", () => {
    const cross = readCrossRate(s.ledger.replica.db, {
      from: EUR,
      to: currencyCode("GBP"),
      date: DATE,
    });
    expect(cross).toBeUndefined();
  });

  it("honours the carry-forward cap on the source leg", () => {
    // PLN gets a fresh row at the query date; EUR's only row is the twelve
    // days back seeded above — past `MAX_CARRY_DAYS` on its own, and the
    // whole cross rate must refuse rather than triangulate through a stale
    // leg silently.
    const queryDate = accountingDate("2026-03-13");
    s.ledger.replica.db
      .insert(fxRates)
      .values({
        base: USD,
        quote: PLN,
        date: queryDate,
        rate: money.unitsPerPivot("4.1"),
        source: "nbp",
      })
      .run();

    expect(
      readCrossRate(s.ledger.replica.db, { from: EUR, to: PLN, date: queryDate }),
    ).toBeUndefined();
  });

  it("honours the carry-forward cap on the destination leg", () => {
    const queryDate = accountingDate("2026-03-13");
    s.ledger.replica.db
      .insert(fxRates)
      .values({
        base: USD,
        quote: EUR,
        date: queryDate,
        rate: money.unitsPerPivot("0.93"),
        source: "nbp",
      })
      .run();

    expect(
      readCrossRate(s.ledger.replica.db, { from: PLN, to: EUR, date: queryDate }),
    ).toBeUndefined();
  });
});
