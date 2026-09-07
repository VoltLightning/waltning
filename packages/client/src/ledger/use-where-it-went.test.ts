/**
 * @vitest-environment jsdom
 *
 * The four decisions this model makes between §6's buckets and S04's rows.
 */

import { renderHook } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import type { PhoneCategoryNode, PhoneSpendByCategory } from "./create-phone-ledger.ts";
import { useWhereItWent } from "./use-where-it-went.ts";

const LABELS = { uncategorized: "Uncategorized", other: "Other" };

function node(id: string, name: string): PhoneCategoryNode {
  return {
    id,
    parentId: null,
    name,
    kind: "expense",
    isLeaf: true,
    externalId: null,
  } as unknown as PhoneCategoryNode;
}

function bucket(categoryId: string | null, amount: string, currency = "PLN"): PhoneSpendByCategory {
  return {
    currency,
    decimals: 2,
    categoryId,
    amount: money.toMoney(amount),
  } as unknown as PhoneSpendByCategory;
}

function rowsFor(
  buckets: readonly PhoneSpendByCategory[],
  tree: readonly PhoneCategoryNode[],
  currency = "PLN",
) {
  return renderHook(() => useWhereItWent(buckets, tree, currency, LABELS)).result.current;
}

describe("useWhereItWent", () => {
  it("names each bucket from the tree and ranks by amount", () => {
    const rows = rowsFor(
      [bucket("home", "980.00"), bucket("groceries", "1240.50")],
      [node("groceries", "Groceries"), node("home", "Home")],
    );
    expect(rows.map((row) => row.label)).toEqual(["Groceries", "Home"]);
  });

  /**
   * **The lead currency only, and nothing is converted.** §6's rows are per
   * currency and arc-phone has no display-currency conversion, so summing two
   * into one bar would be inventing a figure.
   */
  it("keeps one currency and drops the rest", () => {
    const rows = rowsFor(
      [bucket("groceries", "10.00", "PLN"), bucket("home", "9000.00", "BYN")],
      [node("groceries", "Groceries"), node("home", "Home")],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("Groceries");
  });

  /**
   * Five named rows and a folded tail — §7.2's own shape. The remainder is a
   * sum, so the rows still add up to what the month card says went out.
   */
  it("folds everything past the fifth into one named row", () => {
    const buckets = Array.from({ length: 8 }, (_, i) => bucket(`c${i}`, `${100 - i}.00`));
    const tree = Array.from({ length: 8 }, (_, i) => node(`c${i}`, `Cat ${i}`));
    const rows = rowsFor(buckets, tree);
    expect(rows).toHaveLength(6);
    expect(rows[5]?.label).toBe("Other");
    // 95 + 94 + 93 = 282 — the three that ran off the end, summed.
    expect(rows[5]?.amount).toBe(money.toMoney("282.00"));
  });

  /** Six buckets fit exactly, so nothing is folded and nothing is named *Other*. */
  it("folds nothing when the tail would be a single row", () => {
    const buckets = Array.from({ length: 6 }, (_, i) => bucket(`c${i}`, `${100 - i}.00`));
    const tree = Array.from({ length: 6 }, (_, i) => node(`c${i}`, `Cat ${i}`));
    const rows = rowsFor(buckets, tree);
    expect(rows).toHaveLength(6);
    expect(rows.map((row) => row.label)).not.toContain("Other");
  });

  /**
   * **The blank is not the tail.** `categoryId: null` is money captured
   * without a category — the one bucket a person can act on — and folding it
   * into *Other* would hide it.
   */
  it("keeps an uncategorised bucket under its own name", () => {
    const rows = rowsFor([bucket(null, "140.00")], []);
    expect(rows[0]?.label).toBe("Uncategorized");
    expect(rows[0]?.key).toBe("uncategorized");
  });

  /** A category the tree does not hold reads as the blank, never as a raw id. */
  it("does not print an id for a category the tree has lost", () => {
    const rows = rowsFor([bucket("gone", "10.00")], []);
    expect(rows[0]?.label).toBe("Uncategorized");
  });

  /** No lead currency — a ledger with no accounts — is no rows, not a throw. */
  it("is empty when there is no currency to pick", () => {
    const { result } = renderHook(() =>
      useWhereItWent([bucket("groceries", "10.00")], [], undefined, LABELS),
    );
    expect(result.current).toEqual([]);
  });
});
