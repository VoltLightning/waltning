/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import type {
  PhoneLedgerController,
  PhoneSearchTransaction,
} from "@waltning/client/ledger/create-phone-ledger";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, pivotPerUnit, toMoney } from "@waltning/core/money";
import { I18nProvider } from "@waltning/ui/i18n/provider";
import { ThemeProvider } from "@waltning/ui/theme/provider";
import { light } from "@waltning/ui/theme/roles";
import { Text } from "react-native";
import { expect, it, vi } from "vitest";
import { HomeListPage } from "./home-list-page";

const PLN = currencyCode("PLN");
const TODAY = accountingDate("2026-08-14");

function row(date: string, n: number, amount: string, over: Partial<PhoneSearchTransaction> = {}) {
  return {
    id: id<"transactions">(`00000000-0000-4000-8000-0000000${String(n).padStart(5, "0")}`),
    date: accountingDate(date),
    type: "expense" as const,
    payee: `Payee ${n}`,
    note: "",
    categoryName: "Groceries",
    brandKey: null,
    accountId: id<"accounts">("00000000-0000-4000-8000-00000000000a"),
    accountName: "Bank A",
    toAccountId: null,
    toAccountName: null,
    amount: toMoney(amount),
    currency: PLN,
    decimals: 2,
    fxRate: pivotPerUnit("1"),
    fxRateEstimated: false,
    toAmount: null,
    toFxRate: null,
    toCurrency: null,
    toDecimals: null,
    isBusiness: false,
    isCapital: false,
    counterpartyRole: null,
    ...over,
  } satisfies PhoneSearchTransaction;
}

function ledgerWith(older: PhoneSearchTransaction[], newer: PhoneSearchTransaction[] = []) {
  return {
    readLedgerPage: vi.fn((o: { direction: string }) => ({
      rows: o.direction === "older" ? older : newer,
      nextCursor: undefined,
    })),
  } as unknown as PhoneLedgerController;
}

function draw(ledger: PhoneLedgerController, onPickDay = vi.fn()) {
  render(
    <ThemeProvider theme={light}>
      <I18nProvider>
        <HomeListPage
          ledger={ledger}
          anchor={TODAY}
          today={TODAY}
          pivotCurrency={PLN}
          pivotDecimals={2}
          onPickDay={onPickDay}
          onOpenTransaction={vi.fn()}
          empty={<Text>nothing yet</Text>}
        />
      </I18nProvider>
    </ThemeProvider>,
  );
  return { onPickDay };
}

it("draws a day, its total, and its rows", () => {
  draw(ledgerWith([row("2026-08-14", 1, "-96"), row("2026-08-14", 2, "-48.90")]));
  expect(screen.getByText("August 14, 2026")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Payee 1/ })).toBeTruthy();
  // −96 and −48,90 folded to the day's own figure.
  expect(screen.getByText(/144[,.]90/)).toBeTruthy();
});

it("names a ribbon cell by its date and what happened, not by the number", () => {
  // A run of bare numbers says nothing about which month or which year.
  draw(ledgerWith([row("2026-08-14", 1, "-96")]));
  expect(screen.getByRole("button", { name: /August 14, 2026, 1 entry/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "14" })).toBeNull();
});

it("draws one quiet day as a line and a run as a single row", () => {
  draw(
    ledgerWith([
      row("2026-08-14", 1, "-96"),
      row("2026-08-12", 2, "-10"), // one day missing between
      row("2026-07-20", 3, "-10"), // a long run below it
    ]),
  );
  expect(screen.getByText("August 13, 2026")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: /Show: July 21, 2026 – August 11, 2026/ }),
  ).toBeTruthy();
});

it("shows no figure at all on a day it cannot price", () => {
  // A total of only the priceable legs would be a smaller number presented as
  // the day's own — the failure that looks like health.
  draw(
    ledgerWith([
      row("2026-08-14", 1, "-50", {
        toAmount: toMoney("50"),
        toCurrency: currencyCode("EUR"),
        toFxRate: null,
      }),
    ]),
  );
  expect(screen.getByText("—")).toBeTruthy();
});

it("asks the list to move when a collapsed run is opened", () => {
  const { onPickDay } = draw(
    ledgerWith([row("2026-08-14", 1, "-96"), row("2026-07-20", 2, "-10")]),
  );
  screen.getByRole("button", { name: /Show:/ }).click();
  expect(onPickDay).toHaveBeenCalledExactlyOnceWith("2026-08-13");
});

/**
 * **§6 says the ledger is continuous in both directions, and only one of them
 * was wired.** `useLedgerList` has paged forwards and backwards since it was
 * written, but the list was given `onEndReached` alone — so a reader who
 * jumped to a day could walk backwards from it forever and never forwards.
 * The newer half loaded once, at the anchor, and then froze.
 *
 * Asserted through the port rather than by firing a scroll: what the list
 * *asks the ledger for* is the behaviour, and a scroll event in jsdom has no
 * layout to make `onStartReached` fire from.
 */
it("asks the ledger for both directions, not only for older rows", () => {
  const ledger = ledgerWith([row("2026-08-14", 1, "-96")], [row("2026-08-16", 2, "-48.90")]);
  draw(ledger);

  const asked = vi.mocked(ledger.readLedgerPage).mock.calls.map(([options]) => options.direction);
  expect(asked, "the list must page both ways").toContain("older");
  expect(asked).toContain("newer");
});

it("draws the newer rows above the older ones", () => {
  // The order is the claim: a page walked `newer` is prepended, and a reader
  // scrolling up must find later days rather than the same day twice.
  draw(ledgerWith([row("2026-08-14", 1, "-96")], [row("2026-08-16", 2, "-48.90")]));
  const shown = screen
    .getAllByRole("button", { name: /Payee/ })
    .map((node) => node.getAttribute("aria-label") ?? node.textContent ?? "");
  expect(shown, "both rows drawn").toHaveLength(2);
  expect(shown[0]).toMatch(/Payee 2/);
  expect(shown[1]).toMatch(/Payee 1/);
});
