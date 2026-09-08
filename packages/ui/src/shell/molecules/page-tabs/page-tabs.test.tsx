/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { type PageTab, PageTabs } from "./page-tabs";

// Count what renders rather than trusting `memo`, which the reconciler may
// ignore and which stops working the moment a parent hands down a fresh arrow.
const renders = new Map<string, number>();
vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native")>();
  return actual;
});

const TABS: readonly PageTab[] = [
  { key: "summary", label: "Summary" },
  { key: "list", label: "List" },
  { key: "calendar", label: "Calendar" },
  { key: "months", label: "Months" },
];

function draw(props: Partial<Parameters<typeof PageTabs>[0]> = {}) {
  const onSelect = props.onSelect ?? vi.fn();
  const view = render(
    <ThemeProvider theme={light}>
      <PageTabs tabs={TABS} activeKey="list" onSelect={onSelect} {...props} />
    </ThemeProvider>,
  );
  return { ...view, onSelect };
}

beforeEach(() => renders.clear());

it("draws every page as a tab, so the swipe has something to say it exists", () => {
  draw();
  expect(screen.getAllByRole("tab")).toHaveLength(4);
  expect(screen.getByRole("tablist")).toBeTruthy();
});

it("marks exactly one tab selected", () => {
  draw();
  const selected = screen
    .getAllByRole("tab")
    .filter((el) => el.getAttribute("aria-selected") === "true");
  expect(selected).toHaveLength(1);
  expect(selected[0]?.textContent).toContain("List");
});

it("reports the page's key, never its position", () => {
  // A tab that answered with an index would break the moment a page is
  // inserted, and would do it silently — the wrong page would simply open.
  const { onSelect } = draw();
  screen.getByRole("tab", { name: /Calendar/ }).click();
  expect(onSelect).toHaveBeenCalledExactlyOnceWith("calendar");
});

it("holds no copy of its own", () => {
  // Labels arrive localised. A component that formatted its own would need
  // `useT()` and would be untestable without a language.
  draw({ tabs: [{ key: "list", label: "Lista" }], activeKey: "list" });
  expect(screen.getByRole("tab", { name: "Lista" })).toBeTruthy();
});
