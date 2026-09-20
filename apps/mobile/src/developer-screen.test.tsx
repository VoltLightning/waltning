/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

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

it("loads on one press and says what it wrote", () => {
  withLedger();
  fireEvent.click(screen.getByRole("button", { name: "Load demo data" }));

  // The count is the only evidence a press did anything, so it is on screen
  // rather than in a toast that has already gone by the time you look up.
  expect(screen.getByText(/rows · .* accounts/)).toBeDefined();
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
