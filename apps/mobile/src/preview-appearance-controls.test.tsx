/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PreviewAppearanceControls } from "./preview-appearance-controls";

it("offers exactly System, Light, and Dark while production omits reset", () => {
  render(
    <PreviewAppearanceControls
      preference="system"
      resetEnabled={false}
      onPreference={vi.fn(async () => undefined)}
      onReset={vi.fn()}
      onLoadDemo={vi.fn(() => "0 rows · 0 accounts")}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Appearance" }));

  for (const choice of ["System", "Light", "Dark"]) {
    expect(screen.getByRole("tab", { name: choice })).toBeDefined();
  }
  expect(screen.queryByRole("button", { name: "Reset preview data" })).toBeNull();
});

it("requires a second destructive action before reset", () => {
  const onReset = vi.fn();
  render(
    <PreviewAppearanceControls
      preference="dark"
      resetEnabled
      onPreference={vi.fn(async () => undefined)}
      onReset={onReset}
      onLoadDemo={vi.fn(() => "0 rows · 0 accounts")}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
  fireEvent.click(screen.getByRole("button", { name: "Reset preview data" }));
  expect(onReset).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Delete preview data" }));
  expect(onReset).toHaveBeenCalledOnce();
});

it("hides the demo loader wherever the reset is hidden", () => {
  render(
    <PreviewAppearanceControls
      preference="system"
      resetEnabled={false}
      onPreference={vi.fn(async () => undefined)}
      onReset={vi.fn()}
      onLoadDemo={vi.fn(() => "0 rows · 0 accounts")}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
  // Both are development affordances and neither belongs in a hand somebody
  // keeps their own ledger in, so they are gated together rather than each
  // carrying its own flag to forget.
  expect(screen.queryByRole("button", { name: "Load demo data" })).toBeNull();
});

it("loads on one press and says what it wrote", () => {
  const onLoadDemo = vi.fn(() => "482 rows · 4 accounts");
  render(
    <PreviewAppearanceControls
      preference="dark"
      resetEnabled
      onPreference={vi.fn(async () => undefined)}
      onReset={vi.fn()}
      onLoadDemo={onLoadDemo}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
  fireEvent.click(screen.getByRole("button", { name: "Load demo data" }));

  // One press, unlike the reset — filling a ledger is additive, and only the
  // destructive one earns a confirmation.
  expect(onLoadDemo).toHaveBeenCalledTimes(1);
  // The count is the only evidence it happened, so the sheet stays open.
  expect(screen.getByText("482 rows · 4 accounts")).toBeDefined();
});
