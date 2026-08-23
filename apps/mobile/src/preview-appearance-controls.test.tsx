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
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
  fireEvent.click(screen.getByRole("button", { name: "Reset preview data" }));
  expect(onReset).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Delete preview data" }));
  expect(onReset).toHaveBeenCalledOnce();
});
