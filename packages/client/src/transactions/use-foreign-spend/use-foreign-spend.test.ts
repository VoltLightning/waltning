/** @vitest-environment jsdom */

/**
 * §7.8 — the currency chip's state and the charged figure behind it: *350 CZK
 * on a EUR card* is typed as `350`, and what the account was charged is
 * pre-filled at the day's cross rate until the person types over it.
 */

import { act, renderHook } from "@testing-library/react";
import type { AccountingDate } from "@waltning/core/date";
import { accountingDate } from "@waltning/core/date";
import { crossRate, currencyCode } from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { type ForeignCrossRate, useForeignSpend } from "./use-foreign-spend.ts";

const EUR = currencyCode("EUR");
const CZK = currencyCode("CZK");
const ACCOUNT = { currency: EUR, decimals: 2 };

const answer = (rate: string, asOf: AccountingDate): ForeignCrossRate => ({
  rate: crossRate(rate),
  legs: { from: { asOf }, to: { asOf } },
});

/** A ledger that knows one rate, on any day, and records what it is asked. */
function ledger(found: ForeignCrossRate | null) {
  return vi.fn(
    (_pair: { from: typeof CZK; to: typeof EUR; date: AccountingDate }): ForeignCrossRate | null =>
      found,
  );
}

function draw(
  readCrossRate: ReturnType<typeof ledger>,
  initial: { amount: string | null; date: string; account?: typeof ACCOUNT | null },
) {
  return renderHook(
    (props: { amount: string | null; date: string; account: typeof ACCOUNT | null }) =>
      useForeignSpend({ readCrossRate, revision: 0, ...props }),
    { initialProps: { account: ACCOUNT, ...initial } },
  );
}

it("is in the account's own currency until another is chosen, and charges nothing then", () => {
  const read = ledger(answer("0.040057", accountingDate("2026-09-01")));
  const { result } = draw(read, { amount: "350", date: "2026-09-01" });
  expect(result.current.paidCurrency).toBeNull();
  expect(result.current.chargedRaw).toBe("");
  expect(read).not.toHaveBeenCalled();
});

it("pre-fills what the account was charged at the entry day's cross rate", () => {
  const read = ledger(answer("0.040057", accountingDate("2026-09-01")));
  const { result } = draw(read, { amount: "350", date: "2026-09-01" });
  act(() => result.current.setPaidCurrency("CZK"));
  expect(result.current.paidCurrency).toBe(CZK);
  expect(result.current.chargedRaw, "350 × 0.040057, to the account's two decimals").toBe("14,02");
  expect(read).toHaveBeenLastCalledWith({ from: CZK, to: EUR, date: "2026-09-01" });
  expect(result.current.rate?.asOf).toBe("2026-09-01");
});

it("follows the amount and the day while it is still the guess", () => {
  const read = ledger(answer("0.04", accountingDate("2026-09-01")));
  const { result, rerender } = draw(read, { amount: "350", date: "2026-09-01" });
  act(() => result.current.setPaidCurrency("CZK"));
  expect(result.current.chargedRaw).toBe("14,00");
  rerender({ amount: "500", date: "2026-09-01", account: ACCOUNT });
  expect(result.current.chargedRaw).toBe("20,00");
  rerender({ amount: "500", date: "2026-08-30", account: ACCOUNT });
  expect(read).toHaveBeenLastCalledWith({ from: CZK, to: EUR, date: "2026-08-30" });
});

it("stops following once it has been typed over — the bank statement is the truth", () => {
  const read = ledger(answer("0.04", accountingDate("2026-09-01")));
  const { result, rerender } = draw(read, { amount: "350", date: "2026-09-01" });
  act(() => result.current.setPaidCurrency("CZK"));
  act(() => result.current.setChargedRaw("14,02"));
  expect(result.current.chargedEdited).toBe(true);
  rerender({ amount: "500", date: "2026-09-01", account: ACCOUNT });
  expect(result.current.chargedRaw).toBe("14,02");
});

it("drops the edit when another currency is chosen — that is a new question", () => {
  const read = ledger(answer("0.04", accountingDate("2026-09-01")));
  const { result } = draw(read, { amount: "350", date: "2026-09-01" });
  act(() => result.current.setPaidCurrency("CZK"));
  act(() => result.current.setChargedRaw("14,02"));
  act(() => result.current.setPaidCurrency("CZK"));
  expect(result.current.chargedEdited).toBe(false);
  expect(result.current.chargedRaw).toBe("14,00");
});

it("leaves the figure empty with no rate for the day, rather than pricing it at one", () => {
  const read = ledger(null);
  const { result } = draw(read, { amount: "350", date: "2026-09-01" });
  act(() => result.current.setPaidCurrency("CZK"));
  expect(result.current.rate).toBeNull();
  expect(result.current.chargedRaw).toBe("");
  act(() => result.current.setChargedRaw("14,02"));
  expect(result.current.chargedRaw, "typed by hand, it is the person's own").toBe("14,02");
});

it("reads a currency equal to the account's as no foreign currency at all", () => {
  const read = ledger(answer("0.04", accountingDate("2026-09-01")));
  const { result, rerender } = draw(read, { amount: "350", date: "2026-09-01" });
  act(() => result.current.setPaidCurrency("CZK"));
  rerender({ amount: "350", date: "2026-09-01", account: { currency: CZK, decimals: 2 } });
  expect(result.current.paidCurrency).toBeNull();
});

it("asks no rate for a day that is still being typed", () => {
  const read = ledger(answer("0.04", accountingDate("2026-09-01")));
  const { result } = draw(read, { amount: "350", date: "2026-09-0" });
  act(() => result.current.setPaidCurrency("CZK"));
  expect(read).not.toHaveBeenCalled();
  expect(result.current.chargedRaw).toBe("");
});

it("reports the staler leg's day as the rate's own", () => {
  const read = ledger({
    rate: crossRate("0.04"),
    legs: {
      from: { asOf: accountingDate("2026-08-28") },
      to: { asOf: accountingDate("2026-09-01") },
    },
  });
  const { result } = draw(read, { amount: "350", date: "2026-09-01" });
  act(() => result.current.setPaidCurrency("CZK"));
  expect(result.current.rate?.asOf).toBe("2026-08-28");
});
