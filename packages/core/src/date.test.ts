/**
 * `AccountingDate` — and the specific way a bare date goes wrong.
 *
 * `CLAUDE.md`: *"Accounting dates are bare `YYYY-MM-DD` strings. No `Date`
 * arithmetic, no timezone conversion on them."* C28 records what happens when
 * that slips: land at 01:00 with the phone still on the old zone and every
 * capture is dated yesterday, permanently.
 */

import { describe, expect, it } from "vitest";
import {
  accountingDate,
  addDays,
  daysBetween,
  isAccountingDate,
  shiftMonth,
  todayAtOffset,
  todayIn,
  yearMonth,
} from "./date.ts";

describe("what a bare date is not", () => {
  it("refuses an ISO timestamp", () => {
    // The mistake this type exists for: `new Date().toISOString()` is a string,
    // so it used to compile straight into a `date` column.
    expect(() => accountingDate("2026-03-12T22:00:00.000Z")).toThrow(/bare accounting date/);
  });

  it("refuses a date that is nearly right", () => {
    expect(() => accountingDate("2026-3-12")).toThrow();
    expect(() => accountingDate("12/03/2026")).toThrow();
    expect(() => accountingDate("")).toThrow();
  });

  it("accepts a bare date", () => {
    expect(accountingDate("2026-03-12")).toBe("2026-03-12");
    expect(isAccountingDate("2026-03-12")).toBe(true);
    expect(isAccountingDate("2026-03-12T00:00:00Z")).toBe(false);
  });
});

describe("today is a local calendar day, not a UTC instant", () => {
  /**
   * **The C28 failure, reproduced.** Warsaw is UTC+1 in March, so 23:30 UTC on
   * the 12th is 00:30 on the **13th** there. `toISOString().slice(0, 10)` says
   * the 12th — the previous day — for every capture made after local midnight.
   *
   * The first version of this test used 22:00 and asserted the 13th, which is
   * simply wrong: 22:00 UTC is 23:00 in Warsaw and still the 12th. The
   * assertion caught the arithmetic rather than the code, which is the right
   * way round for a test about a date being off by one.
   */
  it("differs from the UTC day when the zone is ahead", () => {
    const justAfterLocalMidnight = new Date("2026-03-12T23:30:00.000Z");

    expect(todayIn("Europe/Warsaw", justAfterLocalMidnight)).toBe("2026-03-13");
    expect(justAfterLocalMidnight.toISOString().slice(0, 10), "the naive answer, a day early").toBe(
      "2026-03-12",
    );
  });

  /** And behind, which is the same bug in the other direction. */
  it("differs when the zone is behind", () => {
    const at0200Utc = new Date("2026-03-12T02:00:00.000Z");

    expect(todayIn("America/New_York", at0200Utc)).toBe("2026-03-11");
    expect(at0200Utc.toISOString().slice(0, 10)).toBe("2026-03-12");
  });

  it("returns something the type accepts", () => {
    expect(isAccountingDate(todayIn("UTC"))).toBe(true);
  });
});

describe("todayAtOffset — L1's fixed-offset twin of todayIn, no tz database", () => {
  /**
   * The same C28 shape `todayIn` above proves, reconstructed from a stored
   * offset instead of a zone name — the reconstruction `write.ts#captureDate`
   * uses for replay, which must not depend on the tz database's *current*
   * rules for a zone answering what an *earlier* instant meant.
   */
  it("differs from the UTC day when the offset is ahead", () => {
    const justAfterLocalMidnight = new Date("2026-03-12T23:30:00.000Z");
    // Warsaw, +60 — the same instant `todayIn("Europe/Warsaw", …)` reads.
    expect(todayAtOffset(justAfterLocalMidnight, 60)).toBe("2026-03-13");
  });

  it("differs when the offset is behind", () => {
    const at0200Utc = new Date("2026-03-12T02:00:00.000Z");
    // New York, -300 (EST, before its own DST start) — the same instant
    // `todayIn("America/New_York", …)` reads.
    expect(todayAtOffset(at0200Utc, -300)).toBe("2026-03-11");
  });

  it("agrees with todayIn for the zone whose current offset it is given", () => {
    const at = new Date("2026-07-15T21:00:00.000Z");
    // Warsaw is +120 in July (CEST) — the offset a live capture would record.
    expect(todayAtOffset(at, 120)).toBe(todayIn("Europe/Warsaw", at));
  });

  it("a zero offset is UTC's own calendar day", () => {
    expect(todayAtOffset(new Date("2026-03-12T23:30:00.000Z"), 0)).toBe("2026-03-12");
  });
});

describe("addDays — calendar arithmetic, no clock", () => {
  it("adds within a month", () => {
    expect(addDays(accountingDate("2026-03-12"), 1)).toBe("2026-03-13");
  });

  it("subtracts for a negative n — this is how 'yesterday' is computed", () => {
    expect(addDays(accountingDate("2026-03-12"), -1)).toBe("2026-03-11");
  });

  it("carries across a month boundary", () => {
    expect(addDays(accountingDate("2026-03-31"), 1)).toBe("2026-04-01");
  });

  it("carries across a year boundary", () => {
    expect(addDays(accountingDate("2026-12-31"), 1)).toBe("2027-01-01");
    expect(addDays(accountingDate("2027-01-01"), -1)).toBe("2026-12-31");
  });

  it("n = 0 is the identity", () => {
    expect(addDays(accountingDate("2026-03-12"), 0)).toBe("2026-03-12");
  });
});

describe("daysBetween — calendar arithmetic, no clock", () => {
  it("is 0 for the same date", () => {
    expect(daysBetween(accountingDate("2026-03-12"), accountingDate("2026-03-12"))).toBe(0);
  });

  it("is positive when b is later, negative when it is earlier", () => {
    expect(daysBetween(accountingDate("2026-03-12"), accountingDate("2026-03-15"))).toBe(3);
    expect(daysBetween(accountingDate("2026-03-15"), accountingDate("2026-03-12"))).toBe(-3);
  });

  it("crosses a month and a year boundary", () => {
    expect(daysBetween(accountingDate("2026-02-27"), accountingDate("2026-03-02"))).toBe(3);
    expect(daysBetween(accountingDate("2026-12-30"), accountingDate("2027-01-02"))).toBe(3);
  });

  it("is addDays's inverse", () => {
    const start = accountingDate("2026-06-15");
    expect(daysBetween(start, addDays(start, 47))).toBe(47);
  });
});

describe("what a bare year-month is not", () => {
  it("refuses a day", () => {
    expect(() => yearMonth("2026-03-12")).toThrow(/bare year-month/);
  });

  it("refuses a month outside 1–12", () => {
    expect(() => yearMonth("2026-00")).toThrow(/calendar month/);
    expect(() => yearMonth("2026-13")).toThrow(/calendar month/);
  });

  it("accepts a bare year-month", () => {
    expect(yearMonth("2026-03")).toBe("2026-03");
  });
});

describe("shiftMonth — calendar arithmetic, no clock", () => {
  it("steps within a year", () => {
    expect(shiftMonth(yearMonth("2026-08"), 1)).toBe("2026-09");
    expect(shiftMonth(yearMonth("2026-08"), -1)).toBe("2026-07");
  });

  it("carries across a year boundary, forward and back", () => {
    expect(shiftMonth(yearMonth("2026-12"), 1)).toBe("2027-01");
    expect(shiftMonth(yearMonth("2027-01"), -1)).toBe("2026-12");
  });

  it("n = 0 is the identity", () => {
    expect(shiftMonth(yearMonth("2026-08"), 0)).toBe("2026-08");
  });

  /** The day-fixed-at-1 decision: a month with no 31st is never asked to have one. */
  it("does not care that January has 31 days and February does not", () => {
    expect(shiftMonth(yearMonth("2026-01"), 1)).toBe("2026-02");
  });
});
