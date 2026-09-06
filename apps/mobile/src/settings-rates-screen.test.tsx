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
import { accountingDate, addDays, daysBetween } from "@waltning/core/date";
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
 * R2 M1 — a write on a day the table does not show is a success that looks
 * like nothing happened: the sheet closes, success is silent, and the default
 * 30-day window on a backdated link holds no row that changed. The window
 * widens to contain the linked day and keeps the recent days with it.
 *
 * The linked day is a year back, well outside the default window whatever the
 * device's day happens to be. Broken once by seeding `custom` unconditionally:
 * *From* reads the 30-day start and the row is not on the page.
 */
it("R2 M1 — a backdated link moves the range onto its own day", () => {
  const today = deviceRuntime().capture().date;
  const linked = addDays(today, -365);
  withLedger({}, { quote: "PLN", date: linked });

  expect(screen.getByLabelText("From")).toHaveProperty("value", linked);
  // R4 L2 — the window *moves*, it does not stretch back to today: 30 days,
  // the same span the screen opens with, so the link cannot set the size of
  // what gets drawn or of what *Clear manual* would delete.
  expect(screen.getByLabelText("To")).toHaveProperty("value", addDays(linked, 29));
  // And the linked day is a row on the page behind the sheet, so the write
  // about to happen lands somewhere visible. (`FlatList` under jsdom mounts
  // only its first ten rows, and the widened range opens on this one. The
  // fixture holds no rate for it, so it is a gap row — the date cell is the
  // thing to look for, not a rate.)
  expect(screen.getByText(linked)).toBeDefined();
});

it("R2 M1 — with no link, the range is the plain 30-day window", () => {
  const today = deviceRuntime().capture().date;
  withLedger();
  expect(screen.getByLabelText("From")).toHaveProperty("value", addDays(today, -29));
  expect(screen.getByLabelText("To")).toHaveProperty("value", today);
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
  // `today` on this screen is the *device's* own day (`deviceRuntime()`), not
  // the controller's fixture — so the future date is derived from it rather
  // than written down and left to expire.
  const tomorrow = addDays(deviceRuntime().capture().date, 1);
  withLedger({}, { quote: "PLN", date: tomorrow });
  expect(screen.queryByText(/^Set PLN per USD/)).toBeNull();
});

/**
 * R2 H1 — the editor opens on a pair the link **named**, not on "a quote that
 * failed to resolve". Round 1 gated it on `quoteParam === undefined ||
 * preselected !== undefined`, which reads a link that named no pair at all as
 * resolved — so a bare `?date=` opened the sheet on whichever currency sorted
 * first, headed *Set PLN per USD* after a link that said nothing about PLN.
 * Two taps from the wrong-pair write H1 was raised for, reached through the
 * other half of the same expression.
 *
 * Broken once by restoring the `quoteParam === undefined ||` disjunct: both
 * cases below open the sheet.
 */
it("R2 H1 — ?date= with no ?quote= opens nothing", () => {
  withLedger({ listCurrencySettings: () => [PLN_ROW, EUR_ROW, USD_ROW] }, { date: "2026-08-30" });
  expect(screen.queryByText(/ per USD, /)).toBeNull();
  expect(screen.getByText("PLN · Polish Złoty")).toBeDefined();
});

/**
 * R2 H1 / R1 L8 — a repeated key is an array, and `oneParam` reduces it to
 * `undefined`. Deliberately paired with a **string** date: making both params
 * arrays hid this, because the date failed first and the editor stayed shut
 * for the wrong reason.
 */
it("R2 H1 — a repeated ?quote= names no pair, so it opens nothing", () => {
  withLedger(
    { listCurrencySettings: () => [PLN_ROW, EUR_ROW, USD_ROW] },
    { quote: ["PLN", "EUR"], date: "2026-08-30" },
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

/**
 * R4 L3 — *Clear manual* deletes every hand-set rate across whatever range is
 * loaded, and after a deep link that range is one the link chose. It names the
 * pair, the day count and the dates first, and says what it did after.
 *
 * Broken once by calling the port straight from the button: the first
 * assertion fails, because the write lands before anyone agrees to it.
 */
it("clear manual names the pair and the day count before it deletes anything", () => {
  const clearManualRate = vi.fn(() => ({ deleted: 3 }));
  withLedger({ clearManualRate });

  fireEvent.click(screen.getByText("Clear manual"));
  expect(clearManualRate).not.toHaveBeenCalled();
  expect(
    screen.getByText(
      /removes every rate set by hand for PLN per USD across 30 days, .* … .*\. Rates from a source are left alone/,
    ),
  ).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Yes, clear them" }));
  expect(clearManualRate).toHaveBeenCalledWith(
    expect.objectContaining({ base: "USD", quote: "PLN" }),
    expect.anything(),
  );
  expect(screen.getByText("Cleared 3 manual rates.")).toBeDefined();
});

it("clear manual, declined, deletes nothing", () => {
  const clearManualRate = vi.fn(() => ({ deleted: 3 }));
  withLedger({ clearManualRate });
  fireEvent.click(screen.getByText("Clear manual"));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(clearManualRate).not.toHaveBeenCalled();
});

/**
 * A destructive act whose whole visible effect is rows in a scrolled-past part
 * of the table changing source is indistinguishable from a press that did
 * nothing. Zero gets its own sentence rather than "Cleared 0".
 */
it("clear manual says what it did, and says nothing found in its own words", () => {
  const clearManualRate = vi.fn(() => ({ deleted: 0 }));
  withLedger({ clearManualRate });
  fireEvent.click(screen.getByText("Clear manual"));
  fireEvent.click(screen.getByRole("button", { name: "Yes, clear them" }));
  expect(screen.getByText("No rates set by hand in that range.")).toBeDefined();
  expect(screen.queryByText(/Cleared 0/)).toBeNull();
});

/**
 * R4 L3, the case that made it 310 days — a link seeds the range, so the
 * confirmation is the only place the reader learns what they are about to
 * delete. With the window clamped (R4 L2) that is 30 days rather than the span
 * back to today, and the sentence says which 30.
 */
it("R4 L3 — a deep-linked range states its own day count before deleting", () => {
  const today = deviceRuntime().capture().date;
  const linked = addDays(today, -365);
  const clearManualRate = vi.fn(() => ({ deleted: 7 }));
  withLedger({ clearManualRate }, { quote: "PLN", date: linked });

  fireEvent.click(screen.getByText("Clear manual"));
  expect(
    screen.getByText(
      new RegExp(`PLN per USD across 30 days, ${linked} … ${addDays(linked, 29)}\\.`),
    ),
  ).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Yes, clear them" }));
  // Exactly the range the sentence named — never a wider one.
  expect(clearManualRate).toHaveBeenCalledWith(
    expect.objectContaining({ from: linked, to: addDays(linked, 29) }),
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
  // A range this person typed themselves — the confirmation states its size
  // and then it clears, in one operation rather than six 366-day ones.
  const typedDays = daysBetween(accountingDate("2020-01-01"), accountingDate("2026-09-03")) + 1;
  expect(
    screen.getByText(new RegExp(`across ${typedDays} days, 2020-01-01 … 2026-09-03`)),
  ).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Yes, clear them" }));
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

/**
 * R4 L2 — the extreme. `?date=1000-01-01` used to make the window stretch from
 * the linked day to today: 375,001 calendar days, which `RateTable` fills in
 * one synchronous loop before a `FlatList` gets to window anything — ~287 ms
 * of frozen main thread measured on a laptop, and a *Clear manual* scoped to a
 * millennium.
 *
 * A bound, not a refusal: the link still lands on its own day, with the same
 * 30-day window the screen opens with.
 *
 * Broken once by restoring `to: today`: *To* reads today and the span is six
 * figures.
 */
it("R4 L2 — a link a thousand years back still opens on its day, in a 30-day window", () => {
  withLedger({}, { quote: "PLN", date: "1000-01-01" });

  expect(screen.getByLabelText("From")).toHaveProperty("value", "1000-01-01");
  expect(screen.getByLabelText("To")).toHaveProperty("value", "1000-01-30");
  // The editor is open on the linked day itself, not on the window's end.
  expect(screen.getByText("Set PLN per USD, 1000-01-01 … 1000-01-01")).toBeDefined();
  // And the table drew that window: its first and last rows, and nothing past.
  expect(screen.getByText("1000-01-01")).toBeDefined();
  expect(screen.queryByText("1000-01-31")).toBeNull();
});
