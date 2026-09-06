/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { expect, it } from "vitest";
import { type SafeAreaInsets, SafeAreaProvider } from "../primitives/safe-area";
import { floating } from "../tokens.ts";
import { GroundPanel } from "./card";
import { FloatingClearanceProvider } from "./floating-clearance";

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
 * `scroll="own"` the clearance would land on the *panel*, shortening the
 * screen's own list and leaving a band of empty ground under it — with the
 * last row still under the button at the end of the scroll. The screen that
 * owns the list owns its bottom padding.
 */
it('scroll="own" clears the device but not the floating button', () => {
  const { container } = render(
    <FloatingClearanceProvider value={floating.clearance}>
      <SafeAreaProvider insets={NOTCHED}>
        <GroundPanel scroll="own">
          <Text>hello</Text>
        </GroundPanel>
      </SafeAreaProvider>
    </FloatingClearanceProvider>,
  );
  const panel = container.firstElementChild as HTMLElement;
  // space.x5 (22) + NOTCHED.bottom (34), and nothing for the button.
  expect(getComputedStyle(panel).paddingBottom).toBe("56px");
});

it('scroll="own" renders no ScrollView', () => {
  const { container } = render(
    <GroundPanel scroll="own">
      <Text>hello</Text>
    </GroundPanel>,
  );
  expect(screen.queryByTestId("ground-panel-scroll")).toBeNull();
  // The plain `View` this component was before scrolling existed — the
  // clearance lands directly on it, since there is no scroll content to
  // carry it instead.
  const panel = container.firstElementChild as HTMLElement;
  const style = getComputedStyle(panel);
  expect(style.paddingBottom).toBe("22px");
  expect(style.paddingLeft).toBe("22px");
  expect(style.paddingRight).toBe("22px");
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
