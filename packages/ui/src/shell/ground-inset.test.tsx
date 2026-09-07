/**
 * @vitest-environment jsdom
 *
 * `useGroundInset()` — the values `GroundPanel scroll="own"` hands to the
 * screen that owns the scroller, because a `View` around one would clip it.
 */

import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { SafeAreaProvider } from "../primitives/safe-area";
import { floating } from "../tokens.ts";
import { FloatingClearanceProvider } from "./floating-clearance";
import { useGroundInset } from "./ground-inset.ts";

const NOTCHED = { top: 59, right: 0, bottom: 34, left: 0 };
const LANDSCAPE = { top: 0, right: 44, bottom: 21, left: 44 };

function Probe() {
  const inset = useGroundInset();
  return <div data-testid="probe" data-inset={JSON.stringify(inset)} />;
}

function read() {
  return JSON.parse(screen.getByTestId("probe").dataset["inset"] ?? "{}") as ReturnType<
    typeof useGroundInset
  >;
}

it("is the design gutter alone where no provider sits above", () => {
  render(<Probe />);
  const inset = read();
  expect(inset.gutter).toEqual({ paddingLeft: 22, paddingRight: 22 });
  // No button, no device inset: the content pays the design padding only.
  expect(inset.content.paddingBottom).toBe(22);
});

it("adds the device's own bottom inset and the button's clearance to the content", () => {
  render(
    <FloatingClearanceProvider value={floating.clearance}>
      <SafeAreaProvider insets={NOTCHED}>
        <Probe />
      </SafeAreaProvider>
    </FloatingClearanceProvider>,
  );
  expect(read().content.paddingBottom).toBe(22 + NOTCHED.bottom + floating.clearance);
});

/**
 * The gutter is a *screen* measurement, so a landscape notch widens it — and
 * it has to widen on the scroller's content, where the rows are, rather than
 * on a wrapper that would then clip those rows at the same place.
 */
it("carries the device's side insets into both the gutter and the content", () => {
  render(
    <SafeAreaProvider insets={LANDSCAPE}>
      <Probe />
    </SafeAreaProvider>,
  );
  const inset = read();
  expect(inset.gutter).toEqual({ paddingLeft: 66, paddingRight: 66 });
  expect(inset.content.paddingLeft).toBe(66);
  expect(inset.content.paddingRight).toBe(66);
});

/**
 * A focused field's ring is 2 pt wide at a 2 pt offset, so it needs 4 pt
 * outside the field's own box. The gutter is what gives it that room *inside*
 * the scroller's clip — which is the whole reason this value travels down
 * rather than being applied to a `View` around the scroller.
 */
it("leaves more room than a focus ring needs", () => {
  render(<Probe />);
  expect(read().gutter.paddingLeft).toBeGreaterThanOrEqual(4);
});
