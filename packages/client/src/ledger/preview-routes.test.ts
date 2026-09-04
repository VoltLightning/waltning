import { describe, expect, it } from "vitest";
import {
  parseNewAccountRoute,
  parseQuickAddRoute,
  parseTransactionRoute,
} from "./preview-routes.ts";

describe("phone preview route state", () => {
  it("preserves the expense draft through account creation", () => {
    expect(
      parseNewAccountRoute({ returnTo: "quick-add", amount: "10.25", accountId: "account-a" }),
    ).toEqual({ valid: true, returnTo: "quick-add", amount: "10.25", accountId: "account-a" });
  });

  it("returns to the accounts register with nothing to restore — S16's empty state", () => {
    expect(parseNewAccountRoute({ returnTo: "accounts" })).toEqual({
      valid: true,
      returnTo: "accounts",
      amount: undefined,
      accountId: undefined,
    });
    expect(parseNewAccountRoute({ returnTo: "accounts", amount: "10" }).valid).toBe(false);
  });

  it("rejects malformed return paths instead of silently dropping them", () => {
    expect(parseNewAccountRoute({ returnTo: "ledger" })).toEqual({
      valid: false,
      message: "Could not restore the expense draft.",
    });
    expect(parseNewAccountRoute({ returnTo: ["quick-add", "today"], amount: "10" }).valid).toBe(
      false,
    );
    expect(parseNewAccountRoute({ returnTo: "today", amount: "10" }).valid).toBe(false);
    expect(
      parseNewAccountRoute({
        returnTo: "quick-add",
        amount: "10",
        accountId: ["account-a", "account-b"],
      }).valid,
    ).toBe(false);
    expect(parseNewAccountRoute({ returnTo: "quick-add", amount: "abc" }).valid).toBe(false);
  });

  it("accepts an empty quick-add draft and only scalar route values", () => {
    expect(parseQuickAddRoute({})).toEqual({ amount: "", accountId: undefined });
    expect(parseQuickAddRoute({ amount: ["1", "2"], accountId: ["a", "b"] })).toEqual({
      amount: "",
      accountId: undefined,
    });
  });

  it("reads the transaction id, or undefined for a missing or duplicated segment", () => {
    expect(parseTransactionRoute({ id: "txn-a" })).toBe("txn-a");
    expect(parseTransactionRoute({})).toBeUndefined();
    expect(parseTransactionRoute({ id: ["txn-a", "txn-b"] })).toBeUndefined();
  });
});
