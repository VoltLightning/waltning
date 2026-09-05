/**
 * Relative and absolute dates in the capture grammar.
 *
 * No `Date` arithmetic on the accounting date itself — `date.ts#addDays` is
 * the one primitive this file uses to move a date, and it is exactly as
 * timezone-independent as this module needs (see its own comment). Weekday
 * lookup below uses `Date.UTC` the same way: on the date's own Y/M/D, never
 * on a clock, so it carries none of `todayIn`'s hazard.
 */

import { type AccountingDate, accountingDate, addDays } from "../date.ts";
import { fold } from "./names.ts";

export type DateMatch = { date: AccountingDate; span: [number, number] };

const TODAY_WORDS = ["today", "dzis", "dzisiaj"];
const YESTERDAY_WORDS = ["yesterday", "wczoraj"];

/** Weekday index, Sunday = 0 — matches `Date#getUTCDay()`. English and Polish names, folded (§ names.ts). */
const WEEKDAYS: readonly { word: string; index: number }[] = [
  { word: "sunday", index: 0 },
  { word: "niedziela", index: 0 },
  { word: "monday", index: 1 },
  { word: "poniedzialek", index: 1 },
  { word: "tuesday", index: 2 },
  { word: "wtorek", index: 2 },
  { word: "wednesday", index: 3 },
  { word: "sroda", index: 3 },
  { word: "thursday", index: 4 },
  { word: "czwartek", index: 4 },
  { word: "friday", index: 5 },
  { word: "piatek", index: 5 },
  { word: "saturday", index: 6 },
  { word: "sobota", index: 6 },
];

const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
/** The same shape, global — `isoDateSpans` scans, `ISO_DATE` claims the first. */
const ISO_DATE_ALL = /\b\d{4}-\d{2}-\d{2}\b/g;
const DAY_MONTH = /\b(\d{1,2})\.(\d{1,2})\b/;

/** The weekday a bare date falls on — pure calendar math on its own Y/M/D, never a clock read. */
function weekdayOf(date: AccountingDate): number {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * `locale` is part of the signature `CaptureContext` carries through the
 * grammar, but Task 3's rule checks English and Polish words unconditionally
 * — a household mixes languages, the same reason `Cash`'s alias `gotówka`
 * binds regardless of `locale`. It stays a parameter, unused for now, as the
 * seam a future locale-specific rule (e.g. day/month order) would need.
 */
export function findDate(
  text: string,
  today: AccountingDate,
  _locale: "en" | "pl",
): DateMatch | null {
  const iso = ISO_DATE.exec(text);
  if (iso) {
    const [full, y, m, d] = iso;
    if (full !== undefined && y !== undefined && m !== undefined && d !== undefined) {
      try {
        const date = accountingDate(`${y}-${m}-${d}`);
        return { date, span: [iso.index, iso.index + full.length] };
      } catch {
        // Not a real calendar date (month 13, day 32, …) — fall through to
        // the other tokens rather than throwing on a string that merely
        // looks like a date.
      }
    }
  }

  const dayMonth = DAY_MONTH.exec(text);
  if (dayMonth) {
    const [full, dd, mm] = dayMonth;
    if (full !== undefined && dd !== undefined && mm !== undefined) {
      const day = Number(dd);
      const month = Number(mm);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const year = Number(today.slice(0, 4));
        const thisYear = `${year}-${pad2(month)}-${pad2(day)}`;
        // "Current year; if in the future, last year" (Task 3). ISO strings
        // compare lexicographically the same as calendar order.
        const candidate = thisYear > today ? `${year - 1}-${pad2(month)}-${pad2(day)}` : thisYear;
        return {
          date: accountingDate(candidate),
          span: [dayMonth.index, dayMonth.index + full.length],
        };
      }
    }
  }

  const tokenPattern = /\S+/g;
  let tok: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: the idiomatic `exec` loop.
  while ((tok = tokenPattern.exec(text))) {
    const word = fold(tok[0]);
    const span: [number, number] = [tok.index, tok.index + tok[0].length];

    if (TODAY_WORDS.includes(word)) {
      return { date: today, span };
    }
    if (YESTERDAY_WORDS.includes(word)) {
      return { date: addDays(today, -1), span };
    }
    const weekday = WEEKDAYS.find((w) => w.word === word);
    if (weekday) {
      // Most recent past occurrence, including today.
      const diff = (weekdayOf(today) - weekday.index + 7) % 7;
      return { date: addDays(today, -diff), span };
    }
  }

  return null;
}

/**
 * L2 — every `YYYY-MM-DD` token in the text, as spans.
 *
 * `findAmount` runs before this module does (`grammar.ts` resolves the amount
 * first), and a leading ISO date offers it a four-digit number: `2026-08-10
 * 48.90 cash coffee` bound `2026` as the amount, the date span then overlapped
 * a claim already made, and the line silently landed on *today* for `2026 PLN`.
 * The amount scanner skips these spans instead, so the first number left is
 * the one a person typed as money.
 *
 * **Exactly what `findDate` above would claim, by making the same call.** The
 * two must never disagree about which token is a date: a span `findAmount`
 * skipped and `findDate` then refused would lose the line its amount for
 * nothing, and a span `findAmount` ate would lose it the date. `accountingDate`
 * is a *shape* check (its own doc — calendar validity belongs to
 * `zod.ts#zAccountingDate`, at the contract edge), so `9999-99-99` is a date to
 * both of them and a date to neither on save.
 */
export function isoDateSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  ISO_DATE_ALL.lastIndex = 0;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: the idiomatic `exec` loop.
  while ((match = ISO_DATE_ALL.exec(text))) {
    try {
      accountingDate(match[0]);
      spans.push([match.index, match.index + match[0].length]);
    } catch {
      // The same fall-through `findDate` takes on a token it cannot read.
    }
  }
  return spans;
}
