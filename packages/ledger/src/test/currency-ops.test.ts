/**
 * The seven FX operations, as the phone applies them — `add_currency`
 * `archive_currency` `set_rate_source` `set_pinned` `change_pivot`
 * `set_manual_rate` `clear_manual_rate` — plus `readRate`, `readCoverage`
 * and `listFxRates`.
 *
 * Same harness as `account-ops.test.ts` and `category-ops.test.ts`: real
 * two-file writes through `writeLocally` and the real `ledgerRegistry`.
 */

import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import { addCurrencyExecutor } from "../currencies/add-currency.executor.ts";
import { archiveCurrencyExecutor } from "../currencies/archive-currency.executor.ts";
import { changePivotExecutor } from "../currencies/change-pivot.executor.ts";
import { clearManualRateExecutor } from "../currencies/clear-manual-rate.executor.ts";
import { listFxRates, readCoverage, readCrossRate, readRate } from "../currencies/read-rate.ts";
import { readCurrencySettings } from "../currencies/read-currency-settings.ts";
import { listFxRates, readCoverage, readRate } from "../currencies/read-rate.ts";
import { setManualRateExecutor } from "../currencies/set-manual-rate.executor.ts";
import { setPinnedExecutor } from "../currencies/set-pinned.executor.ts";
import { setRateSourceExecutor } from "../currencies/set-rate-source.executor.ts";
import type { LocalExecutor } from "../executor.ts";
import { ledgerRegistry } from "../registry.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import { createTransactionExecutor } from "../transactions/create-transaction.executor.ts";
import { deleteTransactionExecutor } from "../transactions/delete-transaction.executor.ts";
import type { Capture, LocalTx, LocalWriteResult } from "../write.ts";
import { writeLocally } from "../write.ts";
import { type ScratchStores, scratchStores } from "./stores.ts";

const { accounts, currencies, fxRates, transactions } = schema;

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
    });

    expect(() =>
      write(setManualRateExecutor, {
        base: "PLN",
        quote: "USD",
        from: "2026-01-01",
        to: "2026-01-01",
        rate: "0.26",
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
    });

    const result = write(setManualRateExecutor, {
      base: "PLN",
      quote: "USD",
      from: "2026-01-01",
      to: "2026-01-01",
      rate: "0.26",
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
    });

    expect(() =>
      write(setManualRateExecutor, {
        base: "PLN",
        quote: "USD",
        from: "2026-01-01",
        to: "2026-01-03",
        rate: "0.30",
      }),
    ).toThrow();

    // The one row from the first write is untouched — nothing from the
    // second, refused write landed.
    expect(rateRows()).toHaveLength(1);
    expect(rateRows()[0]?.rate).toBe("0.25");
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

    expect(result.row).toEqual({ deleted: 1 });
    expect(rateRows()).toHaveLength(1);
    expect(rateRows()[0]?.source).toBe("nbp");
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
    expect(cross?.rate).toBe(money.pivotPerUnit("4.347826086957"));
  });

  it("triangulates PLN→EUR the other way", () => {
    const cross = readCrossRate(s.ledger.replica.db, { from: PLN, to: EUR, date: DATE });
    expect(cross?.rate).toBe(money.pivotPerUnit("0.23"));
  });

  it("is exactly 1 when the same currency is on both sides", () => {
    const cross = readCrossRate(s.ledger.replica.db, { from: EUR, to: EUR, date: DATE });
    expect(cross?.rate).toBe(money.pivotPerUnit("1"));
  });

  it("collapses to the plain readRate when the pivot is the destination", () => {
    const direct = readRate(s.ledger.replica.db, { base: USD, quote: PLN, date: DATE });
    if (direct === undefined) throw new Error("setup: expected a direct rate");
    const cross = readCrossRate(s.ledger.replica.db, { from: PLN, to: USD, date: DATE });
    // `readRate` holds PLN in units-per-pivot; the cross rate asked for is
    // pivot-per-unit — its reciprocal.
    expect(cross?.rate).toBe(money.reciprocal(direct.rate));
  });

  it("collapses to the plain readRate when the pivot is the source", () => {
    const direct = readRate(s.ledger.replica.db, { base: USD, quote: PLN, date: DATE });
    if (direct === undefined) throw new Error("setup: expected a direct rate");
    const cross = readCrossRate(s.ledger.replica.db, { from: USD, to: PLN, date: DATE });
    // Valuing 1 pivot unit in PLN is exactly what `readRate` already holds —
    // rebranded pivot-per-unit, not recomputed.
    expect(cross?.rate).toBe(direct.rate);
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
