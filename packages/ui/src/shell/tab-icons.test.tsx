/** @vitest-environment jsdom */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "../theme/provider";
import { light } from "../theme/roles.ts";
import {
  CalendarTabIcon,
  DebtTabIcon,
  LedgerTabIcon,
  SettingsTabIcon,
  TodayTabIcon,
} from "./tab-icons";

const ICONS = [
  ["Today", TodayTabIcon],
  ["Ledger", LedgerTabIcon],
  ["Calendar", CalendarTabIcon],
  ["Debt", DebtTabIcon],
  ["Settings", SettingsTabIcon],
] as const;

/**
 * The painted colours of an SVG glyph, which is where they live now — these
 * were five shapes built from `View`s and the assertion read `backgroundColor`
 * off them. Phosphor paints `fill` on `<path>`, so reading a background would
 * find nothing and pass an empty set.
 */
function fillsOf(container: HTMLElement): Set<string> {
  return new Set(
    Array.from(container.querySelectorAll("svg *"))
      .map((el) => el.getAttribute("fill"))
      .filter((fill): fill is string => fill !== null && fill !== "none"),
  );
}

describe("tab icons", () => {
  /**
   * §2.4 reserves the circle for the radio, the switch and the floating add
   * button, and a round tab glyph reads as one of those. Asserted on the SVG's
   * own elements: a `borderRadius` check would now pass on every icon whatever
   * shape it was, because none of them draws a bordered box any more.
   */
  it.each(ICONS)("%s draws no circle", (_name, Icon) => {
    const { container } = render(<Icon />);
    expect(container.querySelector("circle")).toBeNull();
    expect(container.querySelector("ellipse")).toBeNull();
  });

  it.each(ICONS)("%s fits the box TabBar reserves", (_name, Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.getAttribute("height")).toBe("20");
  });

  it.each(ICONS)("%s follows the label — accentText active, textMuted inactive", (_name, Icon) => {
    const inactive = render(
      <ThemeProvider theme={light}>
        <Icon active={false} />
      </ThemeProvider>,
    );
    const active = render(
      <ThemeProvider theme={light}>
        <Icon active />
      </ThemeProvider>,
    );

    const inactiveColors = fillsOf(inactive.container);
    const activeColors = fillsOf(active.container);

    expect(inactiveColors.size).toBeGreaterThan(0);
    expect(activeColors.size).toBeGreaterThan(0);
    expect(activeColors).toContain(light.accentText);
    expect(inactiveColors).toContain(light.textMuted);
    // The two states never share a colour — the whole point of the flag.
    for (const colour of activeColors) {
      expect(inactiveColors.has(colour)).toBe(false);
    }

    inactive.unmount();
    active.unmount();
  });
});
