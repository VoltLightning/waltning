/**
 * @vitest-environment jsdom
 *
 * The band's variant of a control whose default belongs to the page.
 */

import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme/provider";
import { light } from "../theme/roles.ts";
import { SegmentControl } from "./segment-control";

const SEGMENTS = [
  { value: "mine", label: "Mine", count: 4 },
  { value: "ours", label: "Ours", count: 7 },
] as const;

function countColour(tone: "surface" | "shell"): string {
  const view = render(
    <ThemeProvider theme={light}>
      <SegmentControl segments={SEGMENTS} value="ours" onChange={vi.fn()} tone={tone} />
    </ThemeProvider>,
  );
  const count = view.getByText("4");
  const colour = getComputedStyle(count).color;
  view.unmount();
  return colour;
}

/**
 * **A count on the band is the band's ink.** `textMuted` is a ground colour and
 * measures 1.78:1 on the shell's recessed track in light — the same hazard the
 * label beside it already routes around, and the reason the count has its own
 * style at all. Nothing exercised it: the control's stories all pass counts on
 * a card, so the shell branch shipped unrendered.
 */
it("draws a count on the band in the band's muted ink", () => {
  expect(countColour("shell")).toBe("rgb(184, 196, 174)");
});

/** The default is unchanged — every other caller sits on a card. */
it("draws a count on a card in the page's muted ink", () => {
  expect(countColour("surface")).toBe("rgb(138, 132, 120)");
});

/**
 * **The ring on the band, asserted where it renders.** `theme.test.tsx` proves
 * `shellFocusRing` clears 3:1 on `shell` — a property of two hex strings, which
 * cannot notice this control going back to the green one. The whole ring fix
 * was deletable with the suite green, the same shape as the `tone` prop that
 * shipped unasserted a round earlier.
 */
it("focuses a segment with the ring of the ground it is on", () => {
  for (const [tone, expected] of [
    ["shell", "rgb(242, 240, 231)"],
    ["surface", "rgb(100, 129, 92)"],
  ] as const) {
    const view = render(
      <ThemeProvider theme={light}>
        <SegmentControl segments={SEGMENTS} value="ours" onChange={vi.fn()} tone={tone} />
      </ThemeProvider>,
    );
    const [first] = view.getAllByRole("tab");
    if (first === undefined) throw new Error("SegmentControl draws no segment");
    fireEvent.focusIn(first);
    expect(getComputedStyle(first).outlineColor, tone).toBe(expected);
    view.unmount();
  }
});
