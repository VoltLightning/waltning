/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const restartApp = vi.fn<() => Promise<void>>();
vi.mock("./platform", () => ({
  restartApp: () => restartApp(),
}));
/**
 * The loader, real unless a test says otherwise. This file's ledger has no
 * store behind it and refuses every history row, so a *clean* run — the one
 * that restarts — is one a test has to state.
 */
type LoadDemo = typeof import("@waltning/client/ledger/demo/load-demo").loadDemo;
let loadOverride: LoadDemo | null = null;
vi.mock("@waltning/client/ledger/demo/load-demo", async (importOriginal) => {
  const real = await importOriginal<typeof import("@waltning/client/ledger/demo/load-demo")>();
  return {
    ...real,
    loadDemo: (...args: Parameters<LoadDemo>) => (loadOverride ?? real.loadDemo)(...args),
  };
});
/** A run the ledger took whole — the only kind that restarts. */
const cleanRun: LoadDemo = async () => ({
  rates: 0,
  accounts: 11,
  categories: 0,
  transactions: 540,
  counterparties: 6,
  refused: 0,
});
beforeEach(() => {
  restartApp.mockReset();
  restartApp.mockResolvedValue(undefined);
  loadOverride = null;
});

vi.mock("expo-router", () => ({
  get router() {
    return { push: vi.fn(), back: vi.fn(), canGoBack: () => true, dismissTo: vi.fn() };
  },
}));

import {
  createPhoneLedger,
  type PhoneLedgerPort,
} from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { basePort } from "@waltning/client/ledger/test-port";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";

import Developer from "./developer-screen";

function withLedger(over: Partial<PhoneLedgerPort> = {}) {
  const port = basePort(over);
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
      <Developer />
    </LedgerProvider>,
  );
  return port;
}

/**
 * A clean load ends in a true restart, and the app is covered until then —
 * the tabs included, because leaving halfway is the failure this exists for.
 */
it("covers the app while it loads, then restarts it", async () => {
  loadOverride = cleanRun;
  withLedger();
  fireEvent.click(screen.getByRole("button", { name: "Load demo data" }));

  expect(screen.getByText("Loading demo data"), "the cover, from the first frame").toBeDefined();
  await waitFor(() => expect(restartApp).toHaveBeenCalledTimes(1), { timeout: 10_000 });
  expect(screen.getByText("Restarting…")).toBeDefined();
});

/**
 * A run the ledger partly refused does not restart: the restart would wipe the
 * only sentence that says so. It stays on the count, with *Restart now* beside
 * it for when the reader has read it.
 */
it("stays on the count when rows were refused, and restarts on request", async () => {
  withLedger();
  fireEvent.click(screen.getByRole("button", { name: "Load demo data" }));

  expect(await screen.findByText(/refused/, {}, { timeout: 10_000 })).toBeDefined();
  expect(restartApp).not.toHaveBeenCalled();
  expect(screen.queryByText("Loading demo data"), "the cover is gone").toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Restart now" }));
  expect(restartApp).toHaveBeenCalledTimes(1);
});

/**
 * A restart the platform refuses must not leave the cover up forever: the
 * count comes back, which is still the only evidence the press did anything.
 */
it("falls back to the count when the restart itself is refused", async () => {
  loadOverride = cleanRun;
  restartApp.mockRejectedValueOnce(new Error("updates disabled"));
  withLedger();
  fireEvent.click(screen.getByRole("button", { name: "Load demo data" }));

  expect(await screen.findByText(/540 rows/)).toBeDefined();
  expect(screen.queryByText("Restarting…"), "the cover is gone").toBeNull();
});

/**
 * Emptying a ledger closes the store and deletes both files, which nothing
 * undoes. Filling one is additive and undone by the button below it — so only
 * the destructive half confirms.
 */
it("asks twice before resetting, and not at all before loading", () => {
  const reset = vi.fn();
  withLedger({ reset });

  fireEvent.click(screen.getByRole("button", { name: "Reset preview data" }));
  expect(reset, "the first press only asks").not.toHaveBeenCalled();

  // The confirm says what it does — *Delete preview data* — rather than
  // repeating the word that opened it.
  fireEvent.click(screen.getByRole("button", { name: "Delete preview data" }));
  expect(reset).toHaveBeenCalledTimes(1);
});

it("lets the confirmation be backed out of", () => {
  const reset = vi.fn();
  withLedger({ reset });

  fireEvent.click(screen.getByRole("button", { name: "Reset preview data" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(reset).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Reset preview data" }),
    "back to one button",
  ).toBeDefined();
});
