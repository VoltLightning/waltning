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
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { addCurrencyExecutor } from "../currencies/add-currency.executor.ts";
import { archiveCurrencyExecutor } from "../currencies/archive-currency.executor.ts";
import { changePivotExecutor } from "../currencies/change-pivot.executor.ts";
import { clearManualRateExecutor } from "../currencies/clear-manual-rate.executor.ts";
import { readCurrencySettings } from "../currencies/read-currency-settings.ts";
import { listFxRates, readCoverage, readCrossRate, readRate } from "../currencies/read-rate.ts";
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

  // M6 — the orphan-drop test above only proves the drop. This is its
  // inverse: a carried row whose origin's date *does* have a bridge must
  // survive the rewrite and come out rebased, not dropped along with it.
  it("M6 — keeps and rebases a carried_forward row whose origin's date has a bridge", () => {
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
    expect(eurRows).toHaveLength(2);
    const day2 = eurRows.find((r) => r.date === accountingDate("2026-01-02"));
    expect(day2?.source).toBe("carried_forward");
    expect(day2?.rate).toBeDefined();
  });

  // M8 — §7.6: a carried row is a copy of the nearest earlier real quote,
  // and that must still hold after a pivot rewrite. Rebasing a carried row
  // by *its own date's* bridge (0.20 on day 2) rather than its *origin's*
  // bridge (0.25 on day 1) would make it 0.23/0.20 = 1.15 while its origin
  // becomes 0.23/0.25 = 0.92 — the same stored rate, two different rebased
  // answers, and no longer a copy of anything.
  it("M8 — a kept carried row rebases by its origin's bridge, staying a copy", () => {
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
    expect(eurRows).toHaveLength(2);
    const rates = new Set(eurRows.map((r) => r.rate));
    // Both rows — the origin and the kept carried copy — land on the same
    // rebased value: 0.23 / 0.25 = 0.92, never the carried row's own-date
    // bridge answer of 0.23 / 0.20 = 1.15.
    expect(rates).toEqual(new Set([money.unitsPerPivot("0.92")]));
  });

  // L3 — the outer loop used to `continue` a whole date bucket with no
  // bridge of its own, dropping every row on it including a carried row
  // whose *origin* (an earlier date) does have a bridge. M8's own per-row
  // rebase never even ran for that row. Day 2 here has no USD bridge at
  // all, only EUR carried forward from day 1 — it must still survive.
  it("L3 — keeps a carried row on a date with no bridge of its own, when its origin's date has one", () => {
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

    write(changePivotExecutor, { code: "USD" });

    const eurRows = rateRows().filter((r) => r.base === "USD" && r.quote === "EUR");
    expect(eurRows).toHaveLength(2);
    const day2 = eurRows.find((r) => r.date === accountingDate("2026-01-02"));
    expect(day2?.source).toBe("carried_forward");
    // Rebased by the origin's (day 1) bridge: 0.23 / 0.25 = 0.92.
    expect(day2?.rate).toBe(money.unitsPerPivot("0.92"));
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

  // M4 — a manual rate set into the future must not inflate `days` (or the
  // percentage) past what `calendarDays` — counted only through today —
  // actually covers.
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
        // Set past `today` — S18's "set a range" allows a future end date.
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
        futureRows: 1,
      }),
    );
  });

  // L7 — a currency whose only rows are future-dated has `days === 0`, the
  // same shape as no rows at all — but it is not "no rates yet": someone set
  // a rate, it just is not due yet. `futureRows` is how `CoverageTag` tells
  // the two states apart.
  it("L7 — a currency with only future-dated rows reports futureRows, not empty", () => {
    const today = accountingDate("2026-01-05");
    s.ledger.replica.db
      .insert(fxRates)
      .values([
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-10"),
          rate: money.unitsPerPivot("4.00"),
          source: "manual",
        },
        {
          base: PLN,
          quote: USD,
          date: accountingDate("2026-01-11"),
          rate: money.unitsPerPivot("4.00"),
          source: "manual",
        },
      ])
      .run();

    const coverage = readCoverage(s.ledger.replica.db, today);
    expect(coverage.find((c) => c.code === "USD")).toEqual(
      expect.objectContaining({ days: 0, calendarDays: 0, coveragePct: 0, futureRows: 2 }),
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
