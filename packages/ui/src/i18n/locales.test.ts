/**
 * The date formatters, which are pure functions over bare accounting dates.
 *
 * `i18n.test.tsx` covers the catalogues and the plural resolver; this covers
 * the half of `locales.ts` that turns a `YYYY-MM-DD` into words, where the
 * failures are silent — a date that renders as the day before, or a range that
 * says the same month twice.
 */

import { accountingDate } from "@waltning/core/date";
import { afterEach, expect, it } from "vitest";
import { dayRangeLabel } from "./locales.ts";

/** Set by the one test that takes an `Intl` method away; run whatever happens. */
let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

/**
 * S04 §6's quiet run. The row exists to say *nothing happened*, and it said it
 * as `September 7, 2026 – September 8, 2026` over `2 days · nothing recorded` —
 * two lines on a 390pt phone, with the month and the year spelled twice.
 */
it("collapses what the two ends of a range share", () => {
  expect(dayRangeLabel(accountingDate("2026-09-07"), accountingDate("2026-09-08"), "en")).toBe(
    "September 7\u2009–\u20098, 2026",
  );
});

it("keeps the parts the ends do not share", () => {
  expect(dayRangeLabel(accountingDate("2026-08-28"), accountingDate("2026-09-02"), "en")).toBe(
    "August 28\u2009–\u2009September 2, 2026",
  );
  expect(dayRangeLabel(accountingDate("2025-12-30"), accountingDate("2026-01-02"), "en")).toBe(
    "December 30, 2025\u2009–\u2009January 2, 2026",
  );
});

/**
 * **Which half of the phrase the shared part lives in is the language's
 * business.** English keeps the month in front of both days and Polish behind
 * them, which is why this is `Intl`'s job and not a template string.
 */
it("collapses a Polish range the Polish way", () => {
  expect(dayRangeLabel(accountingDate("2026-09-07"), accountingDate("2026-09-08"), "pl")).toBe(
    "7–8 września 2026",
  );
});

/**
 * A bare accounting date must never be re-read in the reader's own zone — the
 * suite runs in `Europe/Warsaw`, and a negative offset is what turns the 1st
 * into the 31st.
 */
it("names the days it was given, never the days before them", () => {
  expect(dayRangeLabel(accountingDate("2026-03-01"), accountingDate("2026-03-02"), "en")).toBe(
    "March 1\u2009–\u20092, 2026",
  );
});

/**
 * **Hermes builds its `Intl` per platform and ships a subset**, so the range
 * formatter may simply not be there. Both dates in full is longer and never
 * wrong, which is the behaviour this row already had.
 */
it("names both dates in full where the runtime has no range formatter", () => {
  // The prototype, which is where a runtime that has it puts it, and where one
  // that does not simply has nothing.
  const prototype = Intl.DateTimeFormat.prototype as { formatRange?: unknown };
  const real = prototype.formatRange;
  delete prototype.formatRange;
  cleanup = () => {
    prototype.formatRange = real;
  };

  expect(dayRangeLabel(accountingDate("2026-09-07"), accountingDate("2026-09-08"), "en")).toBe(
    "September 7, 2026\u2009–\u2009September 8, 2026",
  );
});

/**
 * **The ends may arrive in either order.** S04's quiet run holds its span
 * newest-end-first, because the list it sits in runs that way, and a range is
 * read earliest-first in both languages this app ships. A parameter order
 * nobody can see in the output is one somebody will get backwards.
 */
it("reads earliest-first whichever way round it was handed the ends", () => {
  const forwards = dayRangeLabel(accountingDate("2026-09-07"), accountingDate("2026-09-08"), "en");
  const backwards = dayRangeLabel(accountingDate("2026-09-08"), accountingDate("2026-09-07"), "en");
  expect(backwards).toBe(forwards);
});
