/**
 * §13's text rule, in one place, because there is exactly one of it.
 *
 * **A search cannot be decided in SQL.** The query is folded and compared
 * against payee, note, every line's description, and — when the whole query is
 * an amount and nothing else — `amount_original`, exactly. None of that is a
 * predicate SQLite can plan, so every reader that supports a text filter reads
 * candidates and folds them here.
 *
 * **This module exists because there were nearly three readers.** The page, the
 * `countOnly` total, and then S04's per-day counts and its list. Each one that
 * re-implemented the fold would be a second answer to *what does this query
 * match*, and the first symptom is a field reporting three matches over a grid
 * showing four. Sharing the functions makes that one answer structural instead
 * of a comment asking the next person to keep two copies in step.
 */

import { fold } from "@waltning/core/capture/names";
import { id as brandId, type Id } from "@waltning/core/id";
import type { Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import { and, eq, exists, type SQL } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { accounts, transactionLines, transactions } = ledgerSchema;

/**
 * Digits with no grouping at all, optionally a decimal fraction to
 * `numeric(20,8)`'s eight places, and nothing else — `1500`, `48,90`, `0,05`.
 */
const UNGROUPED_AMOUNT = /^\d+(?:[.,]\d{1,8})?$/;

/**
 * The same, written with thousands grouping: one to three digits, then groups
 * of **exactly** three separated by a space or no-break space. `1 500,00`
 * matches; `1 5 0 0` does not, which is the whole reason this is a shape and
 * not a `replace(/\s/g, "")` — a space that is not at a grouping position is
 * not grouping, and a query holding one is text.
 */
const GROUPED_AMOUNT = /^\d{1,3}(?:[ \u00a0]\d{3})*(?:[.,]\d{1,8})?$/;

/**
 * A decimal mark followed by exactly three digits: the one spelling the two
 * conventions read differently and neither can win. `1.500` and `1,500` are
 * one-and-a-half to a reader who takes the mark as decimal and fifteen hundred
 * to one who takes it as grouping. Refused unless the query grouped something
 * with a space, which settles the question — `1 500,000` is fifteen hundred.
 */
const AMBIGUOUS_TAIL = /[.,]\d{3}$/;

/**
 * The **whole** query read as an amount, or `null`.
 *
 * §13's rule is that an amount *token* matches `amount_original` exactly, and
 * a search box is a query rather than free text: it names an amount only when
 * there is nothing else in it. Deliberately its own grammar and not
 * `@waltning/core/capture/amount`'s `findAmount`, which answers a different
 * question — quick-add reads the *first number inside* a phrase, on purpose
 * (`"2 coffees 18"` binds to `2`), and it groups thousands in threes, so
 * `"1500"` reads there as `150`. Borrowing it here made a payee-and-year
 * search like `"Shop A 2024"` silently also match every row costing
 * `2 024,00`, and a bare `"1500"` match `150,00`. Two readers because there
 * are two questions; capture's grammar is free to change without moving what
 * a search box means.
 *
 * The grammar is `computations.md` §13's own, stated there so the two engines
 * cannot drift. A comma or point is the decimal mark (`money.ts` takes a
 * point), so `"1 500,00"` and `"1500.00"` are the same amount. Space and
 * no-break space are grouping — but only where grouping belongs, which is why
 * `"1 500"` is `1500` and `"1 5 0 0"` is text: stripping every space would
 * have made the second an amount too, and a user who typed it meant no such
 * thing. `"1.500"` and `"1,500"` are refused for the opposite reason — both
 * conventions read them, differently, and no grouping space is present to say
 * which. Nothing else either: `"48,90 zł"` and `"1.500,00"` are text,
 * deliberately. §13 gives that reason: a trailing currency token cannot be
 * told from an ordinary payee word without the ledger's whole currency list,
 * so accepting it would make `"100 lat"` match every row at `100,00` — M6
 * again, one spelling later.
 *
 * Compared as money downstream, never as digits: a substring match let `489`
 * find `1 489,00` and fold it into the running total. `489` is not `48,90`;
 * only `48,90` is.
 */
export function parseSearchAmount(text: string): Money | null {
  const query = text.trim();
  const spaced = /[ \u00a0]/.test(query);
  if (spaced ? !GROUPED_AMOUNT.test(query) : !UNGROUPED_AMOUNT.test(query)) return null;
  // A grouping space settles which convention the decimal mark belongs to;
  // with no space, a three-digit tail is unreadable and the query stays text.
  if (!spaced && AMBIGUOUS_TAIL.test(query)) return null;
  return money.toMoney(query.replace(/[ \u00a0]/g, "").replace(",", "."));
}

/**
 * Whether `row` matches the folded `needle` — payee, note, one of the
 * transaction's own line descriptions, or the source leg's amount
 * **exactly** (§13: "Trigram … over `payee`, `note`, `receipts.merchant` and
 * `transaction_lines.description`" — the phone has no receipts table to
 * search yet, but the lines it holds are exactly this list's fourth column,
 * and H2 found them missing). The amount is read by `parseSearchAmount`
 * above, and compared as money.
 */
export function matchesText(
  row: { payee: string; note: string; amountOriginal: Money },
  needle: string,
  needleAmount: Money | null,
  lineDescriptions: readonly string[],
): boolean {
  if (fold(row.payee).includes(needle)) return true;
  if (fold(row.note).includes(needle)) return true;
  if (needleAmount !== null && money.eq(row.amountOriginal, needleAmount)) return true;
  if (lineDescriptions.some((description) => fold(description).includes(needle))) return true;
  return false;
}

/**
 * Every structurally-matching transaction's own line descriptions, grouped by
 * transaction — H2: a description lives on `transaction_lines`, not
 * `transactions`, so the display join set never carries it, and §13 names it
 * as one of the four columns a text search reads.
 *
 * One narrow query rather than a wider join, which would multiply every
 * multi-line transaction's row. And a **correlated subquery over the same
 * `structuralWhere`**, not an `inArray` over the ids already read: the two
 * return the same rows, and the difference is what happens when there are
 * many of them — the structurally-filtered set is deliberately unbounded
 * where a text filter is active (it cannot be pushed into SQL), so `inArray`
 * binds one SQL parameter per row and SQLite refuses past
 * `SQLITE_MAX_VARIABLE_NUMBER`, at exactly the ledger sizes this list is
 * meant to grow into. Restating the predicate costs the planner one more
 * pass over an index it has already used and binds nothing.
 *
 * Called by **both** answers a text filter has — the page and `countOnly`'s
 * `COUNT` — because a count that read three of `matchesText`'s four columns
 * would silently disagree with the figure beside it.
 */
export function lineDescriptionsBy<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  structuralWhere: SQL | undefined,
): Map<Id<"transactions">, string[]> {
  const byTransaction = new Map<Id<"transactions">, string[]>();
  const lineRows = db
    .select({
      transactionId: transactionLines.transactionId,
      description: transactionLines.description,
    })
    .from(transactionLines)
    .where(
      exists(
        // The projection is `transactions.id` rather than a raw `sql`1``:
        // `EXISTS` ignores what a subquery selects, and a real column keeps
        // the builder typed where a raw fragment would be `SQL<unknown>`.
        db
          .select({ matched: transactions.id })
          .from(transactions)
          .innerJoin(accounts, eq(transactions.accountId, accounts.id))
          .where(and(eq(transactions.id, transactionLines.transactionId), structuralWhere)),
      ),
    )
    .all();
  for (const line of lineRows) {
    // `transactionLines.transactionId`'s own column type is `Id<IdTable>`
    // — every branded table, not just this one — because the schema
    // declares it `k.uuid("transaction_id")` with no `<Table>` given.
    // Narrowed here, at the boundary, the same way `@waltning/core/id`'s
    // own `id()` is meant to be used.
    const transactionId = brandId<"transactions">(line.transactionId);
    const descriptions = byTransaction.get(transactionId);
    if (descriptions) descriptions.push(line.description);
    else byTransaction.set(transactionId, [line.description]);
  }
  return byTransaction;
}
