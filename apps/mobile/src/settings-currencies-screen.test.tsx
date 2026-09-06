/**
 * @vitest-environment jsdom
 *
 * S17 against an in-memory ledger — `@waltning/client/ledger/test-port`'s
 * shared `basePort` (M4).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import {
  createPhoneLedger,
  type PhoneLedgerPort,
} from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { basePort } from "@waltning/client/ledger/test-port";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode } from "@waltning/core/money";
import { beforeEach, expect, it, vi } from "vitest";

const router = { push: vi.fn(), back: vi.fn(), dismissTo: vi.fn() };

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
}));

import SettingsCurrenciesScreen from "./settings-currencies-screen";

const PLN = currencyCode("PLN");
const USD = currencyCode("USD");

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

function fakeController(overrides: {
  listCurrencySettings?: PhoneLedgerPort["listCurrencySettings"];
  setPinned?: PhoneLedgerPort["setPinned"];
  archiveCurrency?: PhoneLedgerPort["archiveCurrency"];
  addCurrency?: PhoneLedgerPort["addCurrency"];
  changePivot?: PhoneLedgerPort["changePivot"];
  updateCurrency?: PhoneLedgerPort["updateCurrency"];
  readCoverage?: PhoneLedgerPort["readCoverage"];
}) {
  const port = basePort({
    listCurrencySettings: overrides.listCurrencySettings ?? (() => [PLN_ROW, USD_ROW]),
    readCoverage:
      overrides.readCoverage ??
      (() => [
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
      ]),
    addCurrency: overrides.addCurrency ?? (() => ({ code: "EUR" })),
    archiveCurrency: overrides.archiveCurrency ?? (() => ({ code: "PLN" })),
    setPinned: overrides.setPinned ?? (() => ({ code: "PLN" })),
    changePivot: overrides.changePivot ?? (() => ({ code: "USD", droppedDates: 0 })),
    updateCurrency: overrides.updateCurrency ?? (() => ({ code: "PLN" })),
  });
  return createPhoneLedger(port, {
    capture: () => ({
      date: accountingDate("2026-09-03"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-09-03T10:00:00Z"),
    }),
    id: () => id("33333333-3333-4333-8333-333333333333"),
  });
}

function withLedger(overrides: Parameters<typeof fakeController>[0] = {}) {
  return render(
    <LedgerProvider controller={fakeController(overrides)}>
      <SettingsCurrenciesScreen />
    </LedgerProvider>,
  );
}

/**
 * S17 §3 — a row is compact until it is tapped; its pinned toggle, rate
 * source and actions live in the detail it expands. Every test below that
 * touches one of those opens the row first, the way a person does.
 */
function expandRow(code: string) {
  // A regex, deliberately: the row's accessible name is everything in it —
  // code, name, symbol · decimals, coverage, pinned. An exact match on the
  // bare code would pass only while the name is an override that silences all
  // of that, which is the bug R1 M5 names.
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${code} · `) }));
}

beforeEach(() => {
  router.push.mockClear();
});

it("renders a row per non-pivot currency, and the pivot read-only", () => {
  withLedger();
  // "PLN" also renders as the pivot-change target Select's default value
  // (C1) — at least one match is the row's own code.
  expect(screen.getAllByText("PLN").length).toBeGreaterThan(0);
  expect(screen.getByText("Polish Złoty")).toBeDefined();
  // USD is the pivot — not in the row list, stated in the read-only line instead.
  expect(screen.queryByText("US Dollar")).toBeNull();
});

/**
 * `05-composites` §5.1 — a card groups related rows. With only the pivot set
 * up there are no rows to group, so there is no card: a titled card holding
 * nothing is chrome claiming a list exists. *Add currency* is a button and
 * sits on the ground either way.
 */
it("renders no currency card when the pivot is the only currency, only the Add button", () => {
  withLedger({ listCurrencySettings: () => [USD_ROW] });
  expect(screen.queryByText("Currencies")).toBeNull();
  expect(screen.getByText("Add currency")).toBeDefined();
});

/**
 * The card carried the screen's own name, 40 px under a navigation header
 * saying the same word. Broken once by putting `title` back on the `Card` —
 * "Currencies" then renders twice on a screen that has one list.
 */
it("the list card carries no title of its own — the navigation header has that word", () => {
  withLedger();
  expect(screen.queryByText("Currencies")).toBeNull();
});

/**
 * S17 §3 — the row is a row until it is asked to be an editor. Six rows each
 * holding an open toggle, an open select and two buttons is what made this
 * screen three screens tall.
 */
it("a row is compact until tapped, then expands its own controls in place", () => {
  withLedger();
  expect(screen.getByText("zł · 2dp")).toBeDefined();
  expect(screen.queryByLabelText("Pinned")).toBeNull();
  expect(screen.queryByText("Archive")).toBeNull();

  expandRow("PLN");
  expect(screen.getByLabelText("Pinned")).toBeDefined();
  expect(screen.getByText("Archive")).toBeDefined();

  // Tapping it again closes it — one row open at a time, and none is forced.
  expandRow("PLN");
  expect(screen.queryByLabelText("Pinned")).toBeNull();
});

it("opening a second row closes the first", () => {
  const EUR = currencyCode("EUR");
  withLedger({
    listCurrencySettings: () => [
      PLN_ROW,
      {
        code: EUR,
        name: "Euro",
        symbol: "€",
        symbolPosition: "S",
        decimals: 2,
        rateSource: "ecb",
        pinned: false,
        isPivot: false,
        version: 1,
      },
      USD_ROW,
    ],
  });

  expandRow("PLN");
  expect(screen.getByLabelText("Edit PLN")).toBeDefined();
  expandRow("EUR");
  expect(screen.getByLabelText("Edit EUR")).toBeDefined();
  expect(screen.queryByLabelText("Edit PLN")).toBeNull();
});

it("toggling pinned calls set_pinned with the row's own version", () => {
  const setPinned = vi.fn(() => ({ code: "PLN" }));
  withLedger({ setPinned });
  expandRow("PLN");
  fireEvent.click(screen.getByLabelText("Pinned"));
  expect(setPinned).toHaveBeenCalledWith(
    { code: "PLN", version: 3, pinned: false },
    expect.anything(),
  );
});

it("archiving a referenced currency is refused with the executor's reason, on a Toast", () => {
  // The port throws — same as the real executor's refusal — and the
  // controller (`refusalFromThrow`) is what turns that into `fieldErrors`.
  const archiveCurrency = vi.fn(() => {
    throw new Error("PLN is still referenced by an account.");
  });
  withLedger({ archiveCurrency });
  expandRow("PLN");
  fireEvent.click(screen.getByText("Archive"));
  expect(archiveCurrency).toHaveBeenCalledWith({ code: "PLN", version: 3 }, expect.anything());
  expect(screen.getByText("PLN is still referenced by an account.")).toBeDefined();
});

it("adding a currency writes through add_currency and closes the sheet", () => {
  const addCurrency = vi.fn(() => ({ code: "EUR" }));
  withLedger({ addCurrency });
  fireEvent.click(screen.getByText("Add currency"));
  fireEvent.change(screen.getByLabelText("Code"), { target: { value: "eur" } });
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Euro" } });
  fireEvent.click(screen.getByText("Save"));
  expect(addCurrency).toHaveBeenCalledWith(
    expect.objectContaining({ code: "EUR", name: "Euro", symbol: "" }),
    expect.anything(),
  );
});

it("changing the pivot writes the chosen target, never the current pivot (C1)", () => {
  // PLN is the fixture's only non-pivot row (USD is the pivot) — the target
  // `Select` defaults to it, so no explicit choice is needed for one candidate.
  const changePivot = vi.fn(() => ({ code: "PLN", droppedDates: 0 }));
  withLedger({ changePivot });
  fireEvent.click(screen.getByText("Change pivot"));
  expect(changePivot).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Yes, change it" }));
  expect(changePivot).toHaveBeenCalledWith({ code: "PLN" }, expect.anything());
});

// M7 — a stale `pivotTargetCode` survives a successful change: it names the
// currency that *just became* the pivot, which the target `Select` no
// longer offers, and a second press would resend it, refused as "already
// the pivot".
it("M7 — the pivot target select recovers after a successful change", () => {
  const EUR = currencyCode("EUR");
  const EUR_ROW = {
    code: EUR,
    name: "Euro",
    symbol: "€",
    symbolPosition: "P",
    decimals: 2,
    rateSource: "ecb",
    pinned: false,
    isPivot: false,
    version: 1,
  };
  let pivot = "USD";
  const listCurrencySettings = () => [
    { ...PLN_ROW, isPivot: pivot === "PLN" },
    { ...USD_ROW, isPivot: pivot === "USD" },
    { ...EUR_ROW, isPivot: pivot === "EUR" },
  ];
  const changePivot = vi.fn((input: { code: string }) => {
    pivot = input.code;
    return { code: input.code, droppedDates: 0 };
  });
  withLedger({ listCurrencySettings, changePivot });

  // Explicitly choose EUR — the bug is in the state this sets, not the
  // Select's own default.
  fireEvent.click(screen.getByRole("button", { name: /New pivot/ }));
  fireEvent.click(screen.getByRole("radio", { name: "EUR" }));
  fireEvent.click(screen.getByText("Change pivot"));
  fireEvent.click(screen.getByRole("button", { name: "Yes, change it" }));
  expect(changePivot).toHaveBeenCalledWith({ code: "EUR" }, expect.anything());

  // EUR is now the pivot; PLN and USD are the only valid targets. The
  // select must show one of them, and a second press must not resend EUR.
  changePivot.mockClear();
  expect(screen.queryByRole("button", { name: /New pivot: EUR/ })).toBeNull();
  fireEvent.click(screen.getByText("Change pivot"));
  fireEvent.click(screen.getByRole("button", { name: "Yes, change it" }));
  expect(changePivot).not.toHaveBeenCalledWith({ code: "EUR" }, expect.anything());
});

// M2 — the rewrite drops every date it cannot re-base against the new pivot
// (§7.0), and until now it said so to nobody: the change succeeded either
// way, and the screen looked identical whether one date survived or all of
// them did. Not an error, so a toast rather than a field error.
it("M2 — a pivot change that dropped dates says how many, in a toast", () => {
  const changePivot = vi.fn(() => ({ code: "PLN", droppedDates: 27 }));
  withLedger({ changePivot });
  fireEvent.click(screen.getByText("Change pivot"));
  fireEvent.click(screen.getByRole("button", { name: "Yes, change it" }));
  expect(
    screen.getByText("Pivot changed · 27 dates had no rate to rebase and were dropped"),
  ).toBeDefined();
});

it("M2 — a pivot change that dropped nothing says nothing", () => {
  const changePivot = vi.fn(() => ({ code: "PLN", droppedDates: 0 }));
  withLedger({ changePivot });
  fireEvent.click(screen.getByText("Change pivot"));
  fireEvent.click(screen.getByRole("button", { name: "Yes, change it" }));
  expect(screen.queryByText(/had no rate to rebase/)).toBeNull();
});

it("maps the executor's two refusals to their own texts, never one fallback (C1)", () => {
  const alreadyPivot = vi.fn(() => {
    throw new Error("change_pivot: PLN is already the pivot");
  });
  withLedger({ changePivot: alreadyPivot });
  fireEvent.click(screen.getByText("Change pivot"));
  fireEvent.click(screen.getByRole("button", { name: "Yes, change it" }));
  expect(screen.getByText("That currency is already the pivot.")).toBeDefined();
});

it("states the transaction-count refusal with its own text (C1)", () => {
  const refused = vi.fn(() => {
    throw new Error(
      "change_pivot: refused — a phone alone cannot re-rate existing transactions; " +
        "change the pivot before the first capture (S29a)",
    );
  });
  withLedger({ changePivot: refused });
  fireEvent.click(screen.getByText("Change pivot"));
  fireEvent.click(screen.getByRole("button", { name: "Yes, change it" }));
  expect(screen.getByText("The pivot can't change while a transaction exists.")).toBeDefined();
});

it("the pivot confirmation states the refusal before offering, not after", () => {
  withLedger();
  fireEvent.click(screen.getByText("Change pivot"));
  expect(screen.getByText(/Refused once any transaction exists/)).toBeDefined();
});

it("a row states its own symbol and decimals", () => {
  withLedger();
  expect(screen.getByText("zł · 2dp")).toBeDefined();
});

it("editing a row's symbol and decimals writes through update_currency", () => {
  const updateCurrency = vi.fn(() => ({ code: "PLN" }));
  withLedger({ updateCurrency });
  expandRow("PLN");
  fireEvent.click(screen.getByLabelText("Edit PLN"));
  fireEvent.change(screen.getByLabelText("Symbol"), { target: { value: "PLN" } });
  fireEvent.click(screen.getByText("Save"));
  expect(updateCurrency).toHaveBeenCalledWith(
    { code: "PLN", version: 3, patch: { symbol: "PLN" } },
    expect.anything(),
  );
});

/**
 * S17 §6 — coverage is a measurement stated in sentence case, not a state
 * wearing an upper-cased pill. The row's own *Exchange rates* action is where
 * "set one by hand" becomes a place: the coverage line itself is plain text,
 * because the row around it is the tap target now.
 */
it("a currency with no rates yet says so, as a plain caption and not a button", () => {
  withLedger({
    readCoverage: () => [
      {
        code: PLN,
        source: "nbp",
        firstDate: accountingDate("2026-09-03"),
        lastDate: accountingDate("2026-09-03"),
        days: 0,
        realDays: 0,
        calendarDays: 0,
        coveragePct: 0,
        futureRows: 0,
      },
    ],
  });
  expect(screen.getByText("No rates yet · set one by hand")).toBeDefined();
  expect(screen.queryByRole("button", { name: "No rates yet · set one by hand" })).toBeNull();
});

it("a row's Exchange rates action opens S18 with the pair preselected", () => {
  withLedger();
  expandRow("PLN");
  fireEvent.click(screen.getByText("Exchange rates"));
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/settings/rates",
    params: { quote: "PLN" },
  });
});

/**
 * R1 M5 — `accessibilityLabel` **overrides** the name a reader would compose
 * from a pressable's descendants. With the whole row header now a button, a
 * bare `row.code` made the currency's name, its symbol and decimals, its
 * coverage and its pinned state audible to nobody: a screen reader heard
 * "PLN, button" and stopped. That is S17 §6's *"coverage is stated per
 * currency"* stated to sighted users only.
 *
 * Broken once by putting `accessibilityLabel={row.code}` back — every
 * assertion below fails at once.
 */
it("R1 M5 — the row's accessible name carries everything the row shows", () => {
  withLedger({
    readCoverage: () => [
      {
        code: PLN,
        source: "nbp",
        firstDate: accountingDate("2020-11-25"),
        lastDate: accountingDate("2022-03-11"),
        days: 23,
        realDays: 23,
        calendarDays: 100,
        coveragePct: 23,
        futureRows: 0,
      },
    ],
  });

  const row = screen.getByRole("button", { name: /^PLN · / });
  const name = row.getAttribute("aria-label") ?? "";
  expect(name).toContain("Polish Złoty");
  expect(name).toContain("zł · 2dp");
  expect(name).toContain("23% · last quote 2022-03-11");
  // PLN_ROW is pinned.
  expect(name).toContain("Pinned");
});

/**
 * R1 L10 — *pinned* is a state the currency is in; coverage is a measurement
 * of it. Rendering both as muted captions side by side said the opposite of
 * the rule this screen's own spec states, so the state wears the `Tag` and the
 * measurement does not.
 */
it("R1 L10 — pinned is tagged where coverage is a caption", () => {
  withLedger();
  const pinned = screen.getByText("Pinned");
  expect(getComputedStyle(pinned).textTransform).toBe("uppercase");
  expect(getComputedStyle(screen.getByText("100%")).textTransform).not.toBe("uppercase");
});

/**
 * R2 L9 — the visible *Pinned* mark is hidden while the row is open, because
 * the `Toggle` immediately below states the same fact and can change it. The
 * accessible name said it regardless, so a screen-reader user got the exact
 * duplication the sighted row avoids: "… Pinned" followed by "Pinned, on".
 */
it("R2 L9 — the accessible name drops Pinned once the Toggle below states it", () => {
  withLedger();
  const closed = screen.getByRole("button", { name: /^PLN · / });
  expect(closed.getAttribute("aria-label")).toContain("Pinned");

  expandRow("PLN");
  const open = screen.getByRole("button", { name: /^PLN · / });
  expect(open.getAttribute("aria-label")).not.toContain("Pinned");
  // The Toggle is what states it now.
  expect(screen.getByLabelText("Pinned")).toBeDefined();
});
