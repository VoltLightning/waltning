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
import { findDate } from "./dates.ts";

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
