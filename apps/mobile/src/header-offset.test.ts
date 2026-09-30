import { expect, it } from "vitest";
import { pageArrived, pageScrolled } from "./header-offset.ts";

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
  expect(s.header.value).toBe(90);
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

it("hands over at once under reduced motion", () => {
  const s = screen();
  s.reduced.value = true;
  s.header.value = 200;
  s.list.own.value = 12;
  pageArrived(true, s.list.own, s.header, s.reduced);
  expect(s.header.value).toBe(12);
});
