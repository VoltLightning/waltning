/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SettingsMenu } from "./settings-menu";

const GROUPS = [
  [
    { id: "accounts", label: "Accounts", value: "Four, one shared", glyph: "accounts" },
    { id: "categories", label: "Categories", glyph: "categories" },
  ],
  [{ id: "backup", label: "Back up", glyph: "backup" }],
] as const;

it("renders one row per destination and hands back the id that was tapped", () => {
  const onSelect = vi.fn();
  render(<SettingsMenu groups={GROUPS} onSelect={onSelect} />);

  expect(screen.getAllByRole("button")).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Categories" }));
  expect(onSelect).toHaveBeenCalledWith("categories");
});

/**
 * The screen's own name is the shell's to draw — a title here would be the
 * same word twice, which is the defect this component replaced.
 */
it("draws no title of its own", () => {
  render(<SettingsMenu groups={GROUPS} onSelect={vi.fn()} />);
  expect(screen.queryByText("Settings")).toBeNull();
});

/**
 * The line under a label is the one fact that answers the question sending you
 * into the screen — and a row with nothing true to say renders the label
 * alone rather than a placeholder figure.
 */
it("states the fact behind a row, and nothing where there is none", () => {
  render(<SettingsMenu groups={GROUPS} onSelect={vi.fn()} />);
  expect(screen.getByText("Four, one shared")).toBeDefined();
  expect(screen.getByRole("button", { name: "Accounts, Four, one shared" })).toBeDefined();
  // Categories has no value: its accessible name is the label alone.
  expect(screen.getByRole("button", { name: "Categories" })).toBeDefined();
});

/** Three destinations in two groups is two cards, not one list. */
it("draws one card per group", () => {
  const { container } = render(<SettingsMenu groups={GROUPS} onSelect={vi.fn()} />);
  const cards = container.querySelectorAll('[class*="r-borderRadius"]');
  expect(cards.length).toBeGreaterThanOrEqual(2);
});
