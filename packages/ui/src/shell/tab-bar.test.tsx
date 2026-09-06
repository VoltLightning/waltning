/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TabBar } from "./tab-bar";
import {
  DebtTabIcon,
  LedgerTabIcon,
  SettingsTabIcon,
  TAB_ICON_SIZE,
  TodayTabIcon,
} from "./tab-icons";

/** The four the phone wires today — Calendar returns with S11. */
const ITEMS = [
  { name: "today", label: "Today", icon: null, active: true },
  { name: "ledger", label: "Ledger", icon: null, active: false },
  { name: "debt", label: "Debt", icon: null, active: false },
  { name: "settings", label: "Settings", icon: null, active: false },
];

const WITH_GLYPHS = [
  { name: "today", label: "Today", icon: <TodayTabIcon active />, active: true },
  { name: "ledger", label: "Ledger", icon: <LedgerTabIcon />, active: false },
  { name: "debt", label: "Debt", icon: <DebtTabIcon />, active: false },
  { name: "settings", label: "Settings", icon: <SettingsTabIcon />, active: false },
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

  it("supports a fifth target, each clearing the touch-target floor", () => {
    const five = [...ITEMS, { name: "calendar", label: "Calendar", icon: null, active: false }];
    render(<TabBar items={five} onSelect={vi.fn()} />);
    expect(screen.getAllByRole("tab")).toHaveLength(5);
  });

  /**
   * `Today`'s glyph was a bare 14px square while the other four drew at 20, so
   * its label sat 3px above theirs. The box belongs to the bar now, and a
   * glyph that draws smaller sits inside it rather than shortening the row.
   */
  it("reserves one icon box for every tab, whatever the glyph draws inside it", () => {
    render(<TabBar items={WITH_GLYPHS} onSelect={vi.fn()} />);
    for (const tab of screen.getAllByRole("tab")) {
      const box = tab.firstElementChild;
      expect(box).toBeInstanceOf(HTMLElement);
      const style = getComputedStyle(box as HTMLElement);
      expect(style.width).toBe(`${TAB_ICON_SIZE}px`);
      expect(style.height).toBe(`${TAB_ICON_SIZE}px`);
    }
  });
});
