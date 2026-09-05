/**
 * @vitest-environment jsdom
 *
 * `TransactionRow` — its own domain's test, beside its own component.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
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

  it("draws no BrandIcon at all when the caller has not passed brandKey", () => {
    // `SPEC.md` §14.4b — absent is not the same as "recognised nothing"; a
    // caller that has not read `brandKey` yet must not render a fallback
    // monogram for every row.
    render(
      <TransactionRow
        date="2026-08-16"
        payee="Grocer"
        amount={money.toMoney("-1.00000000")}
        currency="PLN"
      />,
    );
    expect(screen.queryByText("G")).toBeNull();
  });

  it("shows the recognised brand's own mark", () => {
    render(
      <TransactionRow
        date="2026-08-16"
        payee="ORLEN"
        amount={money.toMoney("-184.30000000")}
        currency="PLN"
        brandKey="orlen"
      />,
    );
    expect(screen.getByText("O")).toBeDefined();
  });

  it("falls back to the payee's monogram for an unrecognised payee — never blank", () => {
    render(
      <TransactionRow
        date="2026-08-16"
        payee="Corner Café"
        amount={money.toMoney("-1.00000000")}
        currency="PLN"
        brandKey={null}
      />,
    );
    expect(screen.getByText("C")).toBeDefined();
  });

  it("stays a plain row with no button role when onPress is absent", () => {
    render(
      <TransactionRow
        date="2026-08-16"
        payee="Grocer"
        amount={money.toMoney("-1.00000000")}
        currency="PLN"
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("takes the button role and calls onPress — S09's whole entry point", () => {
    const onPress = vi.fn();
    render(
      <TransactionRow
        date="2026-08-16"
        payee="Grocer"
        amount={money.toMoney("-1.00000000")}
        currency="PLN"
        onPress={onPress}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Grocer" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
