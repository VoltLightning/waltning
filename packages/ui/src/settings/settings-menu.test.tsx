/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SettingsMenu } from "./settings-menu";

const ITEMS = [
  { id: "accounts", label: "Accounts" },
  { id: "categories", label: "Categories" },
];

it("renders one row per destination and hands back the id that was tapped", () => {
  const onSelect = vi.fn();
  render(<SettingsMenu items={ITEMS} onSelect={onSelect} />);

  expect(screen.getAllByRole("button")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Categories" }));
  expect(onSelect).toHaveBeenCalledWith("categories");
});

/**
 * The screen's own name is the shell's to draw — a title here would be the
 * same word twice, which is the defect this component replaced.
 */
it("draws no title of its own", () => {
  render(<SettingsMenu items={ITEMS} onSelect={vi.fn()} />);
  expect(screen.queryByText("Settings")).toBeNull();
});
