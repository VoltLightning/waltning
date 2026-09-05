/**
 * `use-unsettled-banner.ts` — §8's banner as a model, tested where it is
 * decided rather than through the three screens that render it.
 *
 * The model was extracted at its third use, and the reason each of its four
 * rules exists is a case the original grew one screen at a time: the H2
 * opening balance with no payee, the H3 remainder that is less than the
 * balance, the `more` fold that keeps one banner instead of a stack, and
 * `openTarget`'s account fallback for a leg with no transaction to open. Each
 * of those is one branch here and eight sentences downstream, so a screen test
 * covers whichever branch its fixture happens to hit and no more.
 */

import { id } from "@waltning/core/id";
import { currencyCode, toMoney } from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import type { PhoneClearingAccount } from "./create-phone-ledger.ts";
import { unsettledBannerModel } from "./use-unsettled-banner.ts";

const TX = id<"transactions">("22222222-2222-4222-8222-222222222222");
const OTHER_TX = id<"transactions">("33333333-3333-4333-8333-333333333333");

function clearing(overrides: Partial<PhoneClearingAccount> = {}): PhoneClearingAccount {
  return {
    accountId: "11111111-1111-4111-8111-111111111111",
    name: "Clearing · Bank A",
    currency: currencyCode("PLN"),
    decimals: 2,
    balance: toMoney("480.00"),
    oldestUnconsumedTransactionId: TX,
    oldestDate: null,
    oldestUnconsumedRemainder: toMoney("480.00"),
    oldestUnconsumedPayee: "Grocer",
    ...overrides,
  };
}

describe("unsettledBannerModel", () => {
  it("is null when nothing is unsettled — the banner is absent, not empty", () => {
    expect(unsettledBannerModel([])).toBeNull();
  });

  it("names the oldest open leg's payee and its remainder", () => {
    const model = unsettledBannerModel([clearing()]);
    expect(model).toMatchObject({
      name: "Clearing · Bank A",
      payee: "Grocer",
      balance: toMoney("480.00"),
      remainder: toMoney("480.00"),
      isOpening: false,
      remainderDiffers: false,
      more: 0,
    });
  });

  it("H3 — reports the remainder as differing when it is less than the balance", () => {
    const model = unsettledBannerModel([
      clearing({ oldestUnconsumedRemainder: toMoney("120.00") }),
    ]);
    expect(model?.remainder).toEqual(toMoney("120.00"));
    expect(model?.balance).toEqual(toMoney("480.00"));
    // Both figures are stated downstream, because naming the balance beside
    // this payee would overstate what their leg accounts for.
    expect(model?.remainderDiffers).toBe(true);
  });

  it("does not report a difference when the remainder equals the balance in a different scale", () => {
    const model = unsettledBannerModel([
      clearing({ oldestUnconsumedRemainder: toMoney("480.0000") }),
    ]);
    // `money.eq`, not string equality — `480.0000` is the same money as `480.00`.
    expect(model?.remainderDiffers).toBe(false);
  });

  it("falls back to the balance when the fold handed back no remainder", () => {
    const model = unsettledBannerModel([clearing({ oldestUnconsumedRemainder: null })]);
    expect(model?.remainder).toEqual(toMoney("480.00"));
    expect(model?.remainderDiffers).toBe(false);
  });

  it("H2 — an opening balance is `isOpening`, has no payee, and opens the account", () => {
    const model = unsettledBannerModel([
      clearing({ oldestUnconsumedTransactionId: null, oldestUnconsumedPayee: null }),
    ]);
    expect(model?.isOpening).toBe(true);
    expect(model?.payee).toBeNull();
    expect(model?.openTarget).toEqual({
      kind: "account",
      accountId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("S04 §3 — opens the unallocated transaction, not a list, whenever there is one", () => {
    const model = unsettledBannerModel([clearing()]);
    expect(model?.openTarget).toEqual({ kind: "transaction", transactionId: TX });
  });

  it("one banner, never a stack — the rest become a count, and the first one still leads", () => {
    const model = unsettledBannerModel([
      clearing(),
      clearing({
        accountId: "99999999-9999-4999-8999-999999999999",
        name: "Clearing · Bank B",
        oldestUnconsumedTransactionId: OTHER_TX,
      }),
      clearing({ accountId: "88888888-8888-4888-8888-888888888888", name: "Clearing · Cash" }),
    ]);
    expect(model?.more).toBe(2);
    expect(model?.name).toBe("Clearing · Bank A");
    expect(model?.openTarget).toEqual({ kind: "transaction", transactionId: TX });
  });
});
