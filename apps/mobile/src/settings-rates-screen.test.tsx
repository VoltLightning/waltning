/**
 * @vitest-environment jsdom
 *
 * S18 against an in-memory ledger — `@waltning/client/ledger/test-port`'s
 * shared `basePort` (M4).
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
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

/**
 * R1 H1 — a `?quote=` this ledger cannot resolve (archived, renamed, or a
 * capture gate that raced the ledger) used to fall through to the first quote
 * currency **with the editor already open on it**, headed "Set PLN per USD"
 * after a link that said GEL. Two taps from a manual rate on a pair nobody
 * asked about.
 *
 * Broken once by gating `editorOpen` on `linkedDate` alone: the sheet opens
 * on PLN and this fails on the first assertion.
 */
it("R1 H1 — an unresolvable ?quote= opens nothing, and does not move the selection", () => {
  withLedger(
    { listCurrencySettings: () => [PLN_ROW, EUR_ROW, USD_ROW] },
    {
      quote: "GEL",
      date: "2026-08-30",
    },
  );
  expect(screen.queryByText(/ per USD, /)).toBeNull();
  // The selection falls back exactly as an unparameterised visit does — the
  // first option (PLN) — rather than to whatever the link named.
  expect(screen.getByText("PLN · Polish Złoty")).toBeDefined();
});

/**
 * R1 L7 — `set_manual_rate` refuses a date that has not happened yet, so
 * opening the editor on one only stages a refusal: the rate is typed, the
 * button is pressed, and *then* it is impossible.
 */
it("R1 L7 — a ?date= in the future opens nothing", () => {
  // The fixture's device date is 2026-09-03.
  withLedger({}, { quote: "PLN", date: "2027-01-01" });
  expect(screen.queryByText(/^Set PLN per USD/)).toBeNull();
});

/**
 * R1 L8 — `expo-router` answers `string | string[]`; a repeated key is an
 * array, and an array is not a currency code or a date.
 */
it("R1 L8 — repeated params are arrays, and behave as an unparameterised visit", () => {
  withLedger(
    { listCurrencySettings: () => [PLN_ROW, EUR_ROW, USD_ROW] },
    {
      quote: ["PLN", "EUR"],
      date: ["2026-08-30"],
    },
  );
  expect(screen.queryByText(/ per USD, /)).toBeNull();
  expect(screen.getByText("PLN · Polish Złoty")).toBeDefined();
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
 * R1 M1 — the range control caps nothing, because nothing it feeds is capped.
 * `clear_manual_rate` carries only `rateRangeOrdered`, so a pair whose manual
 * rows are spread across six years is cleared in one operation — not six the
 * reader has to compose by hand. `RateTable` is virtualized, so drawing that
 * range costs a window, not six years of views.
 *
 * Broken once by nulling `range` past 366 days: both buttons go disabled and
 * this fails on the call count.
 */
it("R1 M1 — a multi-year range still draws and still clears", () => {
  const clearManualRate = vi.fn(() => ({ deleted: 812 }));
  withLedger({ clearManualRate });

  fireEvent.change(screen.getByLabelText("From"), { target: { value: "2020-01-01" } });
  fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-09-03" } });

  expect(screen.getByText("Date")).toBeDefined();
  fireEvent.click(screen.getByText("Clear manual"));
  expect(clearManualRate).toHaveBeenCalledWith(
    expect.objectContaining({ from: "2020-01-01", to: "2026-09-03" }),
    expect.anything(),
  );
});

/**
 * R1 L9 — `isAccountingDate` is shape-only by design, so `2026-02-31` used to
 * reach `addDays`/`daysBetween`, which roll it into March: the table drew rows
 * from 2026-03-03 while `listFxRates` filtered on the literal string. One
 * field, three readings.
 */
it("R1 L9 — a shape-valid date that is not a calendar day draws no table", () => {
  withLedger({});
  expect(screen.getByText("Date")).toBeDefined();

  fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-02-31" } });

  expect(screen.queryByText("Date")).toBeNull();
});

/**
 * The sheet is a modal: a `Toast` on the page behind it is a refusal nobody
 * can read.
 *
 * R1 L6 — scoped **inside** the sheet, which `BottomSheet` labels with its own
 * title. The earlier version asserted on `getByText` at document scope, and
 * the toast path leaves the editor open too, so both of its assertions passed
 * either way: it could not fail for the reason it named. Broken once by
 * routing this back through `setToast` — the message lands outside the sheet
 * and `within` no longer finds it.
 */
it("a refused write states its reason inside the sheet, not on a toast behind it", () => {
  const setManualRate = vi.fn(() => {
    throw new Error("A rate cannot be set for a future date.");
  });
  withLedger({ setManualRate });

  fireEvent.click(screen.getByText("Set a range"));
  fireEvent.change(screen.getByLabelText("Rate · PLN per USD"), { target: { value: "3.7556" } });
  fireEvent.click(screen.getByRole("button", { name: "Set rate" }));

  const sheet = screen.getByLabelText(/^Set PLN per USD/);
  expect(within(sheet).getByText("A rate cannot be set for a future date.")).toBeDefined();
});

/**
 * R1 L5 — the refusal belongs to the rate that caused it. Left standing after
 * a retype it reads as a live objection to what is on screen now, under a
 * field that no longer causes it.
 */
it("R1 L5 — retyping the rate clears the refusal it caused", () => {
  const setManualRate = vi.fn(() => {
    throw new Error("A rate cannot be set for a future date.");
  });
  withLedger({ setManualRate });

  fireEvent.click(screen.getByText("Set a range"));
  const field = screen.getByLabelText("Rate · PLN per USD");
  fireEvent.change(field, { target: { value: "3.7556" } });
  fireEvent.click(screen.getByRole("button", { name: "Set rate" }));
  expect(screen.getByText("A rate cannot be set for a future date.")).toBeDefined();

  fireEvent.change(field, { target: { value: "3.8000" } });
  expect(screen.queryByText("A rate cannot be set for a future date.")).toBeNull();
});

/**
 * R1 M3 — until `BottomSheet` avoids the keyboard, whatever sits at the top of
 * the sheet is what stays reachable when the host lifts it. The rate field is
 * the only thing anyone opens this to type, so it is first — before the count
 * lines and before the actions.
 *
 * Broken once by moving the summary above the field: the field stops being
 * the first control in the sheet and this fails on document order.
 */
it("R1 M3 — the rate field is the first control in the sheet", () => {
  withLedger({});
  fireEvent.click(screen.getByText("Set a range"));

  const sheet = screen.getByLabelText(/^Set PLN per USD/);
  const field = within(sheet).getByLabelText("Rate · PLN per USD");
  const submit = within(sheet).getByRole("button", { name: "Set rate" });
  expect(field.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  // And it is reachable: a typed rate enables the write without anything else
  // on the sheet having to be touched first.
  fireEvent.change(field, { target: { value: "3.7556" } });
  expect(submit).toHaveProperty("disabled", false);
});
