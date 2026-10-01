import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { debtIntent } from "../debt-intent/debt-intent.ts";
import { type PersonBalance, planRepayment } from "./repayment-plan.ts";

const PLN = money.currencyCode("PLN");
const EUR = money.currencyCode("EUR");

const balance = (currency: money.CurrencyCode, value: string): PersonBalance => ({
  currency,
  decimals: 2,
  balance: money.toMoney(value),
});

const base = {
  accountCurrency: EUR,
  amount: "25",
  crossRate: () => null,
};

describe("planRepayment — a repayment settles the matching debt (S14)", () => {
  it("is nothing for a category that is not a repayment", () => {
    expect(
      planRepayment({ ...base, intent: debtIntent("borrowed"), balances: [balance(PLN, "100")] }),
    ).toBeNull();
    expect(planRepayment({ ...base, intent: null, balances: [] })).toBeNull();
  });

  it("settles a PLN debt with EUR at the cross rate, without opening an EUR one", () => {
    const plan = planRepayment({
      ...base,
      intent: debtIntent("repayment-received"),
      balances: [balance(PLN, "100")],
      // 1 PLN = 0.25 EUR: multiply a PLN amount by it to reach EUR.
      crossRate: (from) => (from === PLN ? money.crossRate("0.25") : null),
    });
    expect(plan).toMatchObject({ kind: "settle", currency: PLN, over: false });
    if (plan?.kind !== "settle") throw new Error("expected a settlement");
    expect(plan.dischargesAmount).toBe("100.00");
    expect(money.round(plan.residual, 2)).toBe("0.00");
  });

  it("states over-settlement rather than clamping it", () => {
    const plan = planRepayment({
      ...base,
      accountCurrency: PLN,
      amount: "130",
      intent: debtIntent("repayment-received"),
      balances: [balance(PLN, "100")],
    });
    if (plan?.kind !== "settle") throw new Error("expected a settlement");
    expect(plan.over).toBe(true);
    expect(money.round(plan.residual, 2)).toBe("-30.00");
  });

  it("reads the other direction for a repayment you make", () => {
    const plan = planRepayment({
      ...base,
      accountCurrency: PLN,
      amount: "40",
      intent: debtIntent("repayment-made"),
      balances: [balance(PLN, "-100")],
    });
    if (plan?.kind !== "settle") throw new Error("expected a settlement");
    expect(plan.over).toBe(false);
    expect(money.round(plan.residual, 2)).toBe("-60.00");
  });

  it("has no debt to settle when the only open one points the other way", () => {
    expect(
      planRepayment({
        ...base,
        intent: debtIntent("repayment-received"),
        balances: [balance(PLN, "-100")],
      }),
    ).toEqual({ kind: "no-debt" });
    expect(planRepayment({ ...base, intent: debtIntent("repayment-made"), balances: [] })).toEqual({
      kind: "no-debt",
    });
  });

  it("names the currency it has no rate for", () => {
    expect(
      planRepayment({
        ...base,
        intent: debtIntent("repayment-received"),
        balances: [balance(PLN, "100")],
      }),
    ).toEqual({ kind: "no-rate", currency: PLN });
  });

  it("prefers the debt in the account's own currency", () => {
    const plan = planRepayment({
      ...base,
      intent: debtIntent("repayment-received"),
      balances: [balance(PLN, "500"), balance(EUR, "30")],
    });
    expect(plan).toMatchObject({ kind: "settle", currency: EUR });
  });
});
