import { describe, expect, it } from "vitest";
import { clockIn, isTimeOfDay, timeOfDay, timeOfDayFromDb } from "./date.ts";

describe("a bare clock time", () => {
  it("takes every minute of a 24-hour day", () => {
    for (const value of ["00:00", "09:05", "13:59", "23:59"]) {
      expect(timeOfDay(value), value).toBe(value);
    }
  });

  it("refuses what is not one", () => {
    for (const value of ["24:00", "23:60", "9:05", "09:5", "", "09:05:00", "2026-09-18T09:05"]) {
      expect(() => timeOfDay(value), value).toThrow(/not a bare time of day/);
    }
  });

  /**
   * The mistake this type exists for: a timestamp sliced into looking like a
   * time. `isTimeOfDay` is the non-throwing boundary check, and it must not be
   * fooled by a longer string that merely starts right.
   */
  it("is not fooled by a timestamp that starts with one", () => {
    expect(isTimeOfDay("09:05")).toBe(true);
    expect(isTimeOfDay("09:05:30"), "seconds are a different shape").toBe(false);
    expect(isTimeOfDay("09:05Z")).toBe(false);
  });
});

describe("what the database hands back", () => {
  it("narrows Postgres's HH:MM:SS to the minute it stored", () => {
    expect(timeOfDayFromDb("14:20:00")).toBe("14:20");
  });

  /** A column that has never held anything, which is the normal case. */
  it("passes a null through as a null, not as midnight", () => {
    expect(timeOfDayFromDb(null)).toBeNull();
  });

  it("throws on a shape that is neither", () => {
    expect(() => timeOfDayFromDb("2026-09-18 14:20:00")).toThrow(/not a bare time of day/);
  });
});

describe("the clock in a named zone", () => {
  // 2026-03-12T23:30Z — the instant `todayIn`'s own tests use, for the same
  // reason: it is a different day, and a different hour, depending on where
  // the person holding the phone is standing.
  const at = new Date("2026-03-12T23:30:00Z");

  it("is the wall clock there, not UTC's", () => {
    expect(clockIn("Europe/Warsaw", at)).toBe("00:30");
    expect(clockIn("America/New_York", at)).toBe("19:30");
    expect(clockIn("UTC", at)).toBe("23:30");
  });

  it("says midnight as 00:00, never 24:00", () => {
    // `en-GB` without `hourCycle: "h23"` is free to render 24:00, which
    // `timeOfDay` refuses — and the refusal would land on a tap of *Now*.
    expect(clockIn("UTC", new Date("2026-03-12T00:00:00Z"))).toBe("00:00");
  });
});
