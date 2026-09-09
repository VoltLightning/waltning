/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { Text } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { beforeEach, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { Pager, type PagerPage } from "./pager";

// Counted at render time: a render React threw away still cost the work.
const renders = new Map<string, number>();
function Body({ name }: { name: string }) {
  renders.set(name, (renders.get(name) ?? 0) + 1);
  return <Text>{name} body</Text>;
}

const PAGES: readonly PagerPage[] = [
  { key: "summary", label: "Summary", node: <Body name="summary" /> },
  { key: "list", label: "List", node: <Body name="list" /> },
  { key: "calendar", label: "Calendar", node: <Body name="calendar" /> },
  { key: "months", label: "Months", node: <Body name="months" /> },
];

function tree(activeKey: string, onActiveKeyChange = vi.fn()) {
  return (
    <ThemeProvider theme={light}>
      <Pager
        pages={PAGES}
        activeKey={activeKey}
        onActiveKeyChange={onActiveKeyChange}
        progress={{ value: 0 } as SharedValue<number>}
      />
    </ThemeProvider>
  );
}

beforeEach(() => renders.clear());

it("keeps every page mounted, so a crossing costs no scroll position", () => {
  render(tree("list"));
  // All four bodies exist: swiping to Months and back must not make the List
  // reload its pages, its anchor or where it was.
  expect(screen.getByText("summary body")).toBeTruthy();
  expect(screen.getByText("list body")).toBeTruthy();
  expect(screen.getByText("calendar body")).toBeTruthy();
  expect(screen.getByText("months body")).toBeTruthy();
});

it("re-renders no page body when the current page changes", () => {
  const view = render(tree("list"));
  const before = new Map(renders);

  view.rerender(tree("months"));

  // Mounted is not re-rendered. The bodies are children, reconciled by
  // identity; a crossing moves an offset and touches none of them.
  for (const key of ["summary", "list", "calendar", "months"]) {
    expect(renders.get(key) ?? 0, `${key} re-rendered on a crossing`).toBe(before.get(key) ?? 0);
  }
});

it("hides the pages you are not on from a screen reader", () => {
  // Four mounted pages read as one document otherwise — the whole ledger, the
  // calendar and the year, in sequence.
  render(tree("list"));
  const panels = screen.getAllByRole("tabpanel");
  const exposed = panels.filter((el) => el.getAttribute("aria-hidden") !== "true");
  expect(exposed).toHaveLength(1);
  expect(exposed[0]?.getAttribute("aria-label")).toBe("List");
});

it("falls back to the first page when the key names nothing, mark included", () => {
  // A caller holding a stale key gets the first page. The fallback has to
  // resolve once and be read everywhere: resolving only the scroll offset
  // left no page marked current, so the pager scrolled to page 0 and showed
  // it as though it were not there.
  render(tree("does-not-exist"));
  const exposed = screen
    .getAllByRole("tabpanel")
    .filter((el) => el.getAttribute("aria-hidden") !== "true");
  expect(exposed).toHaveLength(1);
  expect(exposed[0]?.getAttribute("aria-label")).toBe("Summary");
});
