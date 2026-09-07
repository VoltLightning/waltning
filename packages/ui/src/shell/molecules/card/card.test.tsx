/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { expect, it } from "vitest";
import { type SafeAreaInsets, SafeAreaProvider } from "../../../primitives/safe-area";
import { floating } from "../../../tokens.ts";
import { FloatingClearanceProvider } from "../../atoms/floating-clearance";
import { GroundPanel } from "./card";

/** `shell.test.tsx`'s own notched fixture — a device with a home indicator. */
const NOTCHED: SafeAreaInsets = { top: 59, right: 0, bottom: 34, left: 0 };

it('scroll="page" (the default) renders a ScrollView whose content carries the clearance and flexGrow', () => {
  render(
    <GroundPanel>
      <Text>hello</Text>
    </GroundPanel>,
  );
  const scroll = screen.getByTestId("ground-panel-scroll");
  expect(scroll).toBeDefined();
  // The content container is the scroll's one child — where the clearance
  // and `flexGrow: 1` live now, not the panel itself.
  const content = scroll.firstElementChild as HTMLElement;
  expect(content).not.toBeNull();
  const style = getComputedStyle(content);
  // The design padding alone: no shell above this panel means no floating
  // button over it, which is true of every route the stack pushes over the
  // tabs and of `StartupFailed`.
  expect(style.paddingBottom).toBe("22px");
  expect(style.paddingLeft).toBe("22px");
  expect(style.paddingRight).toBe("22px");
  expect(style.flexGrow).toBe("1");
});

/**
 * H1: the clearance used to be wired to `clearBottom`, which says *"this is
 * the screen's own bottom edge"* — a different question from *"a button
 * floats over it"*. Ten stack routes and the startup screen answered yes to
 * the first and no to the second, and each grew 72px of dead ground.
 */
it("adds the shell's floating clearance to the page's own padding, under the shell only", () => {
  render(
    <FloatingClearanceProvider value={floating.clearance}>
      <GroundPanel>
        <Text>hello</Text>
      </GroundPanel>
    </FloatingClearanceProvider>,
  );
  const content = screen.getByTestId("ground-panel-scroll").firstElementChild as HTMLElement;
  // space.x5 (22) + floating.clearance (72 — the circle and the inset it rests on).
  expect(getComputedStyle(content).paddingBottom).toBe("94px");
});

/** A panel that is not the screen's bottom edge takes neither the inset nor the button. */
it("takes no floating clearance when it is not the screen's bottom edge", () => {
  render(
    <FloatingClearanceProvider value={floating.clearance}>
      <SafeAreaProvider insets={NOTCHED}>
        <GroundPanel clearBottom={false}>
          <Text>hello</Text>
        </GroundPanel>
      </SafeAreaProvider>
    </FloatingClearanceProvider>,
  );
  const content = screen.getByTestId("ground-panel-scroll").firstElementChild as HTMLElement;
  expect(getComputedStyle(content).paddingBottom).toBe("22px");
});

/**
 * The carve-out, stated as a test so it cannot be quietly reversed: in
 * `scroll="own"` neither the gutter nor the bottom clearance may land on the
 * *panel*. A `View` with padding around a `FlatList` clips the list at that
 * padding — the scroll bar rides 22 pt inside the page, a focused field's ring
 * is sliced off left and right, and the bottom padding shortens the list
 * instead of clearing the fold. The screen that owns the list applies both
 * through `useGroundInset()`, on the content that actually scrolls.
 */
it('scroll="own" leaves the gutter and the bottom to the screen\'s own scroller', () => {
  const { container } = render(
    <FloatingClearanceProvider value={floating.clearance}>
      <SafeAreaProvider insets={NOTCHED}>
        <GroundPanel scroll="own">
          <Text>hello</Text>
        </GroundPanel>
      </SafeAreaProvider>
    </FloatingClearanceProvider>,
  );
  const style = getComputedStyle(container.firstElementChild as HTMLElement);
  expect(style.paddingBottom).toBe("0px");
  expect(style.paddingLeft).toBe("0px");
  expect(style.paddingRight).toBe("0px");
  // The one value a wrapper can carry without clipping anything inside it.
  expect(style.paddingTop).toBe("22px");
});

it('scroll="own" renders no ScrollView', () => {
  render(
    <GroundPanel scroll="own">
      <Text>hello</Text>
    </GroundPanel>,
  );
  expect(screen.queryByTestId("ground-panel-scroll")).toBeNull();
});

/**
 * A page scroller shows no bar: the whole screen moving is its own feedback,
 * and the indicator only ever drew over the gutter. It survives where a pane
 * scrolls independently of the page — the desk rail, a sheet body — which is
 * why this is asserted on the panel rather than banned everywhere.
 */
it("the page scroller shows no scroll indicator", () => {
  render(
    <GroundPanel>
      <Text>hello</Text>
    </GroundPanel>,
  );
  // `scrollbarWidth: none` is what `react-native-web`'s `ScrollViewBase` emits
  // when either indicator prop is false, and it is the whole assertion: a
  // class-name check reads as a second one but cannot fail, because RNW emits
  // hashed atomic classes and never the word.
  const scroller = screen.getByTestId("ground-panel-scroll");
  expect(getComputedStyle(scroller).scrollbarWidth).toBe("none");
});

/**
 * **And it contains nothing**, which is the other half of being the page.
 * `contain` keeps a scroller's *own* bounce and pull-to-refresh — suppressing
 * those is `none` — and stops the scroll from chaining outward, which on a
 * nested scroller is what holds the browser's navigation gesture. A page
 * scroller has nothing outward to chain into, so declaring containment there
 * states something untrue about where it sits and buys nothing. Asserted so
 * that "declared as the page" cannot quietly become "declared and contained".
 */
it("the page scroller contains neither axis", () => {
  render(
    <GroundPanel>
      <Text>hello</Text>
    </GroundPanel>,
  );
  const style = getComputedStyle(screen.getByTestId("ground-panel-scroll"));
  expect(style.getPropertyValue("overscroll-behavior-x")).not.toBe("contain");
  expect(style.getPropertyValue("overscroll-behavior-y")).not.toBe("contain");
});

it("clearBottom (the default) adds the device's own bottom inset to the clearance", () => {
  render(
    <SafeAreaProvider insets={NOTCHED}>
      <GroundPanel>
        <Text>hello</Text>
      </GroundPanel>
    </SafeAreaProvider>,
  );
  const scroll = screen.getByTestId("ground-panel-scroll");
  const content = scroll.firstElementChild as HTMLElement;
  // space.x5 (22) + NOTCHED.bottom (34), and no button over this page.
  expect(getComputedStyle(content).paddingBottom).toBe("56px");
});

it("clearBottom={false} — a panel that is not the screen's own bottom edge (a Dock is) carries no device inset", () => {
  render(
    <SafeAreaProvider insets={NOTCHED}>
      <GroundPanel clearBottom={false}>
        <Text>hello</Text>
      </GroundPanel>
    </SafeAreaProvider>,
  );
  const scroll = screen.getByTestId("ground-panel-scroll");
  const content = scroll.firstElementChild as HTMLElement;
  // Only space.x5 (22) — the design padding, never the device's own inset.
  expect(getComputedStyle(content).paddingBottom).toBe("22px");
});
