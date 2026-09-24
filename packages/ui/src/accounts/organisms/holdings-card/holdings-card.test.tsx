/**
 * @vitest-environment jsdom
 *
 * `HoldingsCard` — S04's hero. What it adds is in `holdings.test.ts`; this is
 * what it draws and where its doors lead.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import { HoldingsCard, type HoldingsCardProps } from "./holdings-card";

function props(overrides: Partial<HoldingsCardProps> = {}): HoldingsCardProps {
  return {
    currency: "PLN",
    decimals: 2,
    mine: money.toMoney("440"),
    ours: null,
    held: money.toMoney("480"),
    owed: money.toMoney("40"),
    counted: 3,
    of: 3,
    byKind: [
      { kind: "card", count: 1, value: money.toMoney("-40") },
      { kind: "bank", count: 2, value: money.toMoney("480") },
    ],
    byCurrency: [
      {
        currency: "PLN",
        decimals: 2,
        count: 2,
        balance: money.toMoney("80"),
        value: money.toMoney("80"),
      },
      {
        currency: "USD",
        name: "US dollar",
        decimals: 2,
        count: 1,
        balance: money.toMoney("100"),
        value: money.toMoney("400"),
      },
    ],
    loans: [{ kind: "loan_payable", count: 1, value: money.toMoney("-900") }],
    byAccount: [
      {
        id: "a1",
        name: "Bank A",
        kind: "bank",
        color: "rust",
        currency: "PLN",
        decimals: 2,
        balance: money.toMoney("80"),
        value: money.toMoney("80"),
      },
    ],
    onOpenAccounts: vi.fn(),
    onOpenAccount: vi.fn(),
    ...overrides,
  };
}

describe("HoldingsCard", () => {
  it("opens closed, and breaks down in place", () => {
    render(<HoldingsCard {...props()} />);
    expect(screen.queryByText("Bank")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Break it down" }));
    expect(screen.getByText("Bank")).toBeDefined();
    expect(screen.getByRole("button", { name: "Fold it away" })).toBeDefined();
  });

  /** The register's order — bank before card — not the order the fold met them in. */
  it("lists kinds in the register's order", () => {
    render(<HoldingsCard {...props()} initiallyOpen />);
    const names = ["Bank", "Card"].map((name) => screen.getByText(name));
    expect(
      (names[0] as HTMLElement).compareDocumentPosition(names[1] as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  /** Listed under their own rule — never a row that reads as part of the figure. */
  it("puts loans under a rule that says they are outside the total", () => {
    render(<HoldingsCard {...props()} initiallyOpen />);
    expect(screen.getByText("Loans · outside the total")).toBeDefined();
    expect(screen.getByText("You owe")).toBeDefined();
  });

  it("shows each currency in its own figure, with the converted one under a foreign one", () => {
    render(<HoldingsCard {...props()} initiallyOpen />);
    fireEvent.click(screen.getByRole("tab", { name: "By currency" }));
    expect(screen.getByText("US dollar")).toBeDefined();
    expect(screen.getByText("400.00")).toBeDefined();
    expect(screen.queryByText("Loans · outside the total")).toBeNull();
  });

  /** S16 opens on the lens the row was on. */
  it("opens the accounts on the lens a row was pressed from", () => {
    const onOpenAccounts = vi.fn();
    render(<HoldingsCard {...props({ onOpenAccounts })} initiallyOpen />);
    fireEvent.click(screen.getByRole("tab", { name: "By currency" }));
    fireEvent.click(screen.getByText("US dollar"));
    expect(onOpenAccounts).toHaveBeenCalledWith("currency");
  });

  /** §6.7 — the pair is a contrast, so *Mine* appears only with *ours* under it. */
  it("is titled by what it is, and Mine only where ours is drawn", () => {
    render(<HoldingsCard {...props()} />);
    expect(screen.getByText("What you hold")).toBeDefined();
    expect(screen.queryByText("ours")).toBeNull();
  });

  it("titles itself Mine and draws ours where something is shared", () => {
    render(<HoldingsCard {...props({ ours: money.toMoney("640") })} />);
    expect(screen.getByText("Mine")).toBeDefined();
    expect(screen.getByText("ours")).toBeDefined();
  });

  /** Nine of ten, said as such. */
  it("says how many accounts the figure covers when some are left out", () => {
    render(<HoldingsCard {...props({ of: 4 })} />);
    expect(screen.getByText("3 of 4 accounts")).toBeDefined();
  });

  /** The third lens is where a hand-picked colour is read — and a row opens that account. */
  it("lists each account by name, and opens the one pressed", () => {
    const onOpenAccount = vi.fn();
    render(<HoldingsCard {...props({ onOpenAccount })} initiallyOpen />);
    fireEvent.click(screen.getByRole("tab", { name: "By account" }));
    fireEvent.click(screen.getByText("Bank A"));
    expect(onOpenAccount).toHaveBeenCalledWith("a1");
  });
});
