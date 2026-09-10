/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { Text } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
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
 * The chrome's footprint, read off the rendered styles at a given offset.
 *
 * Both numbers come from `useAnimatedStyle`, which the jsdom mock evaluates
 * immediately and writes as inline style — so the resolved geometry is
 * readable without laying anything out. The chrome is the element carrying a
 * `margin-bottom`; nothing else in this tree sets one.
 */
function chromeGeometry(): { height: number; margin: number; pagerShift: number } {
  const chrome = document.querySelector<HTMLElement>('div[style*="margin-bottom"]');
  if (chrome === null) throw new Error("the chrome carries no margin — it gives nothing back");
  const header = chrome.firstElementChild as HTMLElement | null;
  if (header === null) throw new Error("the chrome has no header");
  const pager = chrome.nextElementSibling as HTMLElement | null;
  if (pager === null) throw new Error("nothing follows the chrome");
  const shift = /translateY\((-?[\d.]+)px\)/.exec(pager.style.transform);
  return {
    height: Number.parseFloat(header.style.height),
    margin: Number.parseFloat(chrome.style.marginBottom),
    pagerShift: shift === null ? 0 : Number(shift[1]),
  };
}

it("gives back exactly what the header takes, so the pager never changes size", () => {
  /**
   * **The guarantee the whole change exists for, asserted where it is applied
   * rather than where it is defined.**
   *
   * `collapse.test.ts` checks that `headerHeight(p) - chromeSlack(p)` is the
   * collapsed height — but those are two exported functions and that identity
   * is true whether or not any component calls either of them. Delete both
   * animated styles from `pager-frame.tsx` and every other test in this package
   * still passes, while the feedback loop is back: the header resizes the
   * scroller it reads, the scroller clamps the offset, and the bar flickers.
   *
   * So this reads the resolved styles instead. The chrome's own footprint —
   * its header's height plus its negative margin — must be the same number at
   * both ends of the travel, and the pager must be pushed down by exactly what
   * the margin took away.
   */
  const { unmount } = draw({ scrollY: { value: 0 } as SharedValue<number> });
  const open = chromeGeometry();
  unmount();

  draw({ scrollY: { value: COLLAPSE_TRAVEL } as SharedValue<number> });
  const shut = chromeGeometry();

  expect(shut.height, "the header did not collapse").toBeLessThan(open.height);
  expect(open.height + open.margin, "the chrome's footprint moved").toBeCloseTo(
    shut.height + shut.margin,
  );
  expect(open.pagerShift, "the pager did not take back what the margin gave").toBeCloseTo(
    -open.margin,
  );
  expect(shut.pagerShift).toBeCloseTo(-shut.margin);
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
