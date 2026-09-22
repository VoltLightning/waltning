/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const router = {
  push: vi.fn(),
  back: vi.fn(),
  canGoBack: () => true,
  dismissTo: vi.fn(),
};

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
}));

import {
  createPhoneLedger,
  type PhoneLedgerPort,
} from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { basePort } from "@waltning/client/ledger/test-port";
import { accountingDate, addDays } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, toMoney } from "@waltning/core/money";

import Settings from "./settings-screen";

const PLN = currencyCode("PLN");

/**
 * The screen reads the ledger now — the line under each label is a fact, not
 * a guess, so there has to be something for it to be a fact about.
 */
function withLedger(over: Partial<PhoneLedgerPort> = {}) {
  const port = basePort({
    listAccounts: () => [
      {
        id: id<"accounts">("11111111-1111-4111-8111-111111111111"),
        name: "Bank A · PLN",
        kind: "bank",
        currency: PLN,
        decimals: 2,
        balance: toMoney("0"),
        groupId: null,
        ownership: "own",
        isBusiness: false,
        archived: false,
        expectedBalance: null,
        openingBalance: toMoney("0"),
        openingDate: null,
        memo: "",
        version: 1,
      },
    ],
    listCurrencies: () => [
      {
        code: PLN,
        name: "Polish Złoty",
        symbol: "zł",
        decimals: 2,
        capturable: true,
        isPivot: true,
      },
    ],
    ...over,
  });
  render(
    <LedgerProvider
      controller={createPhoneLedger(port, {
        capture: () => ({
          date: accountingDate("2026-09-16"),
          timeZone: "Europe/Warsaw",
          offsetMinutes: 120,
          at: new Date("2026-09-16T10:00:00Z"),
        }),
        id: () => id("33333333-3333-4333-8333-333333333333"),
      })}
    >
      <Settings />
    </LedgerProvider>,
  );
}

/** S16 §2's own entry — the register had no reachable one before this row existed. */
it("opens Accounts, and lists it first", () => {
  withLedger();
  // The label *and* the fact behind it — `S30`'s value line, read from the
  // ledger rather than guessed. Accounts and Currencies have one; the other
  // three have nothing true to say yet and render the label alone.
  expect(screen.getAllByRole("button").map((row) => row.textContent)).toEqual([
    "Accounts1 account",
    "Categories",
    "Currencies1 currency",
    "Exchange rates",
    "Back up",
    "Restore",
    // Last, and in a group of its own — a development affordance never sits
    // among the rows a person uses. Present here because a test runs under
    // `__DEV__`; a production build has no such row at all.
    "Developer",
  ]);
  fireEvent.click(screen.getByText("Accounts"));
  expect(router.push).toHaveBeenCalledWith("/accounts");
});

it("opens Currencies", () => {
  withLedger();
  fireEvent.click(screen.getByText("Currencies"));
  expect(router.push).toHaveBeenCalledWith("/settings/currencies");
});

it("opens Exchange rates", () => {
  withLedger();
  fireEvent.click(screen.getByText("Exchange rates"));
  expect(router.push).toHaveBeenCalledWith("/settings/rates");
});

/** §14.3's other half — the screen that makes the export a backup. */
it("opens Restore", () => {
  withLedger();
  fireEvent.click(screen.getByText("Restore"));
  expect(router.push).toHaveBeenCalledWith("/settings/restore");
});

/** `architecture/14` §14.3's export — the phone's only durability before a backend. */
it("opens Back up", () => {
  withLedger();
  fireEvent.click(screen.getByText("Back up"));
  expect(router.push).toHaveBeenCalledWith("/settings/backup");
});

/** The tab shell draws the screen's name — a heading here would be it twice. */
it("draws no title of its own", () => {
  withLedger();
  expect(screen.queryByText("Settings")).toBeNull();
});

/**
 * **The gate is the row, not the screen.** `PREVIEW_RESET_ENABLED` is `true`
 * under a test runner (`__DEV__`), so what is asserted here is that the row
 * exists and goes to the right place; the production half is asserted by
 * reading the flag rather than by pretending a build.
 */
it("offers the developer screen in a build that carries the preview flag", () => {
  withLedger();
  fireEvent.click(screen.getByRole("button", { name: /Developer/ }));
  expect(router.push).toHaveBeenCalledWith("/settings/developer");
});

/**
 * **Every row states the fact that sends you into it** — how many categories
 * something is filed under, how old the stalest quote is. A row with nothing
 * true to say keeps its label alone.
 */
it("states the categories in use and the oldest quote's age", () => {
  withLedger({
    listCategoryUsage: () =>
      new Map([
        [id<"categories">("00000000-0000-4000-8000-0000000000c1"), 12],
        [id<"categories">("00000000-0000-4000-8000-0000000000c2"), 3],
        [id<"categories">("00000000-0000-4000-8000-0000000000c3"), 0],
      ]),
    readCoverage: (today) => [
      {
        code: currencyCode("EUR"),
        source: "nbp",
        firstDate: addDays(today, -400),
        lastDate: addDays(today, -5),
        days: 395,
        realDays: 280,
        calendarDays: 400,
        coveragePct: 99,
        futureRows: 0,
      },
    ],
  });
  expect(screen.getByText("2 in use")).toBeDefined();
  expect(screen.getByText("Oldest quote 5 days old")).toBeDefined();
});
