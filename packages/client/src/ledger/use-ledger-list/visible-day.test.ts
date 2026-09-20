import { describe, expect, it } from "vitest";
import { reanchors, type ViewableItem, visibleDay } from "./visible-day.ts";

const day = (index: number, date: string): ViewableItem => ({
  index,
  item: { kind: "day", date },
});
const quiet = (index: number, from: string): ViewableItem => ({
  index,
  item: { kind: "quiet", from },
});

describe("the day a list is on", () => {
  it("is the topmost item, whatever order they arrive in", () => {
    expect(visibleDay([day(4, "2026-05-21"), day(2, "2026-05-25"), day(9, "2026-05-14")])).toBe(
      "2026-05-25",
    );
  });

  it("is the first day of a quiet run, not its last", () => {
    expect(visibleDay([quiet(1, "2026-05-03"), day(5, "2026-04-28")])).toBe("2026-05-03");
  });

  it("is nothing when nothing is on screen", () => {
    expect(visibleDay([])).toBeNull();
    expect(visibleDay([{ index: null, item: { kind: "day", date: "2026-05-25" } }])).toBeNull();
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
