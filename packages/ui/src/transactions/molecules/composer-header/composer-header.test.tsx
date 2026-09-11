/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NO_INSETS, SafeAreaProvider } from "../../../primitives/safe-area";
import { ComposerHeader } from "./composer-header";

it("calls onCancel from the ✕ — a composer's own escape", () => {
  const onCancel = vi.fn();
  render(<ComposerHeader onCancel={onCancel} title="Move money" />);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalledOnce();
});

it("states the name and the line under it, and nothing else is a control", () => {
  render(
    <ComposerHeader onCancel={vi.fn()} title="Add an expense" subtitle="Wednesday, 3 September" />,
  );
  expect(screen.getByText("Add an expense")).toBeDefined();
  expect(screen.getByText("Wednesday, 3 September")).toBeDefined();
  expect(screen.getAllByRole("button")).toHaveLength(1);
});

it("clears the device's top inset itself", () => {
  const { container, rerender } = render(
    <SafeAreaProvider insets={NO_INSETS}>
      <ComposerHeader onCancel={vi.fn()} title="Move money" />
    </SafeAreaProvider>,
  );
  const band = container.firstElementChild as HTMLElement;
  const flat = band.style.paddingTop;

  rerender(
    <SafeAreaProvider insets={{ top: 59, right: 0, bottom: 0, left: 0 }}>
      <ComposerHeader onCancel={vi.fn()} title="Move money" />
    </SafeAreaProvider>,
  );
  const notched = (container.firstElementChild as HTMLElement).style.paddingTop;

  expect(Number.parseFloat(notched) - Number.parseFloat(flat)).toBe(59);
});
