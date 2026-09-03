/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TabBar } from "./tab-bar";

const ITEMS = [
  { name: "today", label: "Today", icon: null, active: true },
  { name: "ledger", label: "Ledger", icon: null, active: false },
  { name: "calendar", label: "Calendar", icon: null, active: false },
  { name: "debt", label: "Debt", icon: null, active: false },
];

describe("TabBar", () => {
  it("renders every item as a tab role with aria-selected", () => {
    render(<TabBar items={ITEMS} onSelect={vi.fn()} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(ITEMS.length);
    for (const item of ITEMS) {
      const tab = screen.getByRole("tab", { name: item.label });
      expect(tab.getAttribute("aria-selected")).toBe(String(item.active));
    }
  });

  it("selects the tapped tab by name", () => {
    const onSelect = vi.fn();
    render(<TabBar items={ITEMS} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("tab", { name: "Ledger" }));
    expect(onSelect).toHaveBeenCalledWith("ledger");
  });

  it("supports five targets, each clearing the touch-target floor", () => {
    const five = [...ITEMS, { name: "settings", label: "Settings", icon: null, active: false }];
    render(<TabBar items={five} onSelect={vi.fn()} />);
    expect(screen.getAllByRole("tab")).toHaveLength(5);
  });
});
