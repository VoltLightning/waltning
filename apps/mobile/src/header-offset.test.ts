import { COLLAPSE_TRAVEL } from "@waltning/ui/shell/molecules/pager-header/collapse";
import { expect, it, vi } from "vitest";

const timing = vi.hoisted(() => vi.fn((to: number) => to));
vi.mock("react-native-reanimated", () => ({ withTiming: timing }));

import { pageArrived, pageReset, pageScrolled } from "./header-offset.ts";

/**
 * Two pages and the one header offset they share, as plain `{ value }` cells:
 * the rules are functions of them and nothing else.
 */
function screen() {
  return {
    header: { value: 0 },
    summary: { showing: { value: true }, own: { value: 0 } },
    list: { showing: { value: false }, own: { value: 0 } },
    reduced: { value: false },
  };
}

it("follows the page on screen, scroll for scroll", () => {
  const s = screen();
  pageScrolled(s.summary.showing, s.summary.own, s.header, 200);
  expect(s.header.value).toBe(200);
  pageScrolled(s.summary.showing, s.summary.own, s.header, 17.5);
  expect(s.header.value).toBe(17.5);
});

it("opens the header when the reader arrives on a page that is at the top", () => {
  // Summary scrolled to 200, then a switch to a List that has never moved: the
  // header must not stay collapsed over a page whose first row is at the top.
  const s = screen();
  pageScrolled(s.summary.showing, s.summary.own, s.header, 200);
  s.summary.showing.value = false;
  s.list.showing.value = true;
  pageArrived(s.list.showing.value, s.list.own, s.header, s.reduced);
  expect(s.header.value).toBe(0);
});

it("hands over the page's own offset on arrival, not the last one scrolled", () => {
  const s = screen();
  pageScrolled(s.list.showing, s.list.own, s.header, 90);
  s.list.showing.value = false;
  s.summary.showing.value = true;
  pageScrolled(s.summary.showing, s.summary.own, s.header, 5);
  s.summary.showing.value = false;
  s.list.showing.value = true;
  pageArrived(true, s.list.own, s.header, s.reduced);
  // 90 is past the travel: the header is as collapsed as it gets.
  expect(s.header.value).toBe(COLLAPSE_TRAVEL);
});

it("ignores a page that is not showing, even when it moves on its own", () => {
  // A prepend or a re-anchor moves a page that nobody is scrolling; the header
  // is not its business, but the page remembers where it now is.
  const s = screen();
  pageScrolled(s.summary.showing, s.summary.own, s.header, 40);
  pageScrolled(s.list.showing, s.list.own, s.header, 500);
  expect(s.header.value).toBe(40);
  expect(s.list.own.value).toBe(500);
});

it("does nothing when a page stops being the one on screen", () => {
  const s = screen();
  pageScrolled(s.summary.showing, s.summary.own, s.header, 60);
  pageArrived(false, s.list.own, s.header, s.reduced);
  expect(s.header.value).toBe(60);
});

it("times from where the header is to where it must be, both within the travel", () => {
  // From far down a long page the header is collapsed; it must start the timing
  // at the collapsed end, not at 200 where nothing visibly moves.
  const s = screen();
  timing.mockClear();
  s.header.value = 5000;
  s.list.own.value = 0;
  let startedAt = Number.NaN;
  timing.mockImplementation((to: number) => {
    startedAt = s.header.value;
    return to;
  });
  pageArrived(true, s.list.own, s.header, s.reduced);
  expect(startedAt).toBe(COLLAPSE_TRAVEL);
  expect(timing).toHaveBeenCalledExactlyOnceWith(0, expect.anything());
});

it("clamps a target past the travel to the travel", () => {
  const s = screen();
  timing.mockClear();
  s.list.own.value = 900;
  pageArrived(true, s.list.own, s.header, s.reduced);
  expect(timing).toHaveBeenCalledExactlyOnceWith(COLLAPSE_TRAVEL, expect.anything());
});

it("never shows a collapsed header over a page that cannot scroll", () => {
  // An empty Summary never reports an offset, so its own is 0 — whatever the
  // page before it left in the header.
  const s = screen();
  s.header.value = 400;
  s.reduced.value = true;
  pageArrived(true, { value: 0 }, s.header, s.reduced);
  expect(s.header.value).toBe(0);
});

it("writes a plain number, and starts no timing, under reduced motion", () => {
  const s = screen();
  timing.mockClear();
  s.reduced.value = true;
  s.header.value = 200;
  s.list.own.value = 12;
  pageArrived(true, s.list.own, s.header, s.reduced);
  expect(s.header.value).toBe(12);
  expect(timing).not.toHaveBeenCalled();
});

it("opens the header when the page on screen is swapped for content that cannot scroll", () => {
  // A List scrolled far down, then the ledger disappears (a reset, a restore):
  // the new content starts at the top and reports nothing, so the header must
  // be handed 0 rather than stay collapsed over it.
  const s = screen();
  s.list.showing.value = true;
  pageScrolled(s.list.showing, s.list.own, s.header, 800);
  s.reduced.value = true;
  pageReset(s.list.showing, s.list.own, s.header, s.reduced);
  expect(s.list.own.value).toBe(0);
  expect(s.header.value).toBe(0);
});

it("does not move the header when a page that is not on screen is swapped", () => {
  const s = screen();
  pageScrolled(s.summary.showing, s.summary.own, s.header, 30);
  s.reduced.value = true;
  pageReset(s.list.showing, s.list.own, s.header, s.reduced);
  expect(s.header.value).toBe(30);
});
