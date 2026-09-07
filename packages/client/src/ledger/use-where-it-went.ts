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
 * **An uncategorised bucket keeps its own name, and is not *Other*.**
 * `categoryId: null` is money that was captured without a category; *Other* is
 * the tail of ones that have them. Folding the first into the second would
 * hide the one bucket a person can act on.
 */

import * as money from "@waltning/core/money";
import { useMemo } from "react";
import type { PhoneCategoryNode, PhoneSpendByCategory } from "./create-phone-ledger.ts";

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
};

/** Five named rows, then everything else in one. §7.2's own shape. */
const TOP = 5;

export function useWhereItWent(
  rows: readonly PhoneSpendByCategory[],
  categoryTree: readonly PhoneCategoryNode[],
  currency: string | undefined,
  labels: WhereItWentLabels,
): readonly WhereItWentRow[] {
  return useMemo(() => {
    if (currency === undefined) return [];
    // Keyed by the plain string: §6's rows carry `categoryId` unbranded (it is
    // a grouping key, not a reference the reader can follow), and a `Map`
    // keyed on the branded id would never match one.
    const names = new Map<string, string>(categoryTree.map((node) => [node.id, node.name]));

    const named = rows
      .filter((row) => row.currency === currency)
      .map((row) => ({
        key: row.categoryId ?? "uncategorized",
        // A category the tree does not hold is one the reader cannot be told
        // about — the blank's own wording is the truthful answer, and it is
        // the same answer the capture screen gives for the same state.
        label:
          row.categoryId === null
            ? labels.uncategorized
            : (names.get(row.categoryId) ?? labels.uncategorized),
        amount: row.amount,
      }))
      .sort((a, b) => money.cmp(b.amount, a.amount));

    if (named.length <= TOP + 1) return named;
    const head = named.slice(0, TOP);
    const tail = named.slice(TOP);
    return [
      ...head,
      { key: "other", label: labels.other, amount: money.sum(tail.map((row) => row.amount)) },
    ];
  }, [rows, categoryTree, currency, labels.uncategorized, labels.other]);
}
