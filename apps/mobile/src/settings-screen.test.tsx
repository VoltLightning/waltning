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
