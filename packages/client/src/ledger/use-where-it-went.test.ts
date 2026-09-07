/**
 * @vitest-environment jsdom
 *
 * The four decisions this model makes between §6's buckets and S04's rows.
 */

import { renderHook } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import type { PhoneFullCategoryNode, PhoneSpendByCategory } from "./create-phone-ledger.ts";
import { useWhereItWent } from "./use-where-it-went.ts";

const LABELS = { uncategorized: "Uncategorized", other: "Other", removed: "Removed category" };

function node(id: string, name: string, externalId: string | null = null): PhoneFullCategoryNode {
  return {
    id,
    parentId: null,
    name,
    kind: "expense",
    isLeaf: true,
    externalId,
    archived: false,
    depth: 0,
    version: 1,
  } as unknown as PhoneFullCategoryNode;
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
  tree: readonly PhoneFullCategoryNode[],
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

  /**
   * **A lost category is not the blank.** The caller passes the
   * archived-inclusive tree, so this is a category that is genuinely gone —
   * and saying its money had no category would be false. It also has to be
   * distinguishable from the real category the seed ships called
   * "Uncategorized", which would otherwise put two identical labels on one
   * chart with two different amounts.
   */
  it("names a lost category apart from the blank, and never prints its id", () => {
    const rows = rowsFor([bucket("gone", "10.00"), bucket(null, "5.00")], []);
    expect(rows.map((row) => row.label)).toEqual(["Removed category", "Uncategorized"]);
    expect(document.body.textContent ?? "").not.toContain("gone");
  });

  /** No lead currency — a ledger with no accounts — is no rows, not a throw. */
  it("is empty when there is no currency to pick", () => {
    const { result } = renderHook(() =>
      useWhereItWent([bucket("groceries", "10.00")], [], undefined, LABELS),
    );
    expect(result.current).toEqual([]);
  });

  /**
   * **The seed ships a real category called "Uncategorized"** (`TAXONOMY.md`,
   * `externalId: "seed:uncategorized"`), so a ledger holding both it and money
   * captured without any category produced two rows, one name, two amounts —
   * the collision this model already claimed to prevent, from the direction it
   * was not looking at. Matched on the tag: a name is translated and renameable.
   */
  it("folds the seed's own blank into the null bucket rather than beside it", () => {
    const rows = rowsFor(
      [bucket("seed-uncat", "10.00"), bucket(null, "5.00"), bucket("groceries", "1.00")],
      [node("seed-uncat", "Uncategorized", "seed:uncategorized"), node("groceries", "Groceries")],
    );
    expect(rows.filter((row) => row.label === "Uncategorized")).toHaveLength(1);
    expect(rows[0]).toEqual({
      key: "uncategorized",
      label: "Uncategorized",
      amount: money.toMoney("15.00"),
    });
  });

  /** A category merely *named* "Uncategorized" without the tag is an ordinary one. */
  it("does not fold a category that only shares the name", () => {
    const rows = rowsFor(
      [bucket("mine", "10.00"), bucket(null, "5.00")],
      [node("mine", "Uncategorized")],
    );
    expect(rows).toHaveLength(2);
  });
});
