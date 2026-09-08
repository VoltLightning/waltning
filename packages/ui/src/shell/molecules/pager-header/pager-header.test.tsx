/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import type { SharedValue } from "react-native-reanimated";
import { expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { PagerHeader } from "./pager-header";

const LABELS = {
  previous: "Previous month",
  next: "Next month",
  search: "Search",
  pickPeriod: "Choose a month",
};

function draw(props: Partial<Parameters<typeof PagerHeader>[0]> = {}) {
  const onPickPeriod = props.onPickPeriod ?? vi.fn();
  const onSearch = props.onSearch ?? vi.fn();
  const view = render(
    <ThemeProvider theme={light}>
      <PagerHeader
        label="September"
        detail="2026"
        onPickPeriod={onPickPeriod}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onSearch={onSearch}
        scrollY={{ value: 0 } as SharedValue<number>}
        labels={LABELS}
        {...props}
      />
    </ThemeProvider>,
  );
  return { ...view, onPickPeriod, onSearch };
}

it("announces the period once, not once per layout", () => {
  // Both layouts carry the month; only the live one is in the tree. Without
  // the `aria-hidden` pair — which `react-native-web` does not derive from the
  // native props — a reader hears "September" twice on every screen.
  draw();
  expect(screen.getAllByRole("heading", { name: "September" })).toHaveLength(1);
});

it("makes the title the picker, since there is no separate button for it", () => {
  // At the top of a screen the answer to "somewhere else" is usually not "one
  // step", so the affordance is the month itself.
  draw();
  expect(screen.getByRole("button", { name: "Choose a month" })).toBeTruthy();
});

it("offers no stepper at rest", () => {
  // The arrows arrive with the reason for them: while the month's own summary
  // is on screen, stepping is not what the header is for.
  draw();
  expect(screen.queryByRole("button", { name: "Previous month" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Next month" })).toBeNull();
});

it("keeps search reachable in the layout that is showing", () => {
  draw();
  expect(screen.getAllByRole("button", { name: "Search" })).toHaveLength(1);
});

it("carries no figure — the header navigates and the page reports", () => {
  // An earlier draft put the period's total in the trailing half. Rendered, it
  // was a number with no label beside a magnifier, while the card below said
  // the same month as three labelled figures with their currency.
  //
  // The year is a number and stays: it names the period, which is what this
  // row is for. What is banned is an *amount* — anything with a decimal part.
  draw();
  expect(screen.queryByText(/[.,]\d{2}/)).toBeNull();
});

it("drops the caption where the label already says everything", () => {
  // Months steps years, and `2026` under `2026` is the year twice.
  draw({ label: "2026", detail: null });
  expect(screen.getAllByRole("heading", { name: "2026" })).toHaveLength(1);
});

it("holds no copy of its own", () => {
  draw({
    label: "wrzesień",
    labels: { ...LABELS, search: "Szukaj", pickPeriod: "Wybierz miesiąc" },
  });
  expect(screen.getByRole("heading", { name: "wrzesień" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Szukaj" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Wybierz miesiąc" })).toBeTruthy();
});
