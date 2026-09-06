/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NO_INSETS, SafeAreaProvider } from "../primitives/safe-area";
import { ComposerHeader } from "./composer-header";

it("calls onCancel from the ✕ — a composer's own escape", () => {
  const onCancel = vi.fn();
  render(<ComposerHeader onCancel={onCancel} title="Transfer" />);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalledOnce();
});

it("states the title of a composer whose kind cannot change (S31 §3)", () => {
  render(<ComposerHeader onCancel={vi.fn()} title="Transfer" />);
  expect(screen.getByText("Transfer")).toBeDefined();
  expect(screen.queryByRole("button", { name: /Kind:/ })).toBeNull();
});

/**
 * S05 §9.1's escape hatch, and `▾` meaning what it draws: the header names
 * the draft's kind and opens a menu listing both, rather than flipping on a
 * tap while wearing a menu's chevron.
 */
it("opens a kind menu rather than flipping on one tap (S05 §9.1)", () => {
  const onKindChange = vi.fn();
  render(<ComposerHeader onCancel={vi.fn()} kind="expense" onKindChange={onKindChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Kind: Expense" }));
  expect(onKindChange).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("radio", { name: "Income" }));
  expect(onKindChange).toHaveBeenCalledWith("income");
});

/**
 * Being read is the whole reason the menu opens — a sheet that answers
 * nothing the trigger already said is a tap spent on nothing.
 */
it("marks the current kind inside the menu", () => {
  render(<ComposerHeader onCancel={vi.fn()} kind="income" onKindChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Kind: Income" }));
  expect(screen.getByRole("radio", { name: "Income" }).getAttribute("aria-checked")).toBe("true");
  expect(screen.getByRole("radio", { name: "Expense" }).getAttribute("aria-checked")).toBe("false");
});

/**
 * **The marked option is not a dead tap.** A radio group swallows a press on
 * its own selected value — right for a form field, wrong for a menu, and it
 * left the option a person is most likely to reach first (the draft's own
 * kind, on the screen's default state) doing nothing at all, with the sheet
 * still open over the composer. Every picker in this app closes on the
 * current value; this one does too.
 */
it("closes on the kind already chosen, changing nothing (H1)", () => {
  const onKindChange = vi.fn();
  render(<ComposerHeader onCancel={vi.fn()} kind="expense" onKindChange={onKindChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Kind: Expense" }));

  fireEvent.click(screen.getByRole("radio", { name: "Expense" }));
  expect(screen.queryByRole("radio", { name: "Expense" })).toBeNull();
  expect(onKindChange).not.toHaveBeenCalled();
});

/** §9.1 — a transfer is a different shape, with its own composer and its own entry. */
it("offers expense and income only — never a transfer (S05 §9.1)", () => {
  render(<ComposerHeader onCancel={vi.fn()} kind="expense" onKindChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Kind: Expense" }));
  expect(screen.queryByRole("radio", { name: "Transfer" })).toBeNull();
});

/**
 * The band is what clears the device's top inset — `GroundPanel` never does
 * (the top belongs to the header above it), and this header has no
 * navigation bar above it to inherit one from. Asserted on the rendered
 * style rather than a screenshot: every machine this suite runs on reports
 * zero insets, so a baseline can never see this.
 */
it("clears the device's top inset itself", () => {
  const { container, rerender } = render(
    <SafeAreaProvider insets={NO_INSETS}>
      <ComposerHeader onCancel={vi.fn()} title="Transfer" />
    </SafeAreaProvider>,
  );
  const band = container.firstElementChild as HTMLElement;
  const flat = band.style.paddingTop;

  rerender(
    <SafeAreaProvider insets={{ top: 59, right: 0, bottom: 0, left: 0 }}>
      <ComposerHeader onCancel={vi.fn()} title="Transfer" />
    </SafeAreaProvider>,
  );
  const notched = (container.firstElementChild as HTMLElement).style.paddingTop;

  expect(Number.parseFloat(notched) - Number.parseFloat(flat)).toBe(59);
});
