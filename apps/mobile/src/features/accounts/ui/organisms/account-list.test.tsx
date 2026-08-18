/**
 * @vitest-environment jsdom
 *
 * The balance is the figure C30 got wrong, so the component that renders it is
 * worth testing for the things a screen can get wrong on its own: the wrong
 * number of decimal places, a total nobody asked for, and a minus sign that
 * disagrees with the value.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Account } from "../../api/use-accounts.ts";
import { AccountList } from "./account-list";

const account = (over: Partial<Account> & Pick<Account, "id" | "name">): Account => ({
  kind: "bank",
  currency: "PLN",
  balance: "0.00000000",
  decimals: 2,
  archived: false,
  ...over,
});

describe("AccountList", () => {
  it("renders each balance at its own currency's precision", () => {
    // `decimals` travels with the balance rather than being assumed to be 2.
    // A component hardcoding two is right for every currency here and wrong for
    // JPY, and the error reads as a formatting quirk rather than a bug.
    render(
      <AccountList
        accounts={[
          account({ id: "1", name: "Bank A", balance: "37931.70000000", decimals: 2 }),
          account({ id: "2", name: "Yen Account", balance: "1500.00000000", decimals: 0 }),
        ]}
      />,
    );

    expect(screen.getByText("37931.70")).toBeDefined();
    expect(screen.getByText("1500")).toBeDefined();
  });

  it("never renders a total across currencies", () => {
    // Summing these would add złoty to dollars and call it net worth. §3 is a
    // separate figure that converts first, and this list must not imply it.
    render(
      <AccountList
        accounts={[
          account({ id: "1", name: "Bank A", balance: "100.00000000", currency: "PLN" }),
          account({ id: "2", name: "Bank B", balance: "200.00000000", currency: "USD" }),
        ]}
      />,
    );
    expect(screen.queryByText("300.00")).toBeNull();
  });

  it("does not mark a negative zero as negative", () => {
    // `-0.00000000` is not a negative balance, and a `startsWith("-")` says it
    // is — showing a cleared account in the colour of an overdraft.
    const { container } = render(
      <AccountList accounts={[account({ id: "1", name: "Cleared", balance: "-0.00000000" })]} />,
    );
    expect(screen.getByText("0.00")).toBeDefined();
    expect(container.innerHTML).not.toContain("-0.00");
  });

  it("says so when there are no accounts", () => {
    render(<AccountList accounts={[]} />);
    expect(screen.getByText(/no accounts/i)).toBeDefined();
  });
});
