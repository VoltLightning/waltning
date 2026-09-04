/**
 * The six category operations, as the phone applies them — `create_category`
 * `rename_category` `reparent_category` `convert_leaf_group`
 * `merge_categories` `archive_category` — plus `readCategoryTree`.
 *
 * Same harness as `account-ops.test.ts`: real two-file writes through
 * `writeLocally` and the real `ledgerRegistry`.
 */

import { accountingDate } from "@waltning/core/date";
import { type Id, id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import { archiveCategoryExecutor } from "../categories/archive-category.executor.ts";
import { convertLeafGroupExecutor } from "../categories/convert-leaf-group.executor.ts";
import { createCategoryExecutor } from "../categories/create-category.executor.ts";
import { mergeCategoriesExecutor } from "../categories/merge-categories.executor.ts";
import { readCategoryTree } from "../categories/read-category-tree.ts";
import { renameCategoryExecutor } from "../categories/rename-category.executor.ts";
import { reparentCategoryExecutor } from "../categories/reparent-category.executor.ts";
import type { LocalExecutor } from "../executor.ts";
import { ledgerRegistry } from "../registry.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { Capture, LocalTx, LocalWriteResult } from "../write.ts";
import { writeLocally } from "../write.ts";
import { type ScratchStores, scratchStores } from "./stores.ts";

const { accounts, categories, outbox, recurringTransactions, transactionLines, transactions } =
  schema;

const PLN = currencyCode("PLN");
const ACCOUNT = id<"accounts">("11111111-1111-4111-8111-111111111111");
const FOOD_GROUP = id<"categories">("22222222-2222-4222-8222-222222222222");
const GROCERIES = id<"categories">("33333333-3333-4333-8333-333333333333");
const EATING_OUT = id<"categories">("44444444-4444-4444-8444-444444444444");
const INCOME_GROUP = id<"categories">("55555555-5555-4555-8555-555555555555");
const SALARY = id<"categories">("66666666-6666-4666-8666-666666666666");
const NEW_LEAF = id<"categories">("77777777-7777-4777-8777-777777777777");

const capture: Capture = { timeZone: "Europe/Warsaw", offsetMinutes: 60 };

let s: ScratchStores;

beforeEach(() => {
  s = scratchStores();
  const db = s.ledger.replica.db;
  db.insert(schema.currencies)
    .values({ code: PLN, name: "Placeholder", decimals: 2, isPivot: true })
    .run();
  db.insert(accounts).values({ id: ACCOUNT, name: "Bank A · PLN", currency: PLN }).run();
  db.insert(categories)
    .values([
      { id: FOOD_GROUP, name: "Food", kind: "expense", isLeaf: false },
      { id: GROCERIES, parentId: FOOD_GROUP, name: "Groceries", kind: "expense", isLeaf: true },
      { id: EATING_OUT, parentId: FOOD_GROUP, name: "Eating out", kind: "expense", isLeaf: true },
      { id: INCOME_GROUP, name: "Earnings", kind: "income", isLeaf: false },
      { id: SALARY, parentId: INCOME_GROUP, name: "Salary", kind: "income", isLeaf: true },
    ])
    .run();
});

afterEach(() => s?.close());

function write<Input extends z.ZodTypeAny, Row>(
  executor: LocalExecutor<Input, Row, LocalTx<unknown, typeof schema>>,
  input: unknown,
): LocalWriteResult<Row> {
  return writeLocally(s.ledger, { executor, registry: ledgerRegistry, input, capture });
}

const entries = () => s.ledger.outbox.db.select().from(outbox).all();
const category = (categoryId: Id<"categories">) =>
  s.ledger.replica.db.select().from(categories).where(eq(categories.id, categoryId)).all()[0];

/* ── read_category_tree ─────────────────────────────────────────────────── */

describe("readCategoryTree", () => {
  it("orders depth-first by sort, and depths the leaves under their group", () => {
    const tree = readCategoryTree(s.ledger.replica.db);

    // Alphabetical among equal `sort` (0 everywhere in this fixture) —
    // "Earnings" before "Food" at the root, "Eating out" before "Groceries"
    // under it.
    expect(tree.map((c) => [c.id, c.depth])).toEqual([
      [INCOME_GROUP, 0],
      [SALARY, 1],
      [FOOD_GROUP, 0],
      [EATING_OUT, 1],
      [GROCERIES, 1],
    ]);
  });
});

/* ── create_category ─────────────────────────────────────────────────────── */

describe("create_category", () => {
  it("lands a leaf under an existing group, and queues one entry", () => {
    const result = write(createCategoryExecutor, {
      id: NEW_LEAF,
      name: "Takeout",
      kind: "expense",
      parentId: FOOD_GROUP,
    });

    expect(result.row.isLeaf).toBe(true);
    expect(result.row.parentId).toBe(FOOD_GROUP);
    expect(entries()).toHaveLength(1);
  });

  it("allows a top-level leaf with no parent", () => {
    const result = write(createCategoryExecutor, {
      id: NEW_LEAF,
      name: "Uncategorized",
      kind: "expense",
    });

    expect(result.row.parentId).toBeNull();
  });

  it("refuses a leaf as the parent — a category is a group or a leaf, never both", () => {
    expect(() =>
      write(createCategoryExecutor, {
        id: NEW_LEAF,
        name: "Takeout",
        kind: "expense",
        parentId: GROCERIES,
      }),
    ).toThrow(/leaf/);
    expect(entries()).toHaveLength(1);
    expect(category(NEW_LEAF)).toBeUndefined();
  });

  it("refuses a kind that disagrees with its parent group", () => {
    expect(() =>
      write(createCategoryExecutor, {
        id: NEW_LEAF,
        name: "Freelance",
        kind: "income",
        parentId: FOOD_GROUP,
      }),
    ).toThrow(/expense/);
  });
});

/* ── rename_category ─────────────────────────────────────────────────────── */

describe("rename_category", () => {
  it("propagates the name and bumps version", () => {
    const before = category(GROCERIES);
    const result = write(renameCategoryExecutor, {
      id: GROCERIES,
      version: before?.version,
      name: "Groceries & household",
    });

    expect(result.row.name).toBe("Groceries & household");
    expect(result.row.version).toBe((before?.version ?? 0) + 1);
  });

  it("refuses a stale version", () => {
    expect(() => write(renameCategoryExecutor, { id: GROCERIES, version: 999, name: "x" })).toThrow(
      /stale version/,
    );
  });
});

/* ── reparent_category ───────────────────────────────────────────────────── */

describe("reparent_category", () => {
  it("moves a leaf to another group of the same kind", () => {
    const otherGroup = id<"categories">("88888888-8888-4888-8888-888888888888");
    write(createCategoryExecutor, { id: otherGroup, name: "Household", kind: "expense" });
    write(convertLeafGroupExecutor, {
      id: otherGroup,
      version: category(otherGroup)?.version,
      to: "group",
    });

    const before = category(GROCERIES);
    const result = write(reparentCategoryExecutor, {
      id: GROCERIES,
      version: before?.version,
      parentId: otherGroup,
    });

    expect(result.row.parentId).toBe(otherGroup);
  });

  it("allows reparenting to a top-level leaf (no parent)", () => {
    const before = category(GROCERIES);
    const result = write(reparentCategoryExecutor, {
      id: GROCERIES,
      version: before?.version,
      parentId: null,
    });

    expect(result.row.parentId).toBeNull();
  });

  it("refuses a leaf as the target parent", () => {
    expect(() =>
      write(reparentCategoryExecutor, {
        id: GROCERIES,
        version: category(GROCERIES)?.version,
        parentId: EATING_OUT,
      }),
    ).toThrow(/leaf/);
  });

  it("refuses crossing kinds — an income leaf under an expense group", () => {
    expect(() =>
      write(reparentCategoryExecutor, {
        id: SALARY,
        version: category(SALARY)?.version,
        parentId: FOOD_GROUP,
      }),
    ).toThrow(/refused across kinds/);
  });

  it("refuses a cycle — a group reparented under its own descendant", () => {
    // GROCERIES becomes a group under FOOD_GROUP first, so it is eligible as
    // a target parent at all; then FOOD_GROUP → GROCERIES would make
    // GROCERIES both an ancestor and a descendant of FOOD_GROUP.
    write(convertLeafGroupExecutor, {
      id: GROCERIES,
      version: category(GROCERIES)?.version,
      to: "group",
    });

    expect(() =>
      write(reparentCategoryExecutor, {
        id: FOOD_GROUP,
        version: category(FOOD_GROUP)?.version,
        parentId: GROCERIES,
      }),
    ).toThrow(/cycle/);
  });
});

/* ── convert_leaf_group ──────────────────────────────────────────────────── */

describe("convert_leaf_group", () => {
  it("converts a leaf with no transactions to a group", () => {
    const before = category(EATING_OUT);
    const result = write(convertLeafGroupExecutor, {
      id: EATING_OUT,
      version: before?.version,
      to: "group",
    });

    expect(result.row.isLeaf).toBe(false);
  });

  it("refuses converting a leaf with transactions to a group", () => {
    s.ledger.replica.db
      .insert(transactions)
      .values({
        id: id<"transactions">("99999999-9999-4999-8999-999999999999"),
        date: accountingDate("2026-03-12"),
        type: "expense",
        accountId: ACCOUNT,
        categoryId: EATING_OUT,
        amountOriginal: money.toMoney("18.40"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
      })
      .run();

    expect(() =>
      write(convertLeafGroupExecutor, {
        id: EATING_OUT,
        version: category(EATING_OUT)?.version,
        to: "group",
      }),
    ).toThrow(/1 transaction/);
  });

  it("refuses converting a leaf to a group when only a recurring rule references it", () => {
    // A leaf with zero `transactions`/`transaction_lines` rows but a live
    // `recurring_transactions.category_id` — the reference the FK check must
    // not miss just because no occurrence has posted yet.
    s.ledger.replica.db
      .insert(recurringTransactions)
      .values({
        id: id<"recurringTransactions">("cccccccc-9999-4999-8999-999999999999"),
        type: "expense",
        accountId: ACCOUNT,
        categoryId: EATING_OUT,
        amountOriginal: money.toMoney("9.99"),
        currency: PLN,
        rrule: "FREQ=MONTHLY",
      })
      .run();

    expect(() =>
      write(convertLeafGroupExecutor, {
        id: EATING_OUT,
        version: category(EATING_OUT)?.version,
        to: "group",
      }),
    ).toThrow(/1 transaction/);
  });

  it("refuses converting a group with children to a leaf", () => {
    expect(() =>
      write(convertLeafGroupExecutor, {
        id: FOOD_GROUP,
        version: category(FOOD_GROUP)?.version,
        to: "leaf",
      }),
    ).toThrow(/child/);
  });

  it("converts a group with no children to a leaf", () => {
    write(archiveCategoryExecutor, { id: GROCERIES, version: category(GROCERIES)?.version });
    write(archiveCategoryExecutor, { id: EATING_OUT, version: category(EATING_OUT)?.version });

    // Archiving both children does not remove them from `parent_id`'s count in
    // this executor's own check — only *unarchived* children gate
    // `archive_category`. `convert_leaf_group` counts every child, archived or
    // not, so reparent them away first to prove the leaf conversion on a
    // genuinely childless group.
    write(reparentCategoryExecutor, {
      id: GROCERIES,
      version: category(GROCERIES)?.version,
      parentId: null,
    });
    write(reparentCategoryExecutor, {
      id: EATING_OUT,
      version: category(EATING_OUT)?.version,
      parentId: null,
    });

    const result = write(convertLeafGroupExecutor, {
      id: FOOD_GROUP,
      version: category(FOOD_GROUP)?.version,
      to: "leaf",
    });

    expect(result.row.isLeaf).toBe(true);
  });
});

/* ── merge_categories ────────────────────────────────────────────────────── */

describe("merge_categories", () => {
  it("moves every transaction and line from the loser to the winner, then archives the loser", () => {
    const line = id<"transactionLines">("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    s.ledger.replica.db
      .insert(transactions)
      .values([
        {
          id: id<"transactions">("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
          date: accountingDate("2026-03-12"),
          type: "expense",
          accountId: ACCOUNT,
          categoryId: EATING_OUT,
          amountOriginal: money.toMoney("18.40"),
          currency: PLN,
          fxRate: money.pivotPerUnit("1"),
        },
        {
          id: id<"transactions">("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
          date: accountingDate("2026-03-13"),
          type: "expense",
          accountId: ACCOUNT,
          categoryId: EATING_OUT,
          amountOriginal: money.toMoney("40.00"),
          currency: PLN,
          fxRate: money.pivotPerUnit("1"),
        },
        {
          id: id<"transactions">("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
          date: accountingDate("2026-03-14"),
          type: "expense",
          accountId: ACCOUNT,
          amountOriginal: money.toMoney("60.00"),
          currency: PLN,
          fxRate: money.pivotPerUnit("1"),
        },
      ])
      .run();
    s.ledger.replica.db
      .insert(transactionLines)
      .values({
        id: line,
        transactionId: id<"transactions">("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
        description: "Takeaway",
        amount: money.toMoney("60.00"),
        categoryId: EATING_OUT,
      })
      .run();

    const result = write(mergeCategoriesExecutor, { loserId: EATING_OUT, winnerId: GROCERIES });

    expect(result.row.movedTransactions).toBe(2);
    expect(result.row.movedLines).toBe(1);
    expect(result.row.loser.archived).toBe(true);

    const movedTxns = s.ledger.replica.db
      .select({ categoryId: transactions.categoryId })
      .from(transactions)
      .where(eq(transactions.categoryId, GROCERIES))
      .all();
    expect(movedTxns).toHaveLength(2);
    const movedLine = s.ledger.replica.db
      .select({ categoryId: transactionLines.categoryId })
      .from(transactionLines)
      .where(eq(transactionLines.id, line))
      .all()[0];
    expect(movedLine?.categoryId).toBe(GROCERIES);
  });

  it("moves a recurring rule on the loser to the winner", () => {
    const rule = id<"recurringTransactions">("eeeeeeee-9999-4999-8999-999999999999");
    s.ledger.replica.db
      .insert(recurringTransactions)
      .values({
        id: rule,
        type: "expense",
        accountId: ACCOUNT,
        categoryId: EATING_OUT,
        amountOriginal: money.toMoney("9.99"),
        currency: PLN,
        rrule: "FREQ=MONTHLY",
      })
      .run();

    const result = write(mergeCategoriesExecutor, { loserId: EATING_OUT, winnerId: GROCERIES });

    expect(result.row.movedRecurring).toBe(1);
    const moved = s.ledger.replica.db
      .select({ categoryId: recurringTransactions.categoryId })
      .from(recurringTransactions)
      .where(eq(recurringTransactions.id, rule))
      .all()[0];
    expect(moved?.categoryId).toBe(GROCERIES);
  });

  it("refuses merging into itself at the schema", () => {
    expect(() =>
      write(mergeCategoriesExecutor, { loserId: GROCERIES, winnerId: GROCERIES }),
    ).toThrow();
    expect(entries()).toHaveLength(0);
  });

  it("refuses merging a group — only leaves hold transactions", () => {
    expect(() =>
      write(mergeCategoriesExecutor, { loserId: FOOD_GROUP, winnerId: GROCERIES }),
    ).toThrow(/only leaves/);
  });

  it("refuses merging across kinds", () => {
    expect(() => write(mergeCategoriesExecutor, { loserId: SALARY, winnerId: GROCERIES })).toThrow(
      /across kinds/,
    );
  });
});

/* ── archive_category ────────────────────────────────────────────────────── */

describe("archive_category", () => {
  it("archives a leaf even though it has transactions — the whole point", () => {
    s.ledger.replica.db
      .insert(transactions)
      .values({
        id: id<"transactions">("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"),
        date: accountingDate("2026-03-12"),
        type: "expense",
        accountId: ACCOUNT,
        categoryId: GROCERIES,
        amountOriginal: money.toMoney("18.40"),
        currency: PLN,
        fxRate: money.pivotPerUnit("1"),
      })
      .run();

    const result = write(archiveCategoryExecutor, {
      id: GROCERIES,
      version: category(GROCERIES)?.version,
    });

    expect(result.row.archived).toBe(true);
  });

  it("refuses archiving a group with unarchived children", () => {
    expect(() =>
      write(archiveCategoryExecutor, { id: FOOD_GROUP, version: category(FOOD_GROUP)?.version }),
    ).toThrow(/unarchived child/);
  });

  it("allows archiving a group once every child is archived", () => {
    write(archiveCategoryExecutor, { id: GROCERIES, version: category(GROCERIES)?.version });
    write(archiveCategoryExecutor, { id: EATING_OUT, version: category(EATING_OUT)?.version });

    const result = write(archiveCategoryExecutor, {
      id: FOOD_GROUP,
      version: category(FOOD_GROUP)?.version,
    });

    expect(result.row.archived).toBe(true);
  });

  it("refuses a category that is already archived", () => {
    write(archiveCategoryExecutor, { id: GROCERIES, version: category(GROCERIES)?.version });

    expect(() =>
      write(archiveCategoryExecutor, { id: GROCERIES, version: category(GROCERIES)?.version }),
    ).toThrow(/already archived/);
  });
});

/* ── a crash between the two commits keeps the intent ───────────────────── */

describe("a category write that fails after the outbox commits", () => {
  it("leaves the entry and no row change — the ordinary crash window", () => {
    expect(() =>
      write(renameCategoryExecutor, { id: GROCERIES, version: 999, name: "x" }),
    ).toThrow();

    expect(entries()).toHaveLength(1);
    expect(category(GROCERIES)?.name).toBe("Groceries");
  });
});
