/**
 * `fillForward`, and the two bugs that have already happened here.
 *
 * Both were written up as checks under `__checks__/` — scripts that computed
 * the right things, printed `PASS`, exited non-zero on failure, and **were run
 * by nothing**. No vitest pattern matched them, no package script called them,
 * nothing referenced them. A regression guard for a bug that already occurred,
 * sitting one directory away from the code, silent.
 *
 * They are tests now. The logic is theirs; what changed is that the suite runs
 * it.
 */

import { describe, expect, it } from "vitest";
import { fillForward, MAX_CARRY_DAYS } from "./sources.ts";

const DAY_MS = 86_400_000;

/** Days between two bare dates, inclusive, computed in UTC on purpose. */
function daysInclusive(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

describe("date iteration across DST", () => {
  /**
   * The bug: local-time date arithmetic with UTC formatting repeats a date in
   * spring and skips one in autumn. It surfaces only on a range long enough to
   * contain a transition — which is why an 11-day test passed and the 5-year
   * backfill failed on a duplicate key.
   *
   * The suite pins `TZ` to a zone that observes DST (`vitest.config.ts`). Under
   * UTC this test cannot fail, and would have been the second silent guard in
   * the same file.
   */
  const from = "2020-11-25";
  const to = "2026-08-04";

  // Carry is uncapped here on purpose: this exercises date iteration, not carry
  // policy, and the default cap would truncate the range under test.
  const dates = fillForward([{ date: from, rate: "1" }], from, to, Number.POSITIVE_INFINITY).map(
    (r) => r.date,
  );

  it("is running in a timezone that observes DST", () => {
    // Guards the guard. In UTC every assertion below passes for the wrong
    // reason, and the bug this file exists for would sail through.
    const january = new Date("2021-01-15T12:00:00Z").getTimezoneOffset();
    const july = new Date("2021-07-15T12:00:00Z").getTimezoneOffset();
    // The *resolved* zone, not `process.env.TZ`: that is what the Date methods
    // under test actually use, and it is the honest thing to name when this
    // fails. Reading the variable would also make this look like application
    // configuration to the environment-contract test, which it is not.
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(january, `${zone} has no DST transition`).not.toBe(july);
  });

  it("emits one row per day, with no gap", () => {
    expect(dates.length).toBe(daysInclusive(from, to));

    const steps = new Set<number>();
    for (let i = 1; i < dates.length; i++) {
      steps.add(
        (Date.parse(`${dates[i]}T00:00:00Z`) - Date.parse(`${dates[i - 1]}T00:00:00Z`)) / DAY_MS,
      );
    }
    expect([...steps], "every step between consecutive dates").toEqual([1]);
  });

  it("emits no date twice", () => {
    // The failure mode that reached Postgres: a repeated spring date, refused
    // by the primary key after thousands of rows had already been written.
    expect(new Set(dates).size).toBe(dates.length);
  });
});

describe("the carry cap", () => {
  // A weekend gap must fill; a dead source must not. Carrying a stale rate
  // forever converts "we do not know" into a confident wrong number.

  it("fills a weekend and stops at a real quote", () => {
    const weekend = fillForward(
      [
        { date: "2020-11-27", rate: "3.7614" },
        { date: "2020-11-30", rate: "3.7364" },
      ],
      "2020-11-27",
      "2020-11-30",
    );

    expect(weekend.map((w) => (w.carried ? "c" : "q")).join("")).toBe("qccq");
  });

  it("stops carrying a dead source at the cap", () => {
    const filled = fillForward(
      [
        { date: "2022-02-28", rate: "100" },
        { date: "2022-03-01", rate: "105" }, // the last real quote, as with RUB
      ],
      "2022-02-28",
      "2026-08-05",
    );

    expect(filled.filter((r) => r.carried).length).toBe(MAX_CARRY_DAYS);
    // Two quoted days plus the cap, against 1,621 days of range. The rest are
    // skipped rather than invented.
    expect(filled.length).toBe(2 + MAX_CARRY_DAYS);
  });

  it("writes nothing before the first quote", () => {
    // There is no rate to carry backwards from, and inventing one would put a
    // made-up figure under every converted amount in that window.
    const filled = fillForward([{ date: "2022-03-01", rate: "105" }], "2022-02-01", "2022-03-01");
    expect(filled.map((r) => r.date)).toEqual(["2022-03-01"]);
  });
});
