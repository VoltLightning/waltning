import { accountingDate } from "@waltning/core/date";
import { currencyCode, dec, toMoney, toPivot, unitsPerPivot } from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import {
  groupByCounterparty,
  makeRateOf,
  resolveCounterpartyFigures,
} from "./counterparty-figures.ts";

const PLN = currencyCode("PLN");
const EUR = currencyCode("EUR");
const JPY = currencyCode("JPY");
const TODAY = accountingDate("2026-09-04");

const PLN_EUR_CURRENCIES = [
  { code: PLN, decimals: 2 },
  { code: EUR, decimals: 2 },
];

describe("resolveCounterpartyFigures", () => {
  /**
   * P1's BLOCKER case — Nina settles in EUR, holds PLN +840 (no PLN rate on
   * the replica) and EUR −120. The old fold fell back to the EUR line alone
   * and rendered *−120,00 € you owe* — a real debt in the wrong direction.
   * The fix: no rate for a held currency means no net at all, ever.
   */
  it("is absent — never a substitute single-currency balance — when a held currency has no rate", () => {
    const nina = {
      settlementCurrency: EUR,
      balances: [
        { currency: PLN, balance: toMoney("840"), decimals: 2 },
        { currency: EUR, balance: toMoney("-120"), decimals: 2 },
      ],
    };
    // The replica's pivot is EUR (Nina's own settlement currency) and holds
    // no PLN rate at all — the PLN line she also holds has nothing to fold
    // into EUR with.
    const readRate = () => null;
    const rateOf = makeRateOf(readRate, EUR, TODAY);

    const figures = resolveCounterpartyFigures(nina, EUR, rateOf, PLN_EUR_CURRENCIES);

    expect(figures.value).toBeNull();
    expect(figures.display).toBeNull();
    // The preference is still stated, for the label — just no figure to show against it.
    expect(figures.currency).toBe(EUR);
  });

  /**
   * The same Nina, with a PLN rate now on hand: 1 EUR = 4.32 PLN (the
   * replica's pivot is PLN, so `fx_rates` stores EUR at units-of-EUR-per-PLN,
   * `1 / 4.32`). The true net is +74.44 € (they owe you), which is +321.60 zł
   * at that same rate — the numbers the BLOCKER's own example names.
   */
  it("folds every held currency once a rate exists for each — the true net, and its display equivalent", () => {
    const nina = {
      settlementCurrency: EUR,
      balances: [
        { currency: PLN, balance: toMoney("840"), decimals: 2 },
        { currency: EUR, balance: toMoney("-120"), decimals: 2 },
      ],
    };
    const eurPerPln = unitsPerPivot(dec(1).dividedBy("4.32").toFixed(12));
    const readRate = (pair: { base: string; quote: string }) =>
      pair.quote === "EUR" ? { rate: eurPerPln, asOf: TODAY } : null;
    const rateOf = makeRateOf(readRate, PLN, TODAY);

    const figures = resolveCounterpartyFigures(nina, PLN, rateOf, PLN_EUR_CURRENCIES);
    if (figures.value === null) throw new Error("expected a complete net");
    if (figures.display === null) throw new Error("expected a display equivalent");

    expect(figures.currency).toBe(EUR);
    expect(toMoney(figures.value, 2)).toBe("74.44");

    expect(figures.display.currency).toBe(PLN);
    const displayValue = toPivot(figures.value, figures.display.rate);
    expect(toMoney(displayValue, 2)).toBe("321.60");
  });

  it("is complete with no rate at all when the group holds only its own settlement currency", () => {
    const cashOnly = {
      settlementCurrency: PLN,
      balances: [{ currency: PLN, balance: toMoney("50"), decimals: 2 }],
    };
    const rateOf = makeRateOf(() => null, PLN, TODAY);

    const figures = resolveCounterpartyFigures(cashOnly, PLN, rateOf, PLN_EUR_CURRENCIES);

    expect(figures.value).toBe(toMoney("50"));
    expect(figures.display).toBeNull();
  });

  /** H3 — decimals come from `snapshot.currencies`, never a default, for a settlement currency held by nobody. */
  it("takes decimals from the currency list, not a default, when the settlement currency is not among held balances (H3)", () => {
    const jpySettling = {
      settlementCurrency: JPY,
      balances: [{ currency: PLN, balance: toMoney("25200"), decimals: 2 }],
    };
    const readRate = (pair: { base: string; quote: string }) =>
      pair.quote === "JPY" ? { rate: unitsPerPivot("0.025"), asOf: TODAY } : null;
    const rateOf = makeRateOf(readRate, PLN, TODAY);
    const currencies = [
      { code: PLN, decimals: 2 },
      { code: JPY, decimals: 0 },
    ];

    const figures = resolveCounterpartyFigures(jpySettling, PLN, rateOf, currencies);

    expect(figures.decimals).toBe(0);
  });

  /** H3 — the display leg (settlement → pivot) carries the pivot's own scale too, not a default. */
  it("carries the display currency's own scale (H3)", () => {
    const eightDpCurrency = currencyCode("BTC");
    const holder = {
      settlementCurrency: eightDpCurrency,
      balances: [{ currency: eightDpCurrency, balance: toMoney("1.23456789"), decimals: 8 }],
    };
    const readRate = (pair: { base: string; quote: string }) =>
      pair.quote === "BTC" ? { rate: unitsPerPivot("0.00001"), asOf: TODAY } : null;
    const rateOf = makeRateOf(readRate, PLN, TODAY);
    const currencies = [
      { code: PLN, decimals: 2 },
      { code: eightDpCurrency, decimals: 8 },
    ];

    const figures = resolveCounterpartyFigures(holder, PLN, rateOf, currencies);
    if (figures.display === null) throw new Error("expected a display equivalent");

    expect(figures.display.decimals).toBe(2);
  });

  /** M3 — deterministic without a settlement currency: the pivot wins if held. */
  it("prefers the pivot when the counterparty has no settlement currency and holds it (M3)", () => {
    const noPreference = {
      settlementCurrency: null,
      balances: [
        { currency: EUR, balance: toMoney("10"), decimals: 2 },
        { currency: PLN, balance: toMoney("500"), decimals: 2 },
      ],
    };
    const rateOf = makeRateOf(() => ({ rate: unitsPerPivot("1"), asOf: TODAY }), PLN, TODAY);

    const figures = resolveCounterpartyFigures(noPreference, PLN, rateOf, PLN_EUR_CURRENCIES);

    expect(figures.currency).toBe(PLN);
  });

  /** M3 — no settlement currency, pivot not held: the largest absolute balance wins, row order irrelevant. */
  it("prefers the largest absolute balance when the pivot is not held (M3)", () => {
    const usd = currencyCode("USD");
    const noPreference = {
      settlementCurrency: null,
      balances: [
        { currency: EUR, balance: toMoney("10"), decimals: 2 },
        { currency: usd, balance: toMoney("-500"), decimals: 2 },
      ],
    };
    const rateOf = makeRateOf(() => ({ rate: unitsPerPivot("1"), asOf: TODAY }), PLN, TODAY);
    const currencies = [...PLN_EUR_CURRENCIES, { code: usd, decimals: 2 }];

    const figures = resolveCounterpartyFigures(noPreference, PLN, rateOf, currencies);

    expect(figures.currency).toBe(usd);
  });

  /** M3 — a tie in magnitude breaks by currency code, not by row order. */
  it("breaks a magnitude tie by currency code (M3)", () => {
    const usd = currencyCode("USD");
    const rowOrderA = {
      settlementCurrency: null,
      balances: [
        { currency: usd, balance: toMoney("100"), decimals: 2 },
        { currency: EUR, balance: toMoney("-100"), decimals: 2 },
      ],
    };
    const rowOrderB = {
      settlementCurrency: null,
      balances: [
        { currency: EUR, balance: toMoney("-100"), decimals: 2 },
        { currency: usd, balance: toMoney("100"), decimals: 2 },
      ],
    };
    const rateOf = makeRateOf(() => ({ rate: unitsPerPivot("1"), asOf: TODAY }), PLN, TODAY);
    const currencies = [...PLN_EUR_CURRENCIES, { code: usd, decimals: 2 }];

    expect(resolveCounterpartyFigures(rowOrderA, PLN, rateOf, currencies).currency).toBe(EUR);
    expect(resolveCounterpartyFigures(rowOrderB, PLN, rateOf, currencies).currency).toBe(EUR);
  });
});

describe("groupByCounterparty", () => {
  it("folds §7's rows into one group per counterparty, dropping zero balances", () => {
    const rows = [
      {
        counterpartyId: "c1",
        name: "Nina",
        kind: "person" as const,
        settlementCurrency: EUR,
        currency: PLN,
        decimals: 2,
        balance: toMoney("840"),
        ageDays: null,
        bucket: null,
      },
      {
        counterpartyId: "c1",
        name: "Nina",
        kind: "person" as const,
        settlementCurrency: EUR,
        currency: EUR,
        decimals: 2,
        balance: toMoney("0"),
        ageDays: null,
        bucket: null,
      },
    ];

    const groups = groupByCounterparty(rows);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.balances).toEqual([{ currency: PLN, balance: toMoney("840"), decimals: 2 }]);
  });
});
