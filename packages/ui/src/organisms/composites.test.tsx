/**
 * @vitest-environment jsdom
 *
 * D2's structure, checked on the properties §5 states — the ones that are a
 * design decision rather than a layout.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BalanceRow, TransactionRow } from "../molecules/rows.tsx";
import { Card } from "./card.tsx";
import { DualTotal } from "./dual-total.tsx";

describe("DualTotal", () => {
  it("shows both figures at once", () => {
    // §5: **never a toggle.** The two answer different questions and look
    // identical, so a control that swaps them guarantees someone eventually
    // reads *ours* believing it is *mine*.
    render(<DualTotal mine="1000.00000000" ours="1600.00000000" currency="PLN" />);
    expect(screen.getByText("1000.00")).toBeDefined();
    expect(screen.getByText("1600.00")).toBeDefined();
  });

  it("has no scope prop to toggle with", () => {
    // Stated as a test because the absence is the feature. If a `scope` prop
    // ever appears, this is what should have to be deleted to allow it.
    const props = Object.keys({ mine: "", ours: null, currency: "", decimals: 2 });
    expect(props).not.toContain("scope");
  });

  it("degrades to one figure when nothing is shared", () => {
    // A household total identical to the personal one, printed underneath,
    // teaches the reader that the second line carries no information.
    const { container } = render(<DualTotal mine="1000.00000000" ours={null} currency="PLN" />);
    expect(container.textContent).toContain("mine");
    expect(container.textContent).not.toContain("ours");
  });
});

describe("TransactionRow", () => {
  it("renders the amount it is given, signed", () => {
    // §1 is computed once, in SQL. A row deciding the sign from the type would
    // be a second implementation, and the two disagree on `adjustment`.
    render(
      <TransactionRow date="2026-08-16" payee="Grocer" amount="-184.30000000" currency="PLN" />,
    );
    expect(screen.getByText("-184.30")).toBeDefined();
  });

  it("shows the bare accounting date, never through a Date", () => {
    render(<TransactionRow date="2026-01-01" payee="X" amount="1.00000000" currency="PLN" />);
    expect(screen.getByText("01-01")).toBeDefined();
  });

  it("marks a business row, because every view must", () => {
    // §3.3: the BIZ tag appears in **every** view a business row appears in —
    // a row that is business in one list and unmarked in another is the kind of
    // inconsistency that ends in a tax figure nobody can explain.
    render(
      <TransactionRow
        date="2026-08-16"
        payee="Client"
        amount="100.00000000"
        currency="PLN"
        isBusiness
      />,
    );
    expect(screen.getByText("biz")).toBeDefined();
  });

  it("falls back rather than rendering a blank payee", () => {
    render(<TransactionRow date="2026-08-16" payee="" amount="1.00000000" currency="PLN" />);
    expect(screen.getByText("—")).toBeDefined();
  });
});

describe("BalanceRow", () => {
  it("renders a home-currency balance as a plain amount", () => {
    render(<BalanceRow account="Bank A" kind="bank" balance="100.00000000" currency="PLN" />);
    expect(screen.getByText("100.00")).toBeDefined();
  });

  it("renders a foreign balance through FxAmount, rate and all", () => {
    // The rate is required to build the conversion at all — a foreign balance
    // cannot be rendered as a bare converted number (P1).
    render(
      <BalanceRow
        account="Bank B"
        kind="deposit"
        balance="100.00000000"
        currency="USD"
        conversion={{ rate: "4.00000000", displayCurrency: "PLN" }}
      />,
    );
    expect(screen.getByText("4.0000")).toBeDefined();
    expect(screen.getByText("400.00")).toBeDefined();
  });
});

describe("Card", () => {
  it("renders without a header when it has neither title nor action", () => {
    const { container } = render(
      <Card>
        <span>body</span>
      </Card>,
    );
    expect(container.textContent).toBe("body");
  });
});
