/**
 * @vitest-environment jsdom
 *
 * S18 against an in-memory ledger — `@waltning/client/ledger/test-port`'s
 * shared `basePort` (M4).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneLedgerPort,
} from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { basePort } from "@waltning/client/ledger/test-port";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, unitsPerPivot } from "@waltning/core/money";
import { expect, it, vi } from "vitest";

import SettingsRatesScreen, { type SettingsRatesScreenProps } from "./settings-rates-screen";

const PLN = currencyCode("PLN");
const USD = currencyCode("USD");
const EUR = currencyCode("EUR");

const PLN_ROW = {
  code: PLN,
  name: "Polish Złoty",
  symbol: "zł",
  symbolPosition: "S",
  decimals: 2,
  rateSource: "nbp",
  pinned: true,
  isPivot: false,
  version: 3,
};

const USD_ROW = {
  code: USD,
  name: "US Dollar",
  symbol: "$",
  symbolPosition: "P",
  decimals: 2,
  rateSource: null,
  pinned: false,
  isPivot: true,
  version: 1,
};

const EUR_ROW = {
  code: EUR,
  name: "Euro",
  symbol: "€",
  symbolPosition: "S",
  decimals: 2,
  rateSource: "ecb",
  pinned: false,
  isPivot: false,
  version: 1,
};

function fakeController(overrides: {
  listCurrencySettings?: PhoneLedgerPort["listCurrencySettings"];
  listFxRates?: PhoneLedgerPort["listFxRates"];
  setManualRate?: PhoneLedgerPort["setManualRate"];
  clearManualRate?: PhoneLedgerPort["clearManualRate"];
}) {
  const port = basePort({
    listCurrencySettings: overrides.listCurrencySettings ?? (() => [PLN_ROW, USD_ROW]),
    readCoverage: () => [
      {
        code: PLN,
        source: "nbp",
        firstDate: accountingDate("2020-11-25"),
        lastDate: accountingDate("2026-09-02"),
        days: 2100,
        realDays: 2100,
        calendarDays: 2100,
        coveragePct: 100,
        futureRows: 0,
      },
    ],
    listFxRates: overrides.listFxRates ?? (() => []),
    setManualRate: overrides.setManualRate ?? (() => ({ written: 0, replacedManual: 0 })),
    clearManualRate: overrides.clearManualRate ?? (() => ({ deleted: 0 })),
  });
  return createPhoneLedger(port, {
    capture: () => ({
      date: accountingDate("2026-09-03"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-09-03T10:00:00Z"),
    }),
    id: () => id("44444444-4444-4444-8444-444444444444"),
  });
}

/**
 * The screen is a function of its props — `?quote=` and `?date=` are read by
 * the route (`app/settings/rates.tsx`) and handed in, so nothing here mocks a
 * router to drive them.
 */
function withLedger(
  overrides: Parameters<typeof fakeController>[0] = {},
  props: SettingsRatesScreenProps = {},
) {
  return render(
    <LedgerProvider controller={fakeController(overrides)}>
      <SettingsRatesScreen {...props} />
    </LedgerProvider>,
  );
}

it("renders the quote pair and the coverage panel", () => {
  withLedger();
  expect(screen.getByText("PLN · Polish Złoty")).toBeDefined();
  expect(screen.getByText("100%")).toBeDefined();
});

it("preselects the quote from ?quote=, S17's own link at 0% coverage", () => {
  withLedger({ listCurrencySettings: () => [PLN_ROW, EUR_ROW, USD_ROW] }, { quote: "EUR" });
  // Without the param, the first option (PLN) would win — EUR proves the
  // link, not the default.
  expect(screen.getByText("EUR · Euro")).toBeDefined();
});

/**
 * The capture gate's own link — *"PLN needs an exchange rate — set one"*
 * lands on `/settings/rates?quote=PLN&date=2026-08-30`, and what a person
 * needs next is the editor open on that one day, not a table to hunt through.
 */
it("?date= opens the editor on that single day, with the pair from ?quote=", () => {
  withLedger(
    { listCurrencySettings: () => [PLN_ROW, EUR_ROW, USD_ROW] },
    {
      quote: "PLN",
      date: "2026-08-30",
    },
  );
  expect(screen.getByText("Set PLN per USD, 2026-08-30 … 2026-08-30")).toBeDefined();
  expect(screen.getByLabelText("Rate · PLN per USD")).toBeDefined();
});

it("a ?date= that is not a calendar day behaves as an unparameterised visit", () => {
  withLedger({}, { quote: "PLN", date: "2026-02-31" });
  expect(screen.queryByText(/^Set PLN per USD/)).toBeNull();
});

it("no params at all leaves the editor closed on the first option", () => {
  withLedger();
  expect(screen.getByText("PLN · Polish Złoty")).toBeDefined();
  expect(screen.queryByText(/^Set PLN per USD/)).toBeNull();
});

it("a range write with no existing manual rows submits on the first press", () => {
  // L — `today` on the draft is the device's own date, read through
  // `deviceRuntime()` (`settings-rates-screen.tsx`), never a constant this
  // test would have to keep in sync with the real clock by hand.
  const today = deviceRuntime().capture().date;
  const setManualRate = vi.fn(() => ({ written: 30, replacedManual: 0 }));
  withLedger({ setManualRate, listFxRates: () => [] });

  fireEvent.click(screen.getByText("Set a range"));
  // The editor opens in a sheet whose header states the pair and the range —
  // the row that was tapped is 1,300 px above where this used to render.
  expect(screen.getByText(/^Set PLN per USD, /)).toBeDefined();
  fireEvent.change(screen.getByLabelText("Rate · PLN per USD"), { target: { value: "3,7556" } });
  fireEvent.click(screen.getByRole("button", { name: "Set rate" }));

  expect(setManualRate).toHaveBeenCalledWith(
    expect.objectContaining({
      base: "USD",
      quote: "PLN",
      rate: "3.7556",
      overwriteManual: false,
      today,
    }),
    expect.anything(),
  );
});

it("a range holding manual rows asks for a second confirmation before overwriting", () => {
  const setManualRate = vi.fn(() => ({ written: 3, replacedManual: 1 }));
  const listFxRates = vi.fn(() => [
    {
      base: USD,
      quote: PLN,
      date: accountingDate("2026-08-15"),
      rate: unitsPerPivot("3.9000"),
      source: "manual",
    },
  ]);
  withLedger({ setManualRate, listFxRates });

  fireEvent.click(screen.getByText("Set a range"));
  fireEvent.change(screen.getByLabelText("Rate · PLN per USD"), { target: { value: "3.7556" } });
  fireEvent.click(screen.getByRole("button", { name: "Set rate" }));
  expect(setManualRate).not.toHaveBeenCalled();
  expect(screen.getByText(/This sets 3\.7556 PLN per USD, replacing 1 manual rate/)).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Overwrite and set" }));
  expect(setManualRate).toHaveBeenCalledWith(
    expect.objectContaining({ overwriteManual: true, today: deviceRuntime().capture().date }),
    expect.anything(),
  );
});

it("clear manual removes the manual rows in the current range", () => {
  const clearManualRate = vi.fn(() => ({ deleted: 3 }));
  withLedger({ clearManualRate });
  fireEvent.click(screen.getByText("Clear manual"));
  expect(clearManualRate).toHaveBeenCalledWith(
    expect.objectContaining({ base: "USD", quote: "PLN" }),
    expect.anything(),
  );
});

/**
 * M-a — the pivot alone. `quoteOptions` is empty, so there is no pair to
 * table and no currency whose coverage `shownCoverage` would keep: both cards
 * are gone and the ground carries the hint that says why. A *Coverage* card
 * drawn around nothing is the empty-card defect wearing a title.
 */
it("renders neither card when the pivot is the only currency", () => {
  withLedger({ listCurrencySettings: () => [USD_ROW] });

  expect(screen.getByText("No currency to compare against the pivot yet.")).toBeDefined();
  expect(screen.queryByText("Coverage")).toBeNull();
  expect(screen.queryByText("100%")).toBeNull();
});

/**
 * N-3 — the two states that are **not** *no quote currency*, and must not be
 * mistaken for it. S18 §3 and §6: a ledger with no pivot, and a custom range
 * that does not parse, each leave nothing to table — but there *is* a
 * currency to compare against, so the hint that says there is not would be a
 * false sentence. Neither draws the table card and neither draws the hint.
 *
 * The coverage card is a third thing and stays: coverage is per currency, not
 * per range and not per pivot, so its rows are still true of this ledger.
 * Dropping it here would hide a real list because an unrelated field was
 * mistyped.
 *
 * **Broken once** — the guarded branch is `noQuoteCurrency ? hint : (nulls ?
 * null : card)`. Flatten it to `quote === null || range === null || pivot ===
 * undefined ? hint : card` — the shape round 3 replaced — and both cases
 * below render *No currency to compare against the pivot yet.* while holding
 * two currencies.
 */
it("draws neither the table card nor the hint when the ledger names no pivot", () => {
  // Two currencies, and neither of them the pivot.
  withLedger({ listCurrencySettings: () => [PLN_ROW, { ...USD_ROW, isPivot: false }] });

  expect(screen.queryByText("No currency to compare against the pivot yet.")).toBeNull();
  expect(screen.queryByText("Date")).toBeNull();
  // Coverage is per currency, so it is still true and still drawn.
  expect(screen.getByText("Coverage")).toBeDefined();
});

it("draws neither the table card nor the hint when the custom range does not parse", () => {
  withLedger({});
  // The table is there on the default 30-day preset — the absence below is
  // the range's doing, not the fixture's.
  expect(screen.getByText("Date")).toBeDefined();

  fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-3x" } });

  expect(screen.queryByText("No currency to compare against the pivot yet.")).toBeNull();
  expect(screen.queryByText("Date")).toBeNull();
  expect(screen.getByText("Coverage")).toBeDefined();
});

/**
 * The table draws one row per calendar day into the page's own scroller, so
 * the range that can be picked is the range that can be written
 * (`MAX_RANGE_DAYS`, shared with `RateEditor`). Stated, never silently
 * truncated — and never a ten-year table nobody can scroll.
 */
it("a custom range past the cap states the cap and draws no table", () => {
  withLedger({});
  expect(screen.getByText("Date")).toBeDefined();

  fireEvent.change(screen.getByLabelText("From"), { target: { value: "2020-01-01" } });
  fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-09-03" } });

  expect(screen.getByText("A range can cover at most 366 days.")).toBeDefined();
  expect(screen.queryByText("Date")).toBeNull();
});

it("a custom range of exactly the cap still draws the table", () => {
  withLedger({});
  fireEvent.change(screen.getByLabelText("From"), { target: { value: "2025-09-03" } });
  fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-09-03" } });

  expect(screen.queryByText(/can cover at most/)).toBeNull();
  expect(screen.getByText("Date")).toBeDefined();
});

/**
 * The sheet is a modal: a `Toast` on the page behind it is a refusal nobody
 * can read. Broken once by routing this back through `setToast` — the message
 * renders outside the sheet and this still passes on text alone, which is why
 * the assertion is that the editor is *still open* around it.
 */
it("a refused write states its reason inside the sheet, with the editor still open", () => {
  const setManualRate = vi.fn(() => {
    throw new Error("A rate cannot be set for a future date.");
  });
  withLedger({ setManualRate });

  fireEvent.click(screen.getByText("Set a range"));
  fireEvent.change(screen.getByLabelText("Rate · PLN per USD"), { target: { value: "3.7556" } });
  fireEvent.click(screen.getByRole("button", { name: "Set rate" }));

  expect(screen.getByText("A rate cannot be set for a future date.")).toBeDefined();
  expect(screen.getByLabelText("Rate · PLN per USD")).toBeDefined();
});
