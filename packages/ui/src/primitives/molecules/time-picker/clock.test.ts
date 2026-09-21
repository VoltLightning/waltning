import { timeOfDay } from "@waltning/core/date";
import { describe, expect, it } from "vitest";
import { HOURS, MINUTES, partsOfTime, readTyped, timeOfParts } from "./clock.ts";

describe("a clock time, taken apart and put back", () => {
  it("round-trips, zero-padded", () => {
    expect(partsOfTime(timeOfDay("09:05"))).toEqual({ hour: 9, minute: 5 });
    expect(timeOfParts({ hour: 9, minute: 5 })).toBe("09:05");
    expect(timeOfParts({ hour: 0, minute: 0 })).toBe("00:00");
  });

  it("offers every hour and every minute", () => {
    // Every minute, not steps of five: `Now` lands on 12:47, and a drum that
    // cannot show it would band a row that is not the value.
    expect(HOURS).toHaveLength(24);
    expect(MINUTES).toHaveLength(60);
    expect(MINUTES).toContain("47");
  });
});

describe("what a typed time may become", () => {
  it("reads the ways a hand writes one", () => {
    expect(readTyped("9:05")).toBe("09:05");
    expect(readTyped("0930")).toBe("09:30");
    expect(readTyped("9.30")).toBe("09:30");
    expect(readTyped(" 23:59 ")).toBe("23:59");
  });

  it("refuses what is not a time rather than rounding it into one", () => {
    expect(readTyped("24:00")).toBeNull();
    expect(readTyped("12:60")).toBeNull();
    expect(readTyped("noon")).toBeNull();
    expect(readTyped("")).toBeNull();
    // One digit of minutes is ambiguous — 9:5 is five past or ten to.
    expect(readTyped("9:5")).toBeNull();
  });
});
