/**
 * The Months chart labels its twelve columns with `monthShort`, so a locale
 * where two months share a label has an axis that repeats itself. The first
 * spelling used a single initial and Polish collides three ways — `s l m k m c
 * l s w p l g` — which no baseline caught, because the story hard-coded
 * English.
 */

import { yearMonth } from "@waltning/core/date";
import { expect, it } from "vitest";
import { LOCALES, monthShort } from "./locales.ts";

const MONTHS = Array.from({ length: 12 }, (_, index) =>
  yearMonth(`2026-${String(index + 1).padStart(2, "0")}`),
);

it.each(LOCALES)("names all twelve months differently in %s", (locale) => {
  const labels = MONTHS.map((month) => monthShort(month, locale).slice(0, 3));
  expect(new Set(labels).size, labels.join(" ")).toBe(12);
});
