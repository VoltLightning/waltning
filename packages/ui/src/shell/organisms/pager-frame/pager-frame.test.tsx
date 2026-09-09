/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { Text } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
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

it("exposes only the page you are on, with all four mounted", () => {
  draw();
  expect(screen.getByText("months body")).toBeTruthy();
  const exposed = screen
    .getAllByRole("tabpanel")
    .filter((el) => el.getAttribute("aria-hidden") !== "true");
  expect(exposed).toHaveLength(1);
  expect(exposed[0]?.getAttribute("aria-label")).toBe("List");
});
