/**
 * @vitest-environment jsdom
 *
 * `TransactionList` — the column, plus C5's `onPress`: one id-taking handler
 * on the list, curried per row rather than built per item by the caller
 * (`architecture/11` bans an arrow built for one JSX prop).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import { TransactionList, type TransactionListItem } from "./transaction-list";

const ROWS: readonly TransactionListItem[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    date: "2026-08-16",
    payee: "Grocer",
    amount: money.toMoney("-40.00000000"),
    currency: "PLN",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    date: "2026-08-17",
    payee: "Employer",
    amount: money.toMoney("2000.00000000"),
    currency: "PLN",
  },
];

describe("TransactionList", () => {
  it("renders every row with no button role when onPress is absent", () => {
    render(<TransactionList transactions={ROWS} />);
    expect(screen.getByText("Grocer")).toBeDefined();
    expect(screen.getByText("Employer")).toBeDefined();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("curries the list-level onPress to the row's own id", () => {
    const onPress = vi.fn();
    render(<TransactionList transactions={ROWS} onPress={onPress} />);

    fireEvent.click(screen.getByRole("button", { name: "Employer" }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");
  });
});
