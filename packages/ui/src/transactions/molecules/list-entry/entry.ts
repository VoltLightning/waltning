/**
 * One thing the List page draws — the model, with no component attached.
 *
 * **A model rather than four props.** S04's list is not a list of rows: it is
 * a list of *days*, each holding rows, with the empty stretches between them
 * collapsed. So what a cell renders is one of four kinds, and the kind is the
 * first thing anything reading the list has to know — the height it occupies,
 * the day it belongs to, whether it is an anchor point for the strip above.
 * Writing that as a union here is what lets `dateOfEntry` be exhaustive and
 * what stops the page inventing a fifth kind nothing else understands.
 */

import type { Money } from "@waltning/core/money";
import type { LedgerEntry as Row } from "../entry-row/ledger-entry.ts";

/** A day's figure, or the stated absence of one. */
export type DayTotal =
  | { pivot: Money; approximate: boolean }
  /** No rate arrived — the dash, with its reason. */
  | { pivot: null }
  /** A filtered day, which has no figure of its own. Nothing is drawn at all. */
  | { pivot: "filtered" };

/**
 * One cell of the list.
 *
 * **Not to be confused with `entry-row`'s `LedgerEntry`, which is a *row*.**
 * This is the thing a virtualised list renders *at an index* — a day header, a
 * row, a quiet day or a collapsed run — and most of them are not rows at all.
 */
export type ListEntry =
  | { key: string; kind: "day"; date: string; label: string; total: DayTotal; first: boolean }
  | { key: string; kind: "row"; row: Row; place: DayRowPlaceName }
  /** `ahead`: after today — *not yet* rather than *nothing* (S04 §6). */
  | { key: string; kind: "quiet"; date: string; label: string; ahead: boolean }
  | { key: string; kind: "run"; label: string; days: number; from: string; ahead: boolean };

/** Where a row sits in its day, which is what decides its corners. */
export type DayRowPlaceName = "only" | "first" | "middle" | "last";

/**
 * The heights a list needs to know, one per kind that occupies a distinct one.
 *
 * `firstDay` is the ungapped first header — the same component in a different
 * box, which is a different height and therefore its own key.
 *
 * **A row is four kinds, not one.** Where it sits in its day decides its
 * borders — the first carries the card's top edge, the last its bottom, the
 * ones between a hairline, an only child both edges — so the four differ by a
 * point or two. Keyed as one `row`, every position below was out by that
 * much *per row*: a day's worth of drift within a couple of screens, which the
 * e2e suite found as the ring on the 1st over a list on the 2nd, and a tap on
 * the 4th landing the list on the 5th.
 *
 * **Declared here because the component that reports them is here**, and
 * pinned against `list-geometry.ts`'s own table at the one place both meet.
 */
export type EntryHeightKey =
  | "day"
  | "firstDay"
  | "rowOnly"
  | "rowFirst"
  | "rowMiddle"
  | "rowLast"
  | "quiet"
  | "run";

/**
 * The day an entry belongs to, or `null` for one that names none.
 *
 * **Exhaustive on purpose.** A row carries its day on the row rather than on
 * the entry — a reader scrolling through rows is looking at days, so a rule
 * that only understood headers reported nothing for most of the list. The
 * `never` below makes a fifth kind a compile error instead of a silent
 * `undefined`, which is exactly what the first version of this shipped.
 */
export function dateOfEntry(entry: ListEntry): string | null {
  switch (entry.kind) {
    case "day":
      return entry.date;
    case "row":
      return entry.row.date;
    case "quiet":
      return entry.date;
    case "run":
      // The newer end: the list runs backwards, so it is the end the reader
      // meets first.
      return entry.from;
    default: {
      const never: never = entry;
      return never;
    }
  }
}

/** Which measured height an entry occupies. */
export function heightKeyOf(entry: ListEntry): EntryHeightKey {
  if (entry.kind === "day") return entry.first ? "firstDay" : "day";
  if (entry.kind === "row") return ROW_KEY[entry.place];
  return entry.kind;
}

const ROW_KEY = {
  only: "rowOnly",
  first: "rowFirst",
  middle: "rowMiddle",
  last: "rowLast",
} as const satisfies Record<DayRowPlaceName, EntryHeightKey>;
