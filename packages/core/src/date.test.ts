/**
 * `AccountingDate` — and the specific way a bare date goes wrong.
 *
 * `CLAUDE.md`: *"Accounting dates are bare `YYYY-MM-DD` strings. No `Date`
 * arithmetic, no timezone conversion on them."* C28 records what happens when
 * that slips: land at 01:00 with the phone still on the old zone and every
 * capture is dated yesterday, permanently.
 */

import { describe, expect, it } from "vitest";
import { accountingDate, isAccountingDate, todayIn } from "./date.ts";

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
