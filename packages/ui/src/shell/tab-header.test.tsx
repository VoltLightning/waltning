/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { expect, it } from "vitest";
import { type SafeAreaInsets, SafeAreaProvider } from "../primitives/safe-area";
import { TabHeader } from "./tab-header";

/** `shell.test.tsx`'s own notched fixture. */
const NOTCHED: SafeAreaInsets = { top: 59, right: 0, bottom: 34, left: 0 };

it("states the tab's name", () => {
  render(<TabHeader title="Ledger" />);
  expect(screen.getByText("Ledger")).toBeDefined();
});

it("renders the one action it is given, beside the title", () => {
  render(<TabHeader title="Ledger" action={<Text>Filter</Text>} />);
  expect(screen.getByText("Filter")).toBeDefined();
});

/**
 * The band clears the status bar the way `Shell` does — the inset plus the
 * design's own breathing room, added rather than maxed, so the phones that
 * reserve the most room are not the ones whose title sits against the clock.
 */
it("clears the device's top inset, added to the design's own padding", () => {
  const { container } = render(
    <SafeAreaProvider insets={NOTCHED}>
      <TabHeader title="Debt" />
    </SafeAreaProvider>,
  );
  const header = container.firstElementChild as HTMLElement;
  // space.x5 (22) + NOTCHED.top (59).
  expect(getComputedStyle(header).paddingTop).toBe("81px");
});
