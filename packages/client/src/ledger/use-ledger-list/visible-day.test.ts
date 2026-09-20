import { describe, expect, it } from "vitest";
import { reanchors, type ViewablePosition, visibleDay } from "./visible-day.ts";

const at = (index: number | undefined, date: string | null): ViewablePosition => ({
  index,
  date,
});

describe("the day a list is on", () => {
  it("is the topmost item, whatever order they arrive in", () => {
    expect(visibleDay([at(4, "2026-05-21"), at(2, "2026-05-25"), at(9, "2026-05-14")])).toBe(
      "2026-05-25",
    );
  });

  /**
   * A row is the commonest thing on screen and carries its own day. The first
   * version of this understood only headers, reported `undefined` for a row,
   * and `accountingDate` threw on it — a render error over the whole screen.
   */
  it("is skipped, not fatal, for an item that names no day", () => {
    expect(visibleDay([at(0, null), at(1, "2026-05-25")]), "a dateless item at the top").toBe(
      "2026-05-25",
    );
  });

  it("is nothing when nothing on screen names a day", () => {
    expect(visibleDay([])).toBeNull();
    expect(visibleDay([at(0, null)])).toBeNull();
    expect(visibleDay([at(undefined, "2026-05-25")]), "an item the list cannot place").toBeNull();
  });
});

describe("when an incoming date re-anchors the list", () => {
  /**
   * The defect this exists to prevent: scrolling reports a day, the screen
   * writes it to the route, and the route hands it back. Taken at face value
   * the list re-keys and scrolls the reader back to where they started —
   * which is the scroll fighting itself.
   */
  it("does not, for a date this list just reported", () => {
    expect(reanchors("2026-05-25", "2026-05-01", "2026-05-25")).toBe(false);
  });

  it("does, for a date chosen somewhere else", () => {
    expect(reanchors("2026-03-04", "2026-05-01", "2026-05-25"), "a pick on Calendar").toBe(true);
  });

  it("does, before this list has reported anything", () => {
    expect(reanchors("2026-03-04", "2026-05-01", null)).toBe(true);
  });

  it("does not, when nothing changed", () => {
    expect(reanchors("2026-05-01", "2026-05-01", null)).toBe(false);
  });

  /**
   * A reader who scrolls away and then taps the very day they had scrolled to,
   * on another page, has chosen it — but the list is already there, so there
   * is nothing to rebuild either way.
   */
  it("does not, for a date the list is already on", () => {
    expect(reanchors("2026-05-25", "2026-05-25", "2026-05-25")).toBe(false);
  });
});
