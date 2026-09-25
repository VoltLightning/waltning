/** @vitest-environment jsdom */

import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { type DayActivity, DayCell } from "./day-cell";

/** The mark: the one element in the cell whose box is a square of `side`. */
function markOf(container: HTMLElement, side: number): CSSStyleDeclaration | undefined {
  return Array.from(container.querySelectorAll("div"))
    .map((element) => getComputedStyle(element))
    .find((style) => style.width === `${side}px` && style.height === `${side}px`);
}

/**
 * **A day's mark is a circle, stated as one.** `borderRadius: 999` drew every
 * mark in the day strip as a sharp square on Android. A radius of exactly half
 * the side leaves the platform nothing to clamp.
 */
it.each<[DayActivity, number]>([
  ["none", 5],
  ["some", 8],
  ["heavy", 12],
])("draws a %s day's mark as a circle — radius half its %ipx side", (activity, side) => {
  const { container } = render(
    <DayCell day={22} activity={activity} direction="out" accessibilityLabel="22" onPress={noop} />,
  );
  const mark = markOf(container, side);
  expect(mark, "the mark is on screen at its size").toBeDefined();
  expect(mark?.borderTopLeftRadius).toBe(`${side / 2}px`);
  expect(mark?.borderBottomRightRadius).toBe(`${side / 2}px`);
});

function noop() {}
