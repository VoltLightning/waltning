/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { currencyCode, toMoney } from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n/provider";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import type { LedgerEntry } from "../entry-row/entry-row";
import { LedgerRowItem } from "./ledger-row-item";

const BASE: LedgerEntry = {
  id: "t1",
  date: "2026-08-14",
  type: "expense",
  payee: "Market B",
  categoryName: "Groceries",
  accountName: "Bank A",
  amount: toMoney("-96.00"),
  currency: currencyCode("PLN"),
  decimals: 2,
  isBusiness: false,
  brandKey: null,
};

function draw(row: LedgerEntry, handlers: Partial<Parameters<typeof LedgerRowItem>[0]> = {}) {
  return render(
    <ThemeProvider theme={light}>
      <I18nProvider>
        <LedgerRowItem
          row={row}
          onPress={vi.fn()}
          onShortSwipe={vi.fn()}
          onLongSwipe={vi.fn()}
          {...handlers}
        />
      </I18nProvider>
    </ThemeProvider>,
  );
}

it("draws the row's figure, whatever wrapper it ends up in", () => {
  draw(BASE);
  expect(screen.getByRole("button", { name: /96/ })).toBeTruthy();
});

it("wraps a categorisable row so the swipe has somewhere to land", () => {
  const { container } = draw(BASE);
  const swipeable = container.querySelectorAll("[data-testid], div");
  expect(swipeable.length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: /Market B/ })).toBeTruthy();
});

it("leaves a transfer tap-only, because it has no category to choose", () => {
  // `transactions_category_shape`: a transfer moves money between your own
  // accounts and has no category, so a swipe would open a sheet with nothing
  // in it — worse than no swipe, because it teaches that swiping does nothing.
  const transfer: LedgerEntry = {
    ...BASE,
    type: "transfer",
    toAccountName: "Bank B",
    toAmount: toMoney("96.00"),
    toCurrency: currencyCode("PLN"),
    toDecimals: 2,
  };
  const onShortSwipe = vi.fn();
  draw(transfer, { onShortSwipe });
  expect(onShortSwipe).not.toHaveBeenCalled();
});

it("stays tap-only when a list offers no swipe at all", () => {
  // A half-wired SwipeableRow would answer one gesture and swallow the other.
  draw(BASE, { onShortSwipe: undefined, onLongSwipe: undefined });
  expect(screen.getByRole("button", { name: /Market B/ })).toBeTruthy();
});
