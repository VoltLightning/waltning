/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { expect, it } from "vitest";
import { type SafeAreaInsets, SafeAreaProvider } from "../primitives/safe-area";
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
  expect(style.paddingBottom).toBe("22px");
  expect(style.paddingLeft).toBe("22px");
  expect(style.paddingRight).toBe("22px");
  expect(style.flexGrow).toBe("1");
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
  // space.x5 (22) + NOTCHED.bottom (34).
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
