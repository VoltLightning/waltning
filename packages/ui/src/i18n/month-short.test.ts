/**
 * The Months chart labels its twelve columns with `monthShort`, so a locale
 * where two months share a label has an axis that repeats itself. The first
 * spelling used a single initial and Polish collides three ways — `s l m k m c
 * l s w p l g` — which no baseline caught, because the story hard-coded
 * English.
 */

import { yearMonth } from "@waltning/core/date";
import { expect, it } from "vitest";
import { LOCALES, monthShort, monthYearShort } from "./locales.ts";

const MONTHS = Array.from({ length: 12 }, (_, index) =>
  yearMonth(`2026-${String(index + 1).padStart(2, "0")}`),
);

it.each(LOCALES)("names all twelve months differently in %s", (locale) => {
  const labels = MONTHS.map((month) => monthShort(month, locale).slice(0, 3));
  expect(new Set(labels).size, labels.join(" ")).toBe(12);
});

/**
 * The strip's 48pt cell has one caption line. Russian's short months end in a
 * dot and run to four letters, so a month with its year wrapped the cell; the
 * form is three letters, no dot, an apostrophe year — seven characters at most,
 * and never `Mar 26`, which under a day number reads as the date.
 */
it.each(LOCALES)("writes a month and year in seven characters or fewer in %s", (locale) => {
  const labels = MONTHS.map((month) => monthYearShort(month, locale));
  for (const label of labels) {
    expect(label, label).toMatch(/^[^\s.\d]{3}\u00A0\u201926$/u);
  }
  expect(new Set(labels).size, labels.join(" ")).toBe(12);
});
