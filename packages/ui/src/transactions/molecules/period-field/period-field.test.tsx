/** @vitest-environment jsdom */

import { fireEvent, render } from "@testing-library/react";
import { accountingDate } from "@waltning/core/date";
import { expect, it, vi } from "vitest";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { PeriodField, presetOf, rangeFor } from "./period-field";

const TODAY = accountingDate("2026-09-03");

function draw(from: string, to: string, onChange = vi.fn()) {
  const view = render(
    <ThemeProvider theme={light}>
      <PeriodField from={from} to={to} today={TODAY} onChange={onChange} />
    </ThemeProvider>,
  );
  return { view, onChange };
}

/** A month is its own two ends, and February in a leap year is the reason to derive it. */
it("resolves each named period to a real range", () => {
  expect(rangeFor("thisMonth", TODAY)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  expect(rangeFor("lastMonth", TODAY)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  expect(rangeFor("last30", TODAY)).toEqual({ from: "2026-08-05", to: "2026-09-03" });
  expect(rangeFor("anyTime", TODAY)).toEqual({ from: "", to: "" });
});

/**
 * **The pick is read from the range, not remembered beside it.** A stepper on
 * the desk rail and a deep link both set the range without touching this
 * component; a stored pick would then light the wrong period over a list
 * showing something else — the defect `ledger-screen.tsx` records for the
 * rail's own label, one control over.
 */
it("reads the current period back out of the range", () => {
  expect(presetOf("2026-09-01", "2026-09-30", TODAY)).toBe("thisMonth");
  expect(presetOf("2026-08-01", "2026-08-31", TODAY)).toBe("lastMonth");
  expect(presetOf("", "", TODAY)).toBe("anyTime");
  expect(presetOf("2026-08-14", "2026-09-02", TODAY), "a range no period names").toBeNull();
});

/** One tap sets both ends — a half-set range is never a period anyone chose. */
it("sets both ends at once", () => {
  const { view, onChange } = draw("", "");
  fireEvent.click(view.getByText("Last month"));
  expect(onChange).toHaveBeenCalledWith("2026-08-01", "2026-08-31");
  view.unmount();
});

/**
 * **The two fields stay reachable, and stay hidden until wanted.** A filter
 * that opens a keyboard on sight is a filter you close — which is how the
 * sheet came to run under one.
 */
it("keeps the exact dates behind a disclosure", () => {
  const closed = draw("2026-09-01", "2026-09-30");
  expect(closed.view.queryByText("From")).toBeNull();
  fireEvent.click(closed.view.getByText("Exact dates"));
  expect(closed.view.getByText("From")).toBeDefined();
  closed.view.unmount();
});

/**
 * But a range no period names has to show itself: it came from somewhere, and
 * a sheet that hid it would be filtering by dates it never displayed.
 */
it("opens the exact dates for a range no period names", () => {
  const { view } = draw("2026-08-14", "2026-09-02");
  expect(view.getByText("From")).toBeDefined();
  view.unmount();
});
