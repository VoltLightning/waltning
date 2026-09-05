/**
 * Date parsing — Task 3 of
 * `docs/specification/screens/S05-quick-add.md` §3.
 *
 * `TODAY` is fixed to a Thursday (2026-09-03), computed with `Date.UTC`
 * rather than assumed by eye, so the weekday fixtures below are checked
 * against the same arithmetic the code uses.
 */

import { describe, expect, it } from "vitest";
import { accountingDate } from "../date.ts";
import { findDate, isoDateSpans } from "./dates.ts";

const TODAY = accountingDate("2026-09-03"); // Thursday

describe("today and yesterday, en and pl", () => {
  it("'today'", () => {
    expect(findDate("lunch today", TODAY, "en")?.date).toBe("2026-09-03");
  });

  it("'dziś' / 'dzisiaj'", () => {
    expect(findDate("lunch dziś", TODAY, "pl")?.date).toBe("2026-09-03");
    expect(findDate("lunch dzisiaj", TODAY, "pl")?.date).toBe("2026-09-03");
  });

  it("'yesterday'", () => {
    expect(findDate("coffee yesterday", TODAY, "en")?.date).toBe("2026-09-02");
  });

  it("'wczoraj'", () => {
    expect(findDate("taxi wczoraj", TODAY, "pl")?.date).toBe("2026-09-02");
  });

  it("both languages are checked regardless of locale — a household mixes them", () => {
    expect(findDate("taxi wczoraj", TODAY, "en")?.date).toBe("2026-09-02");
  });
});

describe("absolute dates", () => {
  it("an ISO date", () => {
    const found = findDate("rent 2026-08-01", TODAY, "en");
    expect(found?.date).toBe("2026-08-01");
  });

  it("DD.MM in the current year, when that day has already passed", () => {
    const found = findDate("rent 1.08", TODAY, "en");
    expect(found?.date).toBe("2026-08-01");
  });

  it("DD.MM rolls back a year when the day is still ahead of today", () => {
    // 25.12 is after 2026-09-03, so it must mean last Christmas, not the next one.
    const found = findDate("gift 25.12", TODAY, "en");
    expect(found?.date).toBe("2025-12-25");
  });
});

describe("weekday names — most recent past occurrence, including today", () => {
  it("today's own weekday resolves to today", () => {
    expect(findDate("lunch thursday", TODAY, "en")?.date).toBe("2026-09-03");
    expect(findDate("lunch czwartek", TODAY, "pl")?.date).toBe("2026-09-03");
  });

  it("a weekday earlier this week", () => {
    expect(findDate("lunch monday", TODAY, "en")?.date).toBe("2026-08-31");
    expect(findDate("lunch poniedziałek", TODAY, "pl")?.date).toBe("2026-08-31");
  });

  it("a weekday later in the week means LAST week's occurrence, not next", () => {
    // Friday is one day after Thursday — the most recent Friday is 6 days back.
    expect(findDate("lunch friday", TODAY, "en")?.date).toBe("2026-08-28");
  });
});

describe("no date found", () => {
  it("falls through to null when nothing matches", () => {
    expect(findDate("coffee 18 cash", TODAY, "en")).toBeNull();
  });
});

/**
 * L-b/L-c — the calendar, on both readers, through the one function
 * `zod.ts#zAccountingDate` uses (`date.ts#isRealCalendarDate`).
 *
 * The old `try`/`catch` here claimed to catch "month 13, day 32" and caught
 * nothing: `accountingDate` is shape-only by design, so `2026-02-31` bound as
 * a date and was refused two layers later, on save, in English, by Zod. What
 * the comment described is now what the code does.
 */
describe("L-b — a date-shaped token that names no real day is not a date", () => {
  it.each(["2026-02-31", "2026-02-30", "2026-13-01", "2026-00-01", "2023-02-29", "9999-99-99"])(
    "%s does not bind",
    (bad) => {
      expect(findDate(`coffee ${bad}`, TODAY, "en")).toBeNull();
    },
  );

  it("a real date beside it still binds — including a genuine leap day", () => {
    expect(findDate("coffee 2024-02-29", TODAY, "en")?.date).toBe("2024-02-29");
    expect(findDate("coffee 2026-08-10", TODAY, "en")?.date).toBe("2026-08-10");
  });

  it("DD.MM is held to the same calendar — 31.04 is not a day", () => {
    // The 1–31 range check alone let April 31st through, and `accountingDate`
    // was never going to catch it.
    expect(findDate("gift 31.04", TODAY, "en")).toBeNull();
    expect(findDate("gift 30.04", TODAY, "en")?.date).toBe("2026-04-30");
  });
});

describe("isoDateSpans — every shaped token, and whether it is a real day", () => {
  it("reports the span and the calendar answer, so findAmount can skip and grammar can refuse", () => {
    expect(isoDateSpans("2026-08-10 48.90 cash")).toEqual([{ span: [0, 10], real: true }]);
    expect(isoDateSpans("48.90 cash 2026-02-31")).toEqual([{ span: [11, 21], real: false }]);
  });

  it("an unreal day is still a span — its digits are never the money on the line", () => {
    const spans = isoDateSpans("2026-02-31 2026-08-10");
    expect(spans.map((candidate) => candidate.real)).toEqual([false, true]);
  });

  it("no date-shaped token, no spans", () => {
    expect(isoDateSpans("48.90 cash coffee")).toEqual([]);
  });
});
