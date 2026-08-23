/**
 * @vitest-environment jsdom
 *
 * `TransactionRow` — its own domain's test, beside its own component.
 */

import { render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { TransactionRow } from "./transaction-row";

describe("TransactionRow", () => {
  it("renders the amount it is given, signed", () => {
    // §1 is computed once, in SQL. A row deciding the sign from the type would
    // be a second implementation, and the two disagree on `adjustment`.
    render(
      <TransactionRow
        date="2026-08-16"
        payee="Grocer"
        amount={money.toMoney("-184.30000000")}
        currency="PLN"
      />,
    );
    expect(screen.getByText("-184.30")).toBeDefined();
  });

  it("shows the bare accounting date, never through a Date", () => {
    render(
      <TransactionRow
        date="2026-01-01"
        payee="X"
        amount={money.toMoney("1.00000000")}
        currency="PLN"
      />,
    );
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
        amount={money.toMoney("100.00000000")}
        currency="PLN"
        isBusiness
      />,
    );
    expect(screen.getByText("biz")).toBeDefined();
  });

  it("falls back rather than rendering a blank payee", () => {
    render(
      <TransactionRow
        date="2026-08-16"
        payee=""
        amount={money.toMoney("1.00000000")}
        currency="PLN"
      />,
    );
    expect(screen.getByText("—")).toBeDefined();
  });
});
