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
 * `contain` on the scrolling axis, and on the cross axis only for a vertical
 * scroller: a horizontal row inside a sheet must let a vertical drag through
 * to the sheet, which is what `overscroll-behavior-y: contain` would swallow.
 */
export function expectContainsOverscroll(
  target: string | HTMLElement,
  axis: "both" | "horizontal" = "both",
): void {
  // A testID for the usual case; an element for the one where a component
  // draws two of the same kind (`CategorySheet`'s chip rows) and the test has
  // to say which.
  const style = getComputedStyle(typeof target === "string" ? screen.getByTestId(target) : target);
  expect(style.getPropertyValue("overscroll-behavior-x")).toBe("contain");
  if (axis === "both") {
    expect(style.getPropertyValue("overscroll-behavior-y")).toBe("contain");
  } else {
    expect(style.getPropertyValue("overscroll-behavior-y")).not.toBe("contain");
  }
}
