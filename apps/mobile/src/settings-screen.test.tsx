/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const router = { push: vi.fn(), back: vi.fn(), dismissTo: vi.fn() };

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
}));

import Settings from "./settings-screen";

/** S16 §2's own entry — the register had no reachable one before this row existed. */
it("opens Accounts, and lists it first", () => {
  render(<Settings />);
  expect(screen.getAllByRole("button").map((row) => row.textContent)).toEqual([
    "Accounts",
    "Categories",
    "Currencies",
    "Exchange rates",
  ]);
  fireEvent.click(screen.getByText("Accounts"));
  expect(router.push).toHaveBeenCalledWith("/accounts");
});

it("opens Currencies", () => {
  render(<Settings />);
  fireEvent.click(screen.getByText("Currencies"));
  expect(router.push).toHaveBeenCalledWith("/settings/currencies");
});

it("opens Exchange rates", () => {
  render(<Settings />);
  fireEvent.click(screen.getByText("Exchange rates"));
  expect(router.push).toHaveBeenCalledWith("/settings/rates");
});

/** The tab shell draws the screen's name — a heading here would be it twice. */
it("draws no title of its own", () => {
  render(<Settings />);
  expect(screen.queryByText("Settings")).toBeNull();
});
