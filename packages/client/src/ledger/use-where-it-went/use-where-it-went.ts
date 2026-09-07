/**
 * `useWhereItWent` — §6's categories, ranked and named, for S04's own row list.
 *
 * **The screen gets rows, not buckets.** `useSpendByCategory` hands back §6's
 * figures keyed by `categoryId`, which is the honest shape for a chart that
 * draws whatever it is given. A list of rows needs three more decisions —
 * which currency, which order, and what to call each one — and every one of
 * them is a model decision rather than a rendering one. Made here, so
 * `SpendRows` stays a component that draws what it is handed and the screen
 * stays composition (`architecture/11`).
 *
 * **The lead currency only, and it is not converted.** §6's rows are per
 * currency and arc-phone has no display-currency conversion (that is class
 * **S**), so summing two currencies into one bar would be inventing a figure.
 * The rows shown are the lead currency's; a second currency's spending is in
 * the register, which is where a figure that cannot be compared belongs.
 *
 * **A cap, and a remainder that is named.** Five rows plus *Other*, the same
 * shape §7.2 gives the chart — a phone list that keeps going is a list nobody
 * reads to the end, and a truncated one that says nothing about what it cut is
 * a total that does not add up.
 *
 * **Six buckets give six rows, not five and a remainder of one.** Folding a
 * single category into *Other* replaces a name with a word that means less and
 * saves no space at all; the cap exists to stop a list, not to hide a row.
 *
 * **An uncategorised bucket keeps its own name, and is not *Other*.**
 * `categoryId: null` is money that was captured without a category; *Other* is
 * the tail of ones that have them. Folding the first into the second would
 * hide the one bucket a person can act on.
 *
 * **And the seed's own "Uncategorized" is folded into it, by tag.** The seed
 * ships a real category named exactly that (`externalId: "seed:uncategorized"`,
 * `TAXONOMY.md`), so a ledger holding both it and genuinely uncategorised
 * money produced two rows with one name and two amounts — the collision this
 * model was already claiming to prevent, from a direction it was not looking
 * at. Matched on the tag, never on the name: a name is translated, renamed and
 * repeated, and `categories-screen.tsx` identifies the same row the same way.
 */

import * as money from "@waltning/core/money";
import { useMemo } from "react";
import type {
  PhoneFullCategoryNode,
  PhoneSpendByCategory,
} from "../create-phone-ledger/create-phone-ledger.ts";

export type WhereItWentRow = {
  /** `categoryId`, or the two sentinels — stable across renders for a list key. */
  key: string;
  label: string;
  amount: money.Money;
};

export type WhereItWentLabels = {
  /** What an amount with no category is called — S06's own blank. */
  uncategorized: string;
  /** The folded tail. */
  other: string;
  /**
   * A bucket whose category the tree no longer holds. **Not the blank.**
   * Falling back to `uncategorized` put up to three identically-named rows on
   * one chart — the null-category row, a real category the seed ships called
   * "Uncategorized", and every archived one — and claimed of the last that its
   * money had no category, when it has one that is merely hidden.
   */
  removed: string;
};

/** Five named rows, then everything else in one. §7.2's own shape. */
const TOP = 5;

/** The seed's handle for the honest blank — `packages/db/src/seed/run.ts` writes `seed:<key>`. */
const SEED_UNCATEGORIZED = "seed:uncategorized";

export function useWhereItWent(
  rows: readonly PhoneSpendByCategory[],
  /**
   * **The archived-inclusive tree**, typed rather than asked for in prose.
   * `PhoneCategoryNode` is structurally a subset, so the picker's own
   * archived-excluded tree compiled here and silently relabelled last month's
   * spending. `PhoneFullCategoryNode` carries `archived`, which that tree's
   * rows do not, so passing the wrong one is now a compile error.
   */
  categoryTree: readonly PhoneFullCategoryNode[],
  currency: string | undefined,
  labels: WhereItWentLabels,
): readonly WhereItWentRow[] {
  return useMemo(() => {
    if (currency === undefined) return [];
    // Keyed by the plain string: §6's rows carry `categoryId` unbranded (it is
    // a grouping key, not a reference the reader can follow), and a `Map`
    // keyed on the branded id would never match one.
    const names = new Map<string, string>(categoryTree.map((node) => [node.id, node.name]));

    // The seed's own blank, if this tree carries one — its bucket merges into
    // the null bucket rather than standing beside it under the same name.
    const seededBlank = categoryTree.find((node) => node.externalId === SEED_UNCATEGORIZED)?.id;

    const named = rows
      .filter((row) => row.currency === currency)
      .map((row) => ({
        // Two lost ids are one row, for the same reason the seed's blank folds
        // into the null bucket: what the reader can act on is "some of this
        // month has no category I can show you", and splitting that across
        // two identically-named rows says less, twice.
        key:
          row.categoryId === null || row.categoryId === seededBlank
            ? "uncategorized"
            : names.has(row.categoryId)
              ? row.categoryId
              : "removed",
        // Three states, three labels. The caller passes the archived-inclusive
        // tree, so `unknown` is reached only by a category that is genuinely
        // gone rather than merely hidden.
        label:
          row.categoryId === null || row.categoryId === seededBlank
            ? labels.uncategorized
            : (names.get(row.categoryId) ?? labels.removed),
        amount: row.amount,
      }))
      .reduce<WhereItWentRow[]>((rows, row) => {
        // Summed, not merely sharing a key: the seed's blank and the null
        // bucket are one fact, and two rows under one name is the defect
        // whichever way they were produced.
        const existing = rows.find((other) => other.key === row.key);
        if (existing === undefined) return [...rows, row];
        existing.amount = money.add(existing.amount, row.amount);
        return rows;
      }, [])
      .sort((a, b) => money.cmp(b.amount, a.amount));

    // `<= TOP + 1`, deliberately: at exactly six the tail is one row, and
    // folding one named category into *Other* costs a name and saves nothing.
    if (named.length <= TOP + 1) return named;
    const head = named.slice(0, TOP);
    const tail = named.slice(TOP);
    return [
      ...head,
      { key: "other", label: labels.other, amount: money.sum(tail.map((row) => row.amount)) },
    ];
  }, [rows, categoryTree, currency, labels.uncategorized, labels.other, labels.removed]);
}
