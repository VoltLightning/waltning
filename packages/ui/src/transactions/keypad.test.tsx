/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/provider";
import { Keypad } from "./keypad";

function noop() {}

it("every digit reports its own key", () => {
  const onKey = vi.fn();
  render(<Keypad onKey={onKey} />);
  for (const digit of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]) {
    fireEvent.click(screen.getByRole("button", { name: digit }));
  }
  expect(onKey.mock.calls.map((call) => call[0])).toEqual([
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "0",
  ]);
});

it('delete reports "delete"', () => {
  const onKey = vi.fn();
  render(<Keypad onKey={onKey} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(onKey).toHaveBeenCalledWith("delete");
});

it("the decimal key always reports the canonical comma, in English", () => {
  const onKey = vi.fn();
  render(<Keypad onKey={onKey} />);
  fireEvent.click(screen.getByRole("button", { name: "." }));
  expect(onKey).toHaveBeenCalledWith(",");
});

it("the decimal key still reports comma when the label shows one, in Polish", () => {
  const onKey = vi.fn();
  render(
    <I18nProvider locale="pl">
      <Keypad onKey={onKey} />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "," }));
  expect(onKey).toHaveBeenCalledWith(",");
});

it("every key clears the §10 floor", () => {
  render(<Keypad onKey={noop} />);
  for (const button of screen.getAllByRole("button")) {
    expect(getComputedStyle(button).minHeight).toBe("44px");
  }
});

it("disables every key at once", () => {
  render(<Keypad onKey={noop} disabled />);
  for (const button of screen.getAllByRole("button")) {
    expect(button.getAttribute("aria-disabled")).toBe("true");
  }
});
