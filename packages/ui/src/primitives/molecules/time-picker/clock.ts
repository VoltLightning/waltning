/**
 * A clock time taken apart and put back — the arithmetic `TimePicker` rolls.
 *
 * Bare `HH:MM` strings in and out (`core/date.ts`'s `TimeOfDay`): a time of day
 * in this ledger is a *description* of when something happened, with no date,
 * no zone and no seconds, and nothing here turns it into an instant.
 */

import { type TimeOfDay, timeOfDay } from "@waltning/core/date";

export type ClockParts = { hour: number; minute: number };

const two = (n: number): string => String(n).padStart(2, "0");

export function partsOfTime(value: TimeOfDay): ClockParts {
  return { hour: Number(value.slice(0, 2)), minute: Number(value.slice(3, 5)) };
}

export function timeOfParts({ hour, minute }: ClockParts): TimeOfDay {
  return timeOfDay(`${two(hour)}:${two(minute)}`);
}

/** `00`…`23` — every locale this ships to writes the 24-hour clock. */
export const HOURS: readonly string[] = Array.from({ length: 24 }, (_, hour) => two(hour));

/**
 * `00`…`59`, every one.
 *
 * **Not steps of five, which is what the board drew.** Its argument was that a
 * drum of sixty is a long spin for a number nobody needs to the minute — true
 * of a schedule, which is what the board was drawn for. A transaction's time
 * comes off a receipt or off the clock, both of which say `12:47`; a drum that
 * cannot show the minute *Now* lands on has to either refuse it or show a
 * banded row that is not the value. The column wraps, so sixty is never more
 * than thirty detents from anywhere.
 */
export const MINUTES: readonly string[] = Array.from({ length: 60 }, (_, minute) => two(minute));

/**
 * What a typed field may become, or `null` — `9:05`, `0930` and `9.30` are
 * what a hand types when it means a time, and none of them is `HH:MM`.
 */
export function readTyped(value: string): TimeOfDay | null {
  const found = /^\s*(\d{1,2})\s*[:.\s]?\s*(\d{2})\s*$/.exec(value);
  if (found === null) return null;
  const hour = Number(found[1]);
  const minute = Number(found[2]);
  if (hour > 23 || minute > 59) return null;
  return timeOfParts({ hour, minute });
}
