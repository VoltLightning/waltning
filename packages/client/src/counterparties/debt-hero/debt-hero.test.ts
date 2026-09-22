/**
 * `debtHero` — S12 §3's three figures, and the one case where it answers
 * with none.
 */

import { accountingDate } from "@waltning/core/date";
import { currencyCode, toMoney, unitsPerPivot } from "@waltning/core/money";
import { expect, it } from "vitest";
import { debtHero } from "./debt-hero.ts";

const PLN = currencyCode("PLN");
const EUR = currencyCode("EUR");
const TODAY = accountingDate("2026-09-22");

const line = (currency: typeof PLN, balance: string) => ({
  currency,
  balance: toMoney(balance),
  decimals: 2,
});

/**
 * EUR quoted against a PLN pivot: 0.23 EUR to one złoty. The pivot answers
 * for itself at 1 — `fx_rates` never quotes it against itself, and
 * `makeRateOf` resolves that identity the same way.
 */
const rateOf = (currency: typeof PLN) =>
  currency === EUR
    ? { rate: unitsPerPivot("0.23"), asOf: TODAY }
    : currency === PLN
      ? { rate: unitsPerPivot("1"), asOf: TODAY }
      : null;

it("splits the lines by direction and states the gap between them", () => {
  const hero = debtHero([line(PLN, "840"), line(PLN, "-240")], PLN, rateOf, 2);
  expect(hero).toMatchObject({
    lent: "840.00000000",
    owed: "240.00000000",
    net: "600.00000000",
    currency: PLN,
  });
});

/** What is owed folds from negative balances and is stated as a magnitude. */
it("makes what you owe positive, because the label already says the direction", () => {
  const hero = debtHero([line(PLN, "-120")], PLN, rateOf, 2);
  expect(hero?.owed).toBe("120.00000000");
  // P5 — the magnitude, with `direction` carrying the way it points: a hero
  // reading *comes back to you · −120,00* states direction by sign alone.
  expect(hero?.net).toBe("120.00000000");
  expect(hero?.direction).toBe("you-owe");
});

it("points forward when nothing is owed either way", () => {
  const hero = debtHero([line(PLN, "0")], PLN, rateOf, 2);
  expect(hero?.net).toBe("0.00000000");
  expect(hero?.direction).toBe("comes-back");
});

it("points back to you when more is lent than owed", () => {
  const hero = debtHero([line(PLN, "500"), line(PLN, "-120")], PLN, rateOf, 2);
  expect(hero?.net).toBe("380.00000000");
  expect(hero?.direction).toBe("comes-back");
});

it("folds a foreign balance through its rate", () => {
  // 23 EUR at 0.23 EUR per złoty is 100 zł.
  const hero = debtHero([line(EUR, "23")], PLN, rateOf, 2);
  expect(hero?.lent).toBe("100.00000000");
});

/**
 * P1 — a headline built from lines the replica cannot value is a total with
 * a hole in it. No hero at all is the honest answer; the per-currency card
 * states each currency on its own terms.
 */
it("answers nothing when a held currency has no rate", () => {
  const noEurRate = (currency: typeof PLN) =>
    currency === PLN ? { rate: unitsPerPivot("1"), asOf: TODAY } : null;
  expect(debtHero([line(PLN, "840"), line(EUR, "74.44")], PLN, noEurRate, 2)).toBeNull();
});

/** Nothing held is not a state with figures in it. */
it("answers nothing for an empty ledger", () => {
  expect(debtHero([], PLN, rateOf, 2)).toBeNull();
});
