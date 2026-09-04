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

describe("tab icons", () => {
  it.each(ICONS)("%s never draws a circle — no borderRadius: 999 anywhere", (_name, Icon) => {
    const { container } = render(<Icon />);
    for (const el of Array.from(container.querySelectorAll<HTMLElement>("*"))) {
      const radius = getComputedStyle(el).borderRadius;
      expect(radius).not.toBe("999px");
    }
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

    // Background colour only — `borderColor` computes to a non-transparent
    // default even on elements with `borderWidth: 0`, which would report a
    // "shared colour" that was never actually painted.
    const inactiveColors = new Set(
      Array.from(inactive.container.querySelectorAll<HTMLElement>("*"))
        .map((el) => getComputedStyle(el).backgroundColor)
        .filter((c) => c && c !== "rgba(0, 0, 0, 0)"),
    );
    const activeColors = new Set(
      Array.from(active.container.querySelectorAll<HTMLElement>("*"))
        .map((el) => getComputedStyle(el).backgroundColor)
        .filter((c) => c && c !== "rgba(0, 0, 0, 0)"),
    );

    expect(inactiveColors.size).toBeGreaterThan(0);
    expect(activeColors.size).toBeGreaterThan(0);
    // The two states never share a colour — the whole point of the flag.
    for (const colour of activeColors) {
      expect(inactiveColors.has(colour)).toBe(false);
    }

    inactive.unmount();
    active.unmount();
  });
});
