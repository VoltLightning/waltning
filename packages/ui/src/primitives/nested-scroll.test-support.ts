/**
 * One assertion, used from each bounded scroller's own test file.
 *
 * **Why it is not a single test that mounts everything.** Three rounds of
 * review established that a rule reading source can always be spelled around,
 * and that a rendered test of the *helpers* proves only the helpers. What has
 * to be true is that each real picker, sheet body and rail contains its own
 * overscroll — and the cheapest honest way to assert that is inside the test
 * file that already builds that component's fixtures. So the assertion lives
 * here and the call sites live there.
 *
 * Swap a bounded scroller's helper for `pageScrollProps`, or drop the spread,
 * and one of those tests fails. That is the guarantee; `tests/architecture.test.ts`
 * is the census that says nobody forgot to declare.
 */

import { screen } from "@testing-library/react";
import { expect } from "vitest";

/**
 * A vertical scroller contains both axes — its own travel, and the browser's
 * horizontal back-gesture on the axis it cannot use. A horizontal chip row
 * contains `x` alone, because above *it* is the sheet or page that scrolls
 * vertically, and that drag has to reach it.
 */
export function expectContainsOverscroll(
  target: string | HTMLElement,
  axis: "vertical" | "horizontal" = "vertical",
): void {
  // A testID for the usual case; an element for the one where a component
  // draws two of the same kind (`CategorySheet`'s chip rows) and the test has
  // to say which.
  const style = getComputedStyle(typeof target === "string" ? screen.getByTestId(target) : target);
  expect(style.getPropertyValue("overscroll-behavior-x")).toBe("contain");
  if (axis === "vertical") {
    expect(style.getPropertyValue("overscroll-behavior-y")).toBe("contain");
  } else {
    // A chip row leaves `y` free so the sheet or page under it still moves.
    expect(style.getPropertyValue("overscroll-behavior-y")).not.toBe("contain");
  }
}

/**
 * **A list in a sheet is scrolled by the sheet** (`BottomSheet`'s header):
 * inside the body, and with nothing between the two that scrolls on its own.
 * A nested vertical scroller took no touch on iOS, and one capped at nine rows
 * left the rest of a list unreachable under the keyboard.
 */
export function expectScrolledByTheSheet(list: string): void {
  const body = screen.getByTestId("bottom-sheet-body");
  const node = screen.getByTestId(list);
  expect(body.contains(node), `${list} is in the sheet's body`).toBe(true);
  for (let at: HTMLElement | null = node; at !== null && at !== body; at = at.parentElement) {
    const overflow = getComputedStyle(at).getPropertyValue("overflow-y");
    expect(overflow === "auto" || overflow === "scroll", `${list} scrolls on its own`).toBe(false);
  }
}
