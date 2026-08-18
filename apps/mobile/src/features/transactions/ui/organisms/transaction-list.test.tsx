/**
 * @vitest-environment jsdom
 *
 * The list renders the sign it was given. These check that it does not decide
 * one for itself — a second implementation of `computations.md` §1 would
 * disagree with the first on `adjustment`, which carries its own sign.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Transaction } from "../../api/use-transactions.ts";
import { TransactionList } from "./transaction-list";

const txn = (over: Partial<Transaction> & Pick<Transaction, "id">): Transaction => ({
  date: "2026-08-16",
  type: "expense",
  payee: "Grocer",
  amount: "-184.30000000",
  currency: "PLN",
  accountName: "Bank A",
  categoryName: "Groceries",
  ...over,
});

describe("TransactionList", () => {
  it("shows income positive and expense negative, as given", () => {
    render(
      <TransactionList
        transactions={[
          txn({ id: "1", type: "income", payee: "Employer", amount: "14200.00000000" }),
          txn({ id: "2" }),
        ]}
      />,
    );
    expect(screen.getByText("14200.00")).toBeDefined();
    expect(screen.getByText("-184.30")).toBeDefined();
  });

  it("renders a negative adjustment as negative", () => {
    // The case a component computing the sign from `type` gets wrong: an
    // adjustment is not an expense and is not always positive.
    render(
      <TransactionList
        transactions={[txn({ id: "1", type: "adjustment", amount: "-12.00000000" })]}
      />,
    );
    expect(screen.getByText("-12.00")).toBeDefined();
  });

  it("shows the bare accounting date, with no timezone applied", () => {
    // These are `YYYY-MM-DD` strings, not moments. Rendering one through a
    // `Date` is how a capture lands on the wrong day (C28).
    render(<TransactionList transactions={[txn({ id: "1", date: "2026-01-01" })]} />);
    expect(screen.getByText("01-01")).toBeDefined();
  });

  it("falls back to the type when there is no payee", () => {
    // A blank row reads as missing data. An imported row often has no payee.
    render(<TransactionList transactions={[txn({ id: "1", payee: "", type: "transfer" })]} />);
    expect(screen.getByText("transfer")).toBeDefined();
  });

  it("says so when the ledger is empty", () => {
    render(<TransactionList transactions={[]} />);
    expect(screen.getByText(/no transactions/i)).toBeDefined();
  });
});
