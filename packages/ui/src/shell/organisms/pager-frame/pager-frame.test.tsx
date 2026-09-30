/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { Text } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { space } from "../../../tokens.ts";
import { GroundPanel } from "../../molecules/card/card";
import { COLLAPSE_TRAVEL } from "../../molecules/pager-header/collapse.ts";
import type { PagerPage } from "../pager/pager";
import { PagerFrame } from "./pager-frame";

const PAGES: readonly PagerPage[] = [
  { key: "summary", label: "Summary", node: <Text>summary body</Text> },
  { key: "list", label: "List", node: <Text>list body</Text> },
  { key: "calendar", label: "Calendar", node: <Text>calendar body</Text> },
  { key: "months", label: "Months", node: <Text>months body</Text> },
];

const BAR = {
  previous: "Previous month",
  next: "Next month",
  search: "Search",
  pickPeriod: "Choose a month",
};

function draw(props: Partial<Parameters<typeof PagerFrame>[0]> = {}) {
  const onPageChange = props.onPageChange ?? vi.fn();
  const view = render(
    <ThemeProvider theme={light}>
      <PagerFrame
        periodLabel="September"
        periodDetail="2026"
        periodKey="2026-09"
        onPickPeriod={vi.fn()}
        scrollY={{ value: 0 } as SharedValue<number>}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onSearch={vi.fn()}
        barLabels={BAR}
        searchOpen={false}
        searchQuery=""
        onSearchChange={vi.fn()}
        onSearchClose={vi.fn()}
        searchPlaceholder="Search this ledger"
        pages={PAGES}
        activeKey="list"
        onPageChange={onPageChange}
        {...props}
      />
    </ThemeProvider>,
  );
  return { ...view, onPageChange };
}

it("draws one bar and one row of names for all four pages", () => {
  draw();
  // A screen that composed these itself could draw a different bar per page,
  // and the pager would stop reading as one screen the first time it did.
  expect(screen.getAllByRole("heading", { name: "September" })).toHaveLength(1);
  expect(screen.getAllByRole("tablist")).toHaveLength(1);
  expect(screen.getAllByRole("tab")).toHaveLength(4);
});

it("takes the tab names from the pages, so the two cannot drift", () => {
  draw({
    pages: [
      { key: "a", label: "Podsumowanie", node: <Text>a</Text> },
      { key: "b", label: "Lista", node: <Text>b</Text> },
    ],
    activeKey: "a",
  });
  expect(screen.getByRole("tab", { name: "Podsumowanie" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "Lista" })).toBeTruthy();
});

it("reports a tap on a name the same way a swipe reports itself", () => {
  const { onPageChange } = draw();
  screen.getByRole("tab", { name: "Months" }).click();
  expect(onPageChange).toHaveBeenCalledExactlyOnceWith("months");
});

/**
 * The chrome's footprint and the pager's box, read off the rendered styles at a
 * given offset.
 *
 * Both come from `useAnimatedStyle`, which the jsdom mock evaluates
 * immediately and writes as inline style — so the resolved geometry is
 * readable without laying anything out. The chrome is the element carrying a
 * `margin-bottom`; nothing else in this tree sets one, and the pager's box is
 * the element that follows it.
 */
function geometry(): { height: number; margin: number; pagerStyle: string } {
  const chrome = document.querySelector<HTMLElement>('div[style*="margin-bottom"]');
  if (chrome === null) throw new Error("the chrome carries no margin — it gives nothing back");
  const header = chrome.firstElementChild as HTMLElement | null;
  if (header === null) throw new Error("the chrome has no header");
  const pager = chrome.nextElementSibling as HTMLElement | null;
  if (pager === null) throw new Error("nothing follows the chrome");
  return {
    height: Number.parseFloat(header.style.height),
    margin: Number.parseFloat(chrome.style.marginBottom),
    pagerStyle: pager.getAttribute("style") ?? "",
  };
}

/** The top padding of the first page's scroll content — where its first row starts. */
function contentTop(): number {
  const scroller = screen.getAllByTestId("ground-panel-scroll")[0];
  const content = scroller?.firstElementChild as HTMLElement | null;
  if (content === null || content === undefined) throw new Error("no scroll content");
  return Number.parseFloat(content.style.paddingTop);
}

/** Offsets across the whole travel, both sides of it, and tiny steps around the midpoint. */
const OFFSETS = [
  -20,
  0,
  1,
  COLLAPSE_TRAVEL / 2 - 0.5,
  COLLAPSE_TRAVEL / 2,
  COLLAPSE_TRAVEL / 2 + 0.5,
  COLLAPSE_TRAVEL / 2,
  COLLAPSE_TRAVEL - 1,
  COLLAPSE_TRAVEL,
  COLLAPSE_TRAVEL + 400,
];

it("never moves or resizes the pager, whatever the offset", () => {
  /**
   * **The loop this exists to rule out.** The header used to give up its height
   * by moving the pager — a translate that was a function of the scroll offset
   * — and a scroller whose own frame is a function of its offset is a feedback
   * loop under the finger: the drag moves the frame, the frame moves the drag.
   * At the point where the header changes shape it is an oscillation.
   *
   * So the scroll may change the header and nothing else. The chrome's
   * footprint (its header's height plus its negative margin) and the pager's
   * box must be the same at every offset, walked in both directions with tiny
   * steps around the midpoint — and the room the page leaves for the header
   * overlay must not depend on the offset either.
   */
  const { unmount } = draw({
    scrollY: { value: 0 } as SharedValue<number>,
    pages: [
      { key: "summary", label: "Summary", node: <GroundPanel>{null}</GroundPanel> },
      { key: "list", label: "List", node: <Text>list body</Text> },
    ],
    activeKey: "summary",
  });
  const rest = geometry();
  const restTop = contentTop();
  unmount();

  let collapsedAtLeastOnce = false;
  for (const offset of OFFSETS) {
    const view = draw({
      scrollY: { value: offset } as SharedValue<number>,
      pages: [
        { key: "summary", label: "Summary", node: <GroundPanel>{null}</GroundPanel> },
        { key: "list", label: "List", node: <Text>list body</Text> },
      ],
      activeKey: "summary",
    });
    const here = geometry();
    if (here.height < rest.height) collapsedAtLeastOnce = true;
    expect(here.height + here.margin, `the chrome's footprint moved at ${offset}`).toBeCloseTo(
      rest.height + rest.margin,
    );
    expect(here.pagerStyle, `the pager moved or resized at ${offset}`).toBe(rest.pagerStyle);
    expect(contentTop(), `the page's first row moved at ${offset}`).toBe(restTop);
    view.unmount();
  }
  expect(collapsedAtLeastOnce, "the header never collapsed").toBe(true);
});

it("leaves the room the expanded header overlays above the first row", () => {
  draw({
    pages: [
      { key: "summary", label: "Summary", node: <GroundPanel>{null}</GroundPanel> },
      { key: "list", label: "List", node: <Text>list body</Text> },
    ],
    activeKey: "summary",
  });
  // The design padding, plus exactly the height the header gives up: what
  // scrolls away as the header collapses, leaving the first row against it.
  expect(contentTop()).toBe(space.x2 + COLLAPSE_TRAVEL);
});

it("exposes only the page you are on, with all four mounted", () => {
  draw();
  expect(screen.getByText("months body")).toBeTruthy();
  const exposed = screen
    .getAllByRole("tabpanel")
    .filter((el) => el.getAttribute("aria-hidden") !== "true");
  expect(exposed).toHaveLength(1);
  expect(exposed[0]?.getAttribute("aria-label")).toBe("List");
});
