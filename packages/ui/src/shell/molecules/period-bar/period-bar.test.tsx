/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { PeriodBar } from "./period-bar";

const LABELS = { previous: "Previous month", next: "Next month", search: "Search" };

function draw(props: Partial<Parameters<typeof PeriodBar>[0]> = {}) {
  const onSearch = props.onSearch ?? vi.fn();
  const view = render(
    <ThemeProvider theme={light}>
      <PeriodBar
        label="September"
        figure="−4 320,18 zł"
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onSearch={onSearch}
        labels={LABELS}
        {...props}
      />
    </ThemeProvider>,
  );
  return { ...view, onSearch };
}

it("announces the period as the heading, before any figure in it", () => {
  draw();
  expect(screen.getByRole("heading", { name: "September" })).toBeTruthy();
});

it("names the unit the arrows step, since the label only says it to the eye", () => {
  // `September` steps months and `2026` steps years; a reader who cannot see
  // the label would otherwise hear two unlabelled chevrons.
  draw({ labels: { ...LABELS, previous: "Previous year", next: "Next year" }, label: "2026" });
  expect(screen.getByRole("button", { name: "Previous year" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Next year" })).toBeTruthy();
});

it("disables an arrow the ledger cannot follow, rather than hiding it", () => {
  // A control that vanishes at the edge moves everything beside it; a disabled
  // one says the edge is there.
  draw({ onNext: undefined });
  const next = screen.getByRole("button", { name: "Next month" });
  expect(next.getAttribute("aria-disabled")).toBe("true");
});

it("carries the figure for whatever period is showing", () => {
  draw({ figure: "−28 140,60 zł" });
  expect(screen.getByText("−28 140,60 zł")).toBeTruthy();
});

it("holds no copy of its own", () => {
  draw({ label: "wrzesień", labels: { ...LABELS, search: "Szukaj" } });
  expect(screen.getByRole("heading", { name: "wrzesień" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Szukaj" })).toBeTruthy();
});
