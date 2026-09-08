/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import type { YearMonth } from "@waltning/core/date";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n/provider";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { PeriodPicker } from "./period-picker";

function draw(props: Partial<Parameters<typeof PeriodPicker>[0]> = {}) {
  const onPick = props.onPick ?? vi.fn();
  const onYearChange = props.onYearChange ?? vi.fn();
  const view = render(
    <ThemeProvider theme={light}>
      <I18nProvider locale="en">
        <PeriodPicker
          visible
          year={2026}
          current={"2026-09" as YearMonth}
          horizon={"2026-09" as YearMonth}
          onYearChange={onYearChange}
          onPick={onPick}
          onDismiss={vi.fn()}
          {...props}
        />
      </I18nProvider>
    </ThemeProvider>,
  );
  return { ...view, onPick, onYearChange };
}

it("offers the whole year at once, empty months included", () => {
  // A grid that hid the months with no transactions would change shape as the
  // ledger fills, and "why is March missing" is a worse question than an empty
  // March.
  draw();
  for (const month of ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"]) {
    expect(screen.getByRole("button", { name: month })).toBeTruthy();
  }
});

it("marks the month the pager is on", () => {
  // `react-native-web` drops `accessibilityState.selected`, so without the
  // flat prop this is twelve identical buttons to a screen reader.
  draw();
  expect(screen.getByRole("button", { name: "Sep" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("button", { name: "Aug" }).getAttribute("aria-selected")).toBe("false");
});

it("disables the future rather than hiding it", () => {
  // S04 §6 stops at the end of this month. A control that vanishes at the edge
  // moves everything beside it; a disabled one says the edge is there.
  draw();
  expect(screen.getByRole("button", { name: "Oct" }).getAttribute("aria-disabled")).toBe("true");
  // `react-native-web` omits the attribute rather than writing `"false"`.
  expect(screen.getByRole("button", { name: "Sep" }).getAttribute("aria-disabled")).toBeNull();
});

it("hands back the month as a key, not as its label", () => {
  const { onPick } = draw();
  fireEvent.click(screen.getByRole("button", { name: "Mar" }));
  expect(onPick).toHaveBeenCalledWith("2026-03");
});

it("steps the year without moving the ledger", () => {
  // Looking at 2024 is not choosing a month in it: only a tap on a month is.
  const { onYearChange, onPick } = draw();
  fireEvent.click(screen.getByRole("button", { name: "Previous year" }));
  expect(onYearChange).toHaveBeenCalledWith(2025);
  expect(onPick).not.toHaveBeenCalled();
});

it("opens the whole year once the horizon is past it", () => {
  draw({ year: 2024, current: "2024-03" as YearMonth });
  expect(screen.getByRole("button", { name: "Dec" }).getAttribute("aria-disabled")).toBeNull();
});
