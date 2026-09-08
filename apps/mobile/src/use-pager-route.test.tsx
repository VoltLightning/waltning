/** @vitest-environment jsdom */

import { renderHook } from "@testing-library/react";
import { accountingDate, yearMonth } from "@waltning/core/date";
import { beforeEach, expect, it, vi } from "vitest";
import { usePagerRoute } from "./use-pager-route.ts";

let params: { view?: string; date?: string } = {};
const setParams = vi.fn();

vi.mock("expo-router", () => ({
  get router() {
    return { setParams };
  },
  useLocalSearchParams: () => params,
}));

const TODAY = accountingDate("2026-09-08");

beforeEach(() => {
  params = {};
  setParams.mockClear();
});

it("reads the page and the day out of the URL", () => {
  // The link the agent hands you: S03's "see them in the ledger".
  params = { view: "list", date: "2026-05-25" };
  const { result } = renderHook(() => usePagerRoute(TODAY));
  expect(result.current.state).toEqual({ page: "list", date: "2026-05-25" });
});

it("lands somewhere sensible when the URL is nonsense", () => {
  params = { view: "ledger", date: "2026-02-30" };
  const { result } = renderHook(() => usePagerRoute(TODAY));
  expect(result.current.state).toEqual({ page: "summary", date: TODAY });
});

it("writes the whole state, so a step is linkable the moment it happens", () => {
  params = { view: "list", date: "2026-05-25" };
  const { result } = renderHook(() => usePagerRoute(TODAY));
  result.current.previous();
  expect(setParams).toHaveBeenCalledExactlyOnceWith({ view: "list", date: "2026-04-25" });
});

it("keeps the date when only the page changes, which is the pager's premise", () => {
  params = { view: "list", date: "2026-05-25" };
  const { result } = renderHook(() => usePagerRoute(TODAY));
  result.current.showPage("calendar");
  expect(setParams).toHaveBeenCalledExactlyOnceWith({ view: "calendar", date: "2026-05-25" });
});

it("enters a month at its newest day, through the same rule the pure module holds", () => {
  params = { view: "months", date: "2026-09-08" };
  const { result } = renderHook(() => usePagerRoute(TODAY));
  result.current.showMonth(yearMonth("2026-04"));
  expect(setParams).toHaveBeenCalledExactlyOnceWith({ view: "months", date: "2026-04-30" });
});

it("steps a year on Months and a month elsewhere, from the route's own page", () => {
  params = { view: "months", date: "2026-09-08" };
  const { result } = renderHook(() => usePagerRoute(TODAY));
  expect(result.current.stepUnit).toBe("year");
  result.current.next();
  expect(setParams).toHaveBeenCalledExactlyOnceWith({ view: "months", date: "2027-09-08" });
});

it("never pushes — a swipe is not a place you have been", () => {
  // A back button that walked the reader out through every page they had
  // swiped past would be a history of their thumb.
  params = { view: "summary", date: "2026-09-08" };
  const { result } = renderHook(() => usePagerRoute(TODAY));
  result.current.showPage("list");
  expect(setParams).toHaveBeenCalledOnce();
});
