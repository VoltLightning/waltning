/** @vitest-environment jsdom */

import { renderHook } from "@testing-library/react";
import { accountingDate, yearMonth } from "@waltning/core/date";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePagerRoute } from "./use-pager-route.ts";

let params: { view?: string; date?: string; q?: string } = {};
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
  expect(result.current.state).toEqual({ page: "list", date: "2026-05-25", query: null });
});

it("lands somewhere sensible when the URL is nonsense", () => {
  params = { view: "ledger", date: "2026-02-30" };
  const { result } = renderHook(() => usePagerRoute(TODAY));
  expect(result.current.state).toEqual({ page: "summary", date: TODAY, query: null });
});

it("writes the whole state, so a step is linkable the moment it happens", () => {
  params = { view: "list", date: "2026-05-25" };
  const { result } = renderHook(() => usePagerRoute(TODAY));
  result.current.previous();
  expect(setParams).toHaveBeenCalledExactlyOnceWith({ view: "list", date: "2026-04-25", q: "" });
});

it("keeps the date when only the page changes, which is the pager's premise", () => {
  params = { view: "list", date: "2026-05-25" };
  const { result } = renderHook(() => usePagerRoute(TODAY));
  result.current.showPage("calendar");
  expect(setParams).toHaveBeenCalledExactlyOnceWith({
    view: "calendar",
    date: "2026-05-25",
    q: "",
  });
});

it("enters a month at its newest day, through the same rule the pure module holds", () => {
  params = { view: "months", date: "2026-09-08" };
  const { result } = renderHook(() => usePagerRoute(TODAY));
  result.current.showMonth(yearMonth("2026-04"));
  expect(setParams).toHaveBeenCalledExactlyOnceWith({ view: "months", date: "2026-04-30", q: "" });
});

it("steps a year on Months and a month elsewhere, from the route's own page", () => {
  params = { view: "months", date: "2026-09-08" };
  const { result } = renderHook(() => usePagerRoute(TODAY));
  expect(result.current.stepUnit).toBe("year");
  result.current.next();
  expect(setParams).toHaveBeenCalledExactlyOnceWith({ view: "months", date: "2027-09-08", q: "" });
});

it("never pushes — a swipe is not a place you have been", () => {
  // A back button that walked the reader out through every page they had
  // swiped past would be a history of their thumb.
  params = { view: "summary", date: "2026-09-08" };
  const { result } = renderHook(() => usePagerRoute(TODAY));
  result.current.showPage("list");
  expect(setParams).toHaveBeenCalledOnce();
});

/**
 * S04 §7: the search *"holds across the pages the way the date does"*, which
 * is what puts it in the URL rather than in the List page's own state.
 */
it("carries the search in the URL, and keeps it through a page change", () => {
  params = { view: "list", date: "2026-05-25", q: "market" };
  const { result } = renderHook(() => usePagerRoute(TODAY));
  expect(result.current.state.query).toBe("market");
  result.current.showPage("calendar");
  expect(setParams).toHaveBeenCalledExactlyOnceWith({
    view: "calendar",
    date: "2026-05-25",
    q: "market",
  });
});

/**
 * **Cleared as an empty parameter, not as an omission.** `setParams` merges, so
 * a clear that wrote nothing would leave `q=market` in the URL — the field
 * would close and the ledger would stay filtered.
 */
it("clears the search by writing it empty", () => {
  params = { view: "list", date: "2026-05-25", q: "market" };
  const { result } = renderHook(() => usePagerRoute(TODAY));
  result.current.setQuery(null);
  expect(setParams).toHaveBeenCalledExactlyOnceWith({
    view: "list",
    date: "2026-05-25",
    q: "",
  });
});

/**
 * **A scroll does not write the route; the next act carries the day.**
 *
 * `router.setParams` re-renders the whole navigation tree — four commits and
 * ~2,400 component renders per stop, by the render probe's count — and nothing
 * reads the date while the List is on screen except the List, which already
 * knows. S04 §3's promise (*scroll to 25 May on List and Calendar has 25 May
 * marked*) is kept by the swipe that takes you to Calendar, in the same write.
 */
describe("the day the List says it is on", () => {
  it("writes nothing when it is noted", () => {
    params = { view: "list", date: "2026-09-20" };
    const { result } = renderHook(() => usePagerRoute(TODAY));
    result.current.noteDay(accountingDate("2026-05-25"));
    expect(setParams).not.toHaveBeenCalled();
  });

  it("is carried by the page change, in one write", () => {
    params = { view: "list", date: "2026-09-20" };
    const { result } = renderHook(() => usePagerRoute(TODAY));
    result.current.noteDay(accountingDate("2026-05-25"));
    result.current.showPage("calendar");
    expect(setParams).toHaveBeenCalledExactlyOnceWith({
      view: "calendar",
      date: "2026-05-25",
      q: "",
    });
  });

  it("is where a step starts from", () => {
    // Scrolled to May while the route still says September: the stepper goes
    // to April, because that is the month before the one on screen.
    params = { view: "list", date: "2026-09-20" };
    const { result } = renderHook(() => usePagerRoute(TODAY));
    result.current.noteDay(accountingDate("2026-05-25"));
    result.current.previous();
    expect(setParams).toHaveBeenCalledExactlyOnceWith({ view: "list", date: "2026-04-25", q: "" });
  });

  it("is spent by the write that carried it", () => {
    params = { view: "list", date: "2026-09-20" };
    const { result, rerender } = renderHook(() => usePagerRoute(TODAY));
    result.current.noteDay(accountingDate("2026-05-25"));
    result.current.showPage("calendar");
    params = { view: "calendar", date: "2026-05-25" };
    rerender();
    setParams.mockClear();
    // A deliberate day picked on Calendar must not be dragged back to May.
    result.current.showDay(accountingDate("2026-05-27"));
    params = { view: "calendar", date: "2026-05-27" };
    rerender();
    result.current.showPage("list");
    expect(setParams).toHaveBeenLastCalledWith({ view: "list", date: "2026-05-27", q: "" });
  });

  it("is overruled by a deliberate day", () => {
    params = { view: "list", date: "2026-09-20" };
    const { result } = renderHook(() => usePagerRoute(TODAY));
    result.current.noteDay(accountingDate("2026-05-25"));
    result.current.showDay(accountingDate("2026-01-02"));
    expect(setParams).toHaveBeenCalledExactlyOnceWith({ view: "list", date: "2026-01-02", q: "" });
  });
});
