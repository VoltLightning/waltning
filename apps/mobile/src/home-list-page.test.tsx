/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import type {
  PhoneLedgerController,
  PhoneSearchTransaction,
} from "@waltning/client/ledger/create-phone-ledger";
import { type AccountingDate, accountingDate } from "@waltning/core/date";
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

function draw(
  ledger: PhoneLedgerController,
  onPickDay = vi.fn(),
  over: {
    anchor?: AccountingDate;
    onReturnToToday?: () => void;
    onCategorize?: () => void;
    query?: string | null;
  } = {},
) {
  render(
    <ThemeProvider theme={light}>
      <I18nProvider>
        <HomeListPage
          ledger={ledger}
          anchor={over.anchor ?? TODAY}
          today={TODAY}
          pivotCurrency={PLN}
          pivotDecimals={2}
          onPickDay={onPickDay}
          onOpenTransaction={vi.fn()}
          onCategorize={over.onCategorize ?? vi.fn()}
          onReturnToToday={over.onReturnToToday ?? vi.fn()}
          query={over.query ?? null}
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

/**
 * **A jump is one-way without the pill** (S04 §6). Picking a far date loads
 * that date's neighbourhood and nothing between, so walking home from 2021 is
 * four years of scrolling. The pill was specified in §4 and never built.
 */
it("offers the way back only once the list has left today", () => {
  const rows = [row("2026-08-14", 1, "-96")];
  draw(ledgerWith(rows));
  expect(
    screen.queryByRole("button", { name: /Back to today/ }),
    "a pill offering today while the list is on today does nothing",
  ).toBeNull();
});

it("names where the list is, and returns it", () => {
  const onReturnToToday = vi.fn();
  draw(ledgerWith([row("2021-03-02", 1, "-96")]), vi.fn(), {
    anchor: accountingDate("2021-03-02"),
    onReturnToToday,
  });

  // The name carries the date the list is on: "Today" alone is what the eye
  // reads off the pill, and tells a reader who cannot see the list nothing
  // about why it appeared.
  const pill = screen.getByRole("button", { name: /Back to today/ });
  expect(pill.getAttribute("aria-label")).toMatch(/March 2, 2021/);

  fireEvent.click(pill);
  expect(onReturnToToday).toHaveBeenCalledTimes(1);
});

/**
 * **§7 gives every row two gestures, and the phone list passed neither.**
 * `LedgerRowItem` has taken `onShortSwipe`/`onLongSwipe` since S10 wired them
 * on the desk; this page rendered it with `onPress` alone, so every row was
 * tap-only and the component silently fell back to a plain `EntryRow`.
 *
 * The swipe itself is `SwipeableRow`'s and is tested there. What this pins is
 * that the row is wrapped in one at all, which is the thing that was missing.
 */
it("wraps a categorisable row in the layer its gestures move", () => {
  draw(ledgerWith([row("2026-08-14", 1, "-96")]));
  // `SwipeableRow` is the only thing on this row that can travel sideways, so
  // a `translateX` above the button is the wrapper's own signature. Asserting
  // the handler props instead would prove the page passes them, not that
  // `LedgerRowItem` accepted both and built the row it builds when it does.
  const button = screen.getByRole("button", { name: /Payee 1/ });
  const travelled = button.closest("[style*='translateX']");
  expect(travelled, "an expense takes both gestures (§7)").not.toBeNull();
});

it("leaves a transfer tap-only, because it has no category to choose", () => {
  draw(
    ledgerWith([
      row("2026-08-14", 1, "-96", {
        type: "transfer",
        toAccountName: "Bank B",
        toAmount: toMoney("96.00"),
        toCurrency: PLN,
        toDecimals: 2,
        toFxRate: pivotPerUnit("1"),
      }),
    ]),
  );
  // A transfer is drawn by `TransferRow`, which names the two accounts rather
  // than a payee — the row a transfer has instead of one.
  // By text, not by role: `TransferRow` is not pressable at all — it states
  // two accounts rather than offering one target — so there is no button here
  // to find.
  const row1 = screen.getByText(/Bank B/);
  expect(
    row1.closest("[style*='translateX']"),
    "a swipe onto a sheet with nothing in it is worse than no swipe",
  ).toBeNull();
});
