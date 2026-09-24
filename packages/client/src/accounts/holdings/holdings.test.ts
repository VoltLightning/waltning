import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { type HoldingsAccount, holdings } from "./holdings.ts";

const PLN = money.currencyCode("PLN");
const USD = money.currencyCode("USD");
const BYN = money.currencyCode("BYN");
const DISPLAY = { currency: PLN, decimals: 2 };
/** 1 USD = 4 PLN; BYN has no rate. */
const rateOf = (currency: money.CurrencyCode) =>
  currency === USD ? money.pivotPerUnit("4") : null;

function account(overrides: Partial<HoldingsAccount> = {}): HoldingsAccount {
  return {
    id: `a-${Math.random()}`,
    name: "Bank A",
    color: null,
    kind: "bank",
    currency: PLN,
    decimals: 2,
    balance: money.toMoney("100"),
    ownership: "own",
    hidden: false,
    inTotal: true,
    ...overrides,
  };
}

const fig = (m: money.Money | null) => (m === null ? null : money.round(m, 2));

describe("holdings", () => {
  it("adds own accounts in the display currency, converting the rest", () => {
    const h = holdings(
      [account(), account({ kind: "investment", currency: USD, balance: money.toMoney("10") })],
      DISPLAY,
      rateOf,
    );
    expect(fig(h.mine)).toBe("140.00");
    expect(h.counted).toBe(2);
    expect(h.of).toBe(2);
    expect(h.byCurrency.map((row) => [row.currency, fig(row.balance), fig(row.value)])).toEqual([
      ["PLN", "100.00", "100.00"],
      ["USD", "10.00", "40.00"],
    ]);
  });

  /** §6.6 — lent money is not held; S04 §9 leaves payables open, so both sit apart. */
  it("lists loans and never adds them", () => {
    const h = holdings(
      [
        account(),
        account({ kind: "loan_receivable", balance: money.toMoney("3000") }),
        account({ kind: "loan_payable", balance: money.toMoney("-3795") }),
      ],
      DISPLAY,
      rateOf,
    );
    expect(fig(h.mine)).toBe("100.00");
    expect(h.of).toBe(1);
    expect(h.byKind.map((row) => row.kind)).toEqual(["bank"]);
    expect(h.loans.map((row) => [row.kind, fig(row.value)])).toEqual([
      ["loan_receivable", "3000.00"],
      ["loan_payable", "-3795.00"],
    ]);
  });

  /** A card in debit is owed, not a negative share of what is held. */
  it("splits held from owed, and the two make the total", () => {
    const h = holdings(
      [account(), account({ kind: "card", balance: money.toMoney("-40") })],
      DISPLAY,
      rateOf,
    );
    expect([fig(h.held), fig(h.owed), fig(h.mine)]).toEqual(["100.00", "40.00", "60.00"]);
  });

  /** The third lens: every counted account, own figure and converted, in the order handed in. */
  it("lists each counted account, loans and shared ones apart", () => {
    const h = holdings(
      [
        account({ id: "a1", name: "Bank A", color: "rust" }),
        account({ id: "a2", name: "Dollar", currency: USD, balance: money.toMoney("10") }),
        account({ id: "a3", kind: "loan_payable", balance: money.toMoney("-5") }),
        account({ id: "a4", ownership: "shared" }),
      ],
      DISPLAY,
      rateOf,
    );
    expect(h.byAccount.map((row) => [row.id, row.color, fig(row.balance), fig(row.value)])).toEqual(
      [
        ["a1", "rust", "100.00", "100.00"],
        ["a2", null, "10.00", "40.00"],
      ],
    );
  });

  /** Nine of ten, said as such — never a tenth at a guessed rate. */
  it("leaves out an account with no rate, and counts it as left out", () => {
    const h = holdings([account(), account({ currency: BYN })], DISPLAY, rateOf);
    expect(fig(h.mine)).toBe("100.00");
    expect([h.counted, h.of]).toEqual([1, 2]);
  });

  it("drops hidden accounts entirely, and counts one left out of the total by hand", () => {
    const h = holdings(
      [account(), account({ hidden: true }), account({ inTotal: false })],
      DISPLAY,
      rateOf,
    );
    expect(fig(h.mine)).toBe("100.00");
    expect([h.counted, h.of]).toEqual([1, 2]);
  });

  /** §6.7 — `ours` exists only where something is shared, and is never `mine` twice. */
  it("states ours only when a shared account is counted", () => {
    expect(holdings([account()], DISPLAY, rateOf).ours).toBeNull();
    const h = holdings(
      [account(), account({ ownership: "shared", balance: money.toMoney("50") })],
      DISPLAY,
      rateOf,
    );
    expect([fig(h.mine), fig(h.ours)]).toEqual(["100.00", "150.00"]);
    expect(h.byKind.map((row) => row.count)).toEqual([1]);
  });
});
