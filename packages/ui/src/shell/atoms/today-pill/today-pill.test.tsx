/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles";
import { floating, touchTarget } from "../../../tokens.ts";
import { TodayPill } from "./today-pill";

function noop() {}

describe("TodayPill", () => {
  /**
   * **It floats on the add button's line and takes no room from the list.** The
   * button is bottom-right, the pill bottom-left, both the inset from the
   * bottom and centred on the same line, so at the list's end (which clears the
   * button) it covers nothing. A pill placed at the top covered the first day
   * header; a band reserved for it moved every row when the anchor left today.
   */
  it("is absolutely positioned bottom-left on the add button's line", () => {
    render(
      <ThemeProvider theme={light}>
        <TodayPill label="Today" accessibilityLabel="Back to today" onPress={noop} />
      </ThemeProvider>,
    );
    const layer = screen.getByRole("button", { name: "Back to today" }).parentElement
      ?.parentElement;
    const style = getComputedStyle(layer as HTMLElement);
    expect(style.position).toBe("absolute");
    expect(style.bottom).toBe(`${floating.inset + (floating.size - touchTarget.min) / 2}px`);
    expect(style.left).toBe(`${floating.inset}px`);
    expect(style.top).not.toBe(`${16}px`);
  });

  /** The button is draggable to either side; the pill takes the other one. */
  it.each([
    ["left", "left"],
    ["right", "right"],
  ] as const)("rests on the %s when told the button is opposite", (side, edge) => {
    render(
      <ThemeProvider theme={light}>
        <TodayPill label="Today" accessibilityLabel="Back to today" onPress={noop} side={side} />
      </ThemeProvider>,
    );
    const layer = screen.getByRole("button", { name: "Back to today" }).parentElement
      ?.parentElement as HTMLElement;
    const style = getComputedStyle(layer);
    expect(style[edge]).toBe(`${floating.inset}px`);
    expect(style[edge === "left" ? "right" : "left"]).not.toBe(`${floating.inset}px`);
  });
});
