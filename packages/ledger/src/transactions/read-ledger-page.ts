import { fold } from "@waltning/core/capture/names";
import type { AccountingDate } from "@waltning/core/date";
import { and, asc, desc, eq, gt, lt, lte, or, type SQL } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";
import type {
  LocalSearchTransaction,
  TransactionSearchCursor,
  TransactionSearchFilter,
} from "./search-transactions.ts";
import { lineDescriptionsBy, matchesText, parseSearchAmount } from "./text-match.ts";
import {
  ledgerRowsQuery,
  type SignedLedgerRow,
  signRow,
  structuralWhere,
} from "./transaction-query.ts";

const { transactions } = ledgerSchema;

/**
 * Which way the reader walks away from the anchor. `older` runs descending
 * `(date, id)` towards the opening balance; `newer` runs ascending, towards
 * today.
 */
export type LedgerDirection = "older" | "newer";

/**
 * Everything a filter can say to this reader — no date bounds, which the
 * anchor walk owns.
 *
 * **`text` is in, and it was the seam a search fell through.** S04 §7's search
 * narrows this list; the option was widened at the hook and at the controller
 * and stopped here, where the type said `Omit<…, "text">`. A caller passing
 * `{ text }` in a variable is not excess-property-checked, so it compiled,
 * forwarded nothing, and the list drew the whole ledger under a field
 * reporting three matches. `contract.types.ts` now pins the two ends together.
 */
export type LedgerFilter = Omit<TransactionSearchFilter, "from" | "to">;

export type LedgerPage = {
  /**
   * Always **newest first**, whichever direction was asked for. A `newer`
   * page is read ascending so the cursor can walk forward, then reversed
   * here: a caller prepending rows above an anchor wants them in the order
   * they will be drawn, and reversing at the seam is how an off-by-one
   * becomes a visibly shuffled day.
   */
  rows: readonly LocalSearchTransaction[];
  /** Absent when this direction is exhausted. */
  nextCursor: TransactionSearchCursor | undefined;
};

/**
 * How many rows a page carries. Deliberately smaller than
 * `SEARCH_PAGE_SIZE`: S10 pages a list a person is *reading*, a screenful at
 * a time and always downwards; this pages a list a person is *flinging*
 * through in both directions, where the cost that matters is how long the
 * list cannot answer for a region the viewport has already reached. Smaller
 * pages arrive sooner and are cheaper to discard on the far side.
 */
export const LEDGER_PAGE_SIZE = 30;

/**
 * One page of S04's list, walking away from an anchor in one direction.
 *
 * **S04 §3 — the list is continuous in both directions**, so a mounted list
 * is two of these: an `older` cursor walking back towards the opening
 * balance and a `newer` one walking towards today. They never interact,
 * which is the property that makes a jump cheap (§6): picking a far date
 * discards both and starts a fresh pair at the new anchor, loading that
 * date's neighbourhood and **nothing between**. `TodayPill` is the only way
 * home precisely because nothing is loaded along the way.
 *
 * **The anchor is inclusive going older and exclusive going newer.** A list
 * centred on today draws today in its first `older` page; the `newer` half
 * must not draw it again. Stated here rather than left to the caller,
 * because two halves meeting at a duplicated day is a defect no caller can
 * see until some day has two of something.
 *
 * **Why not a direction flag on `searchTransactions`.** That operation
 * carries a running total over the whole filtered set, recomputed every page,
 * because S10's filter bar promises one. This list has no total and no filter
 * bar; it has a position. A flag would make every S04 page pay for a figure
 * nothing renders, over a set as wide as the ledger. What the two genuinely
 * share — which rows a filter admits, what a row looks like, what sign its
 * money carries — is shared, in `transaction-query.ts`.
 *
 * **Text search is not accepted here.** Folding in JS over a
 * structurally-narrowed set is honest for a bounded page walking one way
 * (`searchTransactions`'s own doc) and quietly quadratic for a list being
 * flung through in two. Filtering S04 by text (§7 — the strip's search)
 * re-anchors the list and pages through `searchTransactions`, which is the
 * operation that answers that question correctly.
 */
export function readLedgerPage<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  options: {
    anchor: AccountingDate;
    direction: LedgerDirection;
    cursor?: TransactionSearchCursor;
    filter?: LedgerFilter;
    limit?: number;
  },
): LedgerPage {
  const { anchor, direction, cursor, filter = {}, limit = LEDGER_PAGE_SIZE } = options;

  // The window: the anchor bound on a first page, the keyset bound after it.
  // Both are `(date, id)` so a day holding more rows than a page cannot lose
  // one at the seam — the id half is what makes the boundary total.
  const window: SQL | undefined =
    direction === "older"
      ? cursor === undefined
        ? lte(transactions.date, anchor)
        : or(
            lt(transactions.date, cursor.date),
            and(eq(transactions.date, cursor.date), lt(transactions.id, cursor.id)),
          )
      : cursor === undefined
        ? gt(transactions.date, anchor)
        : or(
            gt(transactions.date, cursor.date),
            and(eq(transactions.date, cursor.date), gt(transactions.id, cursor.id)),
          );

  const structural = structuralWhere(filter);
  const where =
    structural !== undefined && window !== undefined
      ? and(structural, window)
      : (structural ?? window);

  const order =
    direction === "older"
      ? [desc(transactions.date), desc(transactions.id)]
      : [asc(transactions.date), asc(transactions.id)];

  const needle = filter.text === undefined ? "" : fold(filter.text.trim());

  // One row more than asked for: its presence is what says another page
  // exists, without a second query and without a count.
  //
  // **Except under a text filter, which SQL cannot decide** (`matchesText`'s
  // own doc). There the window is read whole, folded, filtered, and only then
  // paged — `searchTransactions` does exactly this, for exactly this reason,
  // and a `LIMIT` applied before the filter would return a page of rows the
  // reader never asked to see and call it the end of the ledger.
  const read =
    needle === ""
      ? ledgerRowsQuery(db)
          .where(where)
          .orderBy(...order)
          .limit(limit + 1)
          .all()
          .map(signRow)
      : matchingRows(db, where, order, needle, filter.text ?? "", limit);

  const page = read.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor =
    read.length > limit && last !== undefined ? { date: last.date, id: last.id } : undefined;

  return {
    // Ascending was the cursor's requirement, not the caller's.
    rows: direction === "older" ? page : [...page].reverse(),
    nextCursor,
  };
}

/**
 * The window read whole, folded and filtered — the text path.
 *
 * One row past `limit` is kept for the same reason the SQL path keeps one: its
 * presence is what says another page exists. The slice happens after the
 * filter, so the extra row is an extra *match*, not an extra candidate.
 */
function matchingRows<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  where: SQL | undefined,
  order: SQL[],
  needle: string,
  text: string,
  limit: number,
): SignedLedgerRow[] {
  const rows = ledgerRowsQuery(db)
    .where(where)
    .orderBy(...order)
    .all()
    .map(signRow);
  if (rows.length === 0) return [];
  const lines = lineDescriptionsBy(db, where);
  const needleAmount = parseSearchAmount(text);
  const matched: SignedLedgerRow[] = [];
  for (const row of rows) {
    if (!matchesText(row, needle, needleAmount, lines.get(row.id) ?? [])) continue;
    matched.push(row);
    if (matched.length > limit) break;
  }
  return matched;
}
