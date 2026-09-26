/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { currencyCode, toMoney } from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n/provider";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import type { LedgerEntry } from "../entry-row/ledger-entry.ts";
import { LedgerRowItem } from "./ledger-row-item";

const BASE: LedgerEntry = {
  id: "t1",
  date: "2026-08-14",
  type: "expense",
  enteredName: "Market B",
  categoryName: "Groceries",
  accountName: "Bank A",
  amount: toMoney("-96.00"),
  currency: currencyCode("PLN"),
  decimals: 2,
  isBusiness: false,
  brandKey: null,
};

function draw(row: LedgerEntry, onPress = vi.fn()) {
  render(
    <ThemeProvider theme={light}>
      <I18nProvider>
        <LedgerRowItem row={row} onPress={onPress} />
      </I18nProvider>
    </ThemeProvider>,
  );
  return onPress;
}

it("draws the row and answers a tap with its own id", () => {
  const onPress = draw(BASE);
  fireEvent.click(screen.getByRole("button", { name: /Market B/ }));
  expect(onPress).toHaveBeenCalledWith("t1");
});

it("draws a transfer as one row naming both accounts", () => {
  draw({
    ...BASE,
    id: "t2",
    type: "transfer",
    toAccountName: "Bank B",
    toAmount: toMoney("96.00"),
    toCurrency: currencyCode("PLN"),
    toDecimals: 2,
  });
  expect(screen.getAllByText(/Bank B/).length).toBeGreaterThan(0);
});
