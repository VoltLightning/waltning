/**
 * @vitest-environment jsdom
 *
 * `use-lead-currency.ts` — which subtotal a shell hero leads with, tested
 * where the decision is made rather than through a rendered band. The rule has
 * three branches and only one of them is the ordinary case, so a shell test
 * covers whichever branch its fixture happens to hit and no more.
 */

import { renderHook } from "@testing-library/react";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import {
  createPhoneLedger,
  type PhoneAccount,
  type PhoneLedgerPort,
} from "./create-phone-ledger.ts";
import { basePort } from "./test-port.ts";
import { useLeadCurrency } from "./use-lead-currency.ts";

const CHF = currencyCode("CHF");
const EUR = currencyCode("EUR");
const PLN = currencyCode("PLN");

function fakeController(listAccounts: PhoneLedgerPort["listAccounts"]) {
  return createPhoneLedger(basePort({ listAccounts }), {
    capture: () => ({
      date: accountingDate("2026-09-04"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-09-04T10:00:00Z"),
    }),
    id: () => id("22222222-2222-4222-8222-222222222222"),
  });
}

function account(overrides: Partial<PhoneAccount>): PhoneAccount {
  return {
    id: id<"accounts">("55555555-5555-4555-8555-555555555555"),
    name: "Bank A · PLN",
    kind: "bank",
    currency: PLN,
    decimals: 2,
    balance: money.toMoney("100.00"),
    groupId: null,
    ownership: "own",
    isBusiness: false,
    archived: false,
    expectedBalance: null,
    openingBalance: money.toMoney("0"),
    openingDate: null,
    memo: "",
    version: 1,
    ...overrides,
  };
}

describe("useLeadCurrency", () => {
  it("leads with the display currency when the ledger holds it", () => {
    const ledger = fakeController(() => [
      account({ currency: CHF, balance: money.toMoney("9000.00") }),
      account({
        id: id<"accounts">("66666666-6666-4666-8666-666666666666"),
        name: "Bank B · EUR",
        currency: EUR,
        balance: money.toMoney("40.00"),
      }),
    ]);
    const { result } = renderHook(() => useLeadCurrency(ledger, EUR));

    expect(result.current).toEqual({
      entry: { currency: EUR, decimals: 2, balance: money.toMoney("40.00") },
      fallback: false,
    });
  });

  /**
   * **M-1.** Ledger order, not magnitude — `design-system/05` row 12 refuses a
   * cross-currency ranking outright, and this hero has no rates to rank with.
   * The fixture makes the two rules disagree on purpose: `CHF 40.00` is first
   * and far the smaller, `EUR -9 000.00` is second and far the larger, so a
   * magnitude rule would return `EUR` and only order returns `CHF`.
   */
  it("falls back to the first holding in ledger order, whatever its size", () => {
    const ledger = fakeController(() => [
      account({ currency: CHF, balance: money.toMoney("40.00") }),
      account({
        id: id<"accounts">("66666666-6666-4666-8666-666666666666"),
        name: "Card B · EUR",
        kind: "card",
        currency: EUR,
        balance: money.toMoney("-9000.00"),
      }),
    ]);
    const { result } = renderHook(() => useLeadCurrency(ledger, PLN));

    expect(result.current).toEqual({
      entry: { currency: CHF, decimals: 2, balance: money.toMoney("40.00") },
      fallback: true,
      missing: PLN,
    });
  });

  /**
   * Order is the accounts', not the currency codes' — the same fixture with
   * the alphabetically-later code opened first still leads with that one, so
   * nothing sorts behind the fold's back.
   */
  it("takes the order the accounts arrive in, not the alphabet's", () => {
    const ledger = fakeController(() => [
      account({ currency: EUR, balance: money.toMoney("500.00") }),
      account({
        id: id<"accounts">("66666666-6666-4666-8666-666666666666"),
        name: "Bank B · CHF",
        currency: CHF,
        balance: money.toMoney("500.00"),
      }),
    ]);
    const { result } = renderHook(() => useLeadCurrency(ledger, PLN));

    expect(result.current).toMatchObject({ entry: { currency: EUR }, fallback: true });
  });

  it("is null before the first account — nothing to fall back to", () => {
    const ledger = fakeController(() => []);
    const { result } = renderHook(() => useLeadCurrency(ledger, PLN));

    expect(result.current).toBeNull();
  });
});
