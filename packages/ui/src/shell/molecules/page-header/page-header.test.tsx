/** @vitest-environment jsdom */

/**
 * The band every screen that is not a tab root opens with. Its whole reason to
 * exist beside `GroundPanel` — which never clears the top — is the inset, so
 * that is what most of this is about.
 */

import { render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { expect, it } from "vitest";
import { type SafeAreaInsets, SafeAreaProvider } from "../../../primitives/safe-area";
import { PageHeader } from "./page-header";

/** `shell.test.tsx`'s own notched fixture. */
const NOTCHED: SafeAreaInsets = { top: 59, right: 0, bottom: 34, left: 0 };

it("states the screen's name", () => {
  render(<PageHeader title="Currencies" />);
  expect(screen.getByText("Currencies")).toBeDefined();
});

it("states the line under it, and renders none when there is none", () => {
  const { unmount } = render(
    <PageHeader title="Currencies" subtitle="Which exist, and where rates come from" />,
  );
  expect(screen.getByText("Which exist, and where rates come from")).toBeDefined();
  unmount();

  render(<PageHeader title="Currencies" />);
  expect(screen.queryByText("Which exist, and where rates come from")).toBeNull();
});

it("renders the one control it is given, beside the words", () => {
  render(<PageHeader title="Currencies" action={<Text>Back</Text>} />);
  expect(screen.getByText("Back")).toBeDefined();
});

/**
 * The inset plus the design's own breathing room, **added** rather than
 * `max()`ed — so the phones reserving the most room are not the ones whose
 * title sits against the clock. This is the whole reason the band is composed
 * beside `GroundPanel` rather than inside it: the panel clears its sides and
 * bottom and deliberately never its top.
 */
it("clears the device's top inset, added to the design's own padding", () => {
  const { container } = render(
    <SafeAreaProvider insets={NOTCHED}>
      <PageHeader title="Accounts" />
    </SafeAreaProvider>,
  );
  const band = container.firstElementChild as HTMLElement;
  // gutter (20) + NOTCHED.top (59).
  expect(getComputedStyle(band).paddingTop).toBe("79px");
  // And the sides take the gutter plus the deck's own 4pt inset — the same
  // one `DayHeader` keeps under a day's card.
  expect(getComputedStyle(band).paddingLeft).toBe("24px");
});
