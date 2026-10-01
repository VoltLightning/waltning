/**
 * Proves: SPEC.md §6.6 — a row filed under one of the four debt categories is a
 * debt (the `debt` role and a person), on the replica's three layers: the
 * executors' refusals, the `transactions_debt_category_shape_*` triggers under
 * them, and the `0021_debt_categories` backfill that converts what already
 * sits there.
 *
 * Findings: Opus review of the debt-categories PR — enforce on both engines.
 */
import { accountingDate } from "@waltning/core/date";
import { type Id, id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { REPLICA_STEPS } from "../ddl.ts";
import { openJourney, transactionRows } from "./harness.ts";
import { ID, PIVOT, seedAccount, seedCounterparty, seedCurrency } from "./seed.ts";

type J = ReturnType<typeof openJourney>;

/** drizzle wraps a driver refusal; the trigger's own message is on `cause`. */
function refusal(run: () => unknown): string {
  try {
    run();
    return "";
  } catch (error) {
    // `catch` gives no choice about the binding's type.
    return error instanceof Error
      ? `${error.message} ${(error.cause as Error | undefined)?.message ?? ""}`
      : String(error);
  }
}

function setup() {
  const j = openJourney();
  seedCurrency(j, PIVOT, { isPivot: true });
  seedAccount(j, ID.accountPln, "Bank A · PLN", PIVOT);
  seedCounterparty(j, ID.cpA, "Nina");
  return j;
}

/** A shipped category by its seed key — the id is minted per ledger. */
function category(j: J, seedKey: string): Id<"categories"> {
  const row = j.session.listCategories().find((c) => c.externalId === `seed:${seedKey}`);
  if (!row) throw new Error(`no seed category ${seedKey}`);
  return row.id;
}

let n = 0;
const nextId = () => id<"transactions">(`77777777-7777-4777-8777-${String(++n).padStart(12, "0")}`);

function create(
  j: J,
  categoryId: Id<"categories">,
  extra: { debt?: boolean; type?: "income" | "expense" } = {},
) {
  const txnId = nextId();
  j.session.createTransaction(
    {
      id: txnId,
      date: accountingDate("2026-03-01"),
      type: extra.type ?? "income",
      accountId: ID.accountPln,
      amountOriginal: money.toMoney("10.00"),
      currency: PIVOT,
      categoryId,
      counterpartyId: ID.cpA,
      ...(extra.debt ? { obligationCounterpartyId: ID.cpA, obligationRole: "debt" as const } : {}),
      enteredName: "",
      note: "",
      isBusiness: false,
      isCapital: false,
      source: "manual",
    },
    j.capture,
  );
  return txnId;
}

const row = (j: J, txnId: string) => {
  const found = transactionRows(j).find((r) => r.id === txnId);
  if (!found) throw new Error(`no row ${txnId}`);
  return found;
};

describe("the service layer — create, update, categorize, merge", () => {
  it("refuses a row under Borrowed with no debt, and admits one that is a debt", () => {
    const j = setup();
    try {
      const borrowed = category(j, "borrowed");
      expect(() => create(j, borrowed)).toThrow(/create_transaction: category_id/);
      const ok = create(j, borrowed, { debt: true });
      expect(row(j, ok)).toMatchObject({
        obligationRole: "debt",
        obligationCounterpartyId: ID.cpA,
      });
    } finally {
      j.close();
    }
  });

  it("does not treat a category someone made and called Borrowed as a debt", () => {
    const j = setup();
    try {
      const own = j.session.createCategory(
        {
          id: id<"categories">("aaaaaaaa-aaaa-4aaa-8aaa-000000000099"),
          name: "Borrowed",
          kind: "income",
          parentId: null,
          isEarnings: false,
        },
        j.capture,
      );
      expect(() => create(j, own.id)).not.toThrow();
    } finally {
      j.close();
    }
  });

  it("refuses moving a plain row into a debt category, and takes the role back on leaving it", () => {
    const j = setup();
    try {
      const salary = category(j, "salary");
      const borrowed = category(j, "borrowed");
      const plain = create(j, salary);
      expect(() =>
        j.session.updateTransaction(
          { id: plain, version: row(j, plain).version, patch: { categoryId: borrowed } },
          j.capture,
        ),
      ).toThrow(/update_transaction: category_id/);

      const debt = create(j, borrowed, { debt: true });
      j.session.updateTransaction(
        { id: debt, version: row(j, debt).version, patch: { categoryId: salary } },
        j.capture,
      );
      expect(row(j, debt)).toMatchObject({
        categoryId: salary,
        obligationRole: null,
        obligationCounterpartyId: null,
        // who it was with is still true
        counterpartyId: ID.cpA,
      });
    } finally {
      j.close();
    }
  });

  it("does not refuse an unrelated edit to a legacy row that names nobody", () => {
    const j = setup();
    try {
      const borrowed = category(j, "borrowed");
      const legacy = create(j, borrowed, { debt: true });
      // A row from before the rule: the pair removed underneath it.
      const db = j.raw().replica.db;
      db.run(sql.raw(`drop trigger "transactions_debt_category_shape_update"`));
      db.run(
        sql.raw(
          `update "transactions" set "obligation_role" = null, "obligation_counterparty_id" = null where "id" = '${legacy}'`,
        ),
      );
      expect(() =>
        j.session.updateTransaction(
          { id: legacy, version: row(j, legacy).version, patch: { note: "a note" } },
          j.capture,
        ),
      ).not.toThrow();
      expect(row(j, legacy).note).toBe("a note");
    } finally {
      j.close();
    }
  });

  it("refuses categorize_batch into a debt category for rows with no debt, and clears it on the way out", () => {
    const j = setup();
    try {
      const salary = category(j, "salary");
      const borrowed = category(j, "borrowed");
      const plain = create(j, salary);
      expect(() =>
        j.session.categorizeBatch({ categoryId: borrowed, transactionIds: [plain] }, j.capture),
      ).toThrow(/carry no debt/);

      const debt = create(j, borrowed, { debt: true });
      j.session.categorizeBatch({ categoryId: salary, transactionIds: [debt] }, j.capture);
      expect(row(j, debt)).toMatchObject({ obligationRole: null, obligationCounterpartyId: null });
    } finally {
      j.close();
    }
  });

  it("refuses merging into or out of a debt category while the loser holds rows, and allows an empty one", () => {
    const j = setup();
    try {
      const salary = category(j, "salary");
      const other = category(j, "gift-received");
      const borrowed = category(j, "borrowed");
      create(j, other);
      expect(() =>
        j.session.mergeCategories({ loserId: other, winnerId: borrowed }, j.capture),
      ).toThrow(/merge_categories:/);
      // An empty loser moves nothing, so there is nothing for the rule to break.
      expect(() =>
        j.session.mergeCategories({ loserId: salary, winnerId: borrowed }, j.capture),
      ).not.toThrow();
    } finally {
      j.close();
    }
  });
});

describe("the trigger under the service check", () => {
  it("aborts a raw insert and a raw update that bypass the executors (WA022)", () => {
    const j = setup();
    try {
      const salary = category(j, "salary");
      const borrowed = category(j, "borrowed");
      const plain = create(j, salary);
      const db = j.raw().replica.db;
      const move = sql.raw(
        `update "transactions" set "category_id" = '${borrowed}' where "id" = '${plain}'`,
      );
      const insert = sql.raw(
        `insert into "transactions" ("id","account_id","date","type","amount_original","currency","fx_rate","category_id")
         values ('${nextId()}','${ID.accountPln}','2026-03-01','income','10.00000000','PLN','1','${borrowed}')`,
      );
      expect(refusal(() => db.run(move))).toMatch(/WA022/);
      expect(refusal(() => db.run(insert))).toMatch(/WA022/);
    } finally {
      j.close();
    }
  });
});

describe("the 0021 backfill — a row with a person becomes a debt, one with nobody is left", () => {
  it("converts, leaves, and is idempotent", () => {
    const j = setup();
    try {
      const borrowed = category(j, "borrowed");
      const withPerson = create(j, borrowed, { debt: true });
      const withoutPerson = create(j, borrowed, { debt: true });
      const db = j.raw().replica.db;
      db.run(sql.raw(`drop trigger "transactions_debt_category_shape_update"`));
      db.run(
        sql.raw(
          `update "transactions" set "obligation_role" = null, "obligation_counterparty_id" = null where "id" in ('${withPerson}','${withoutPerson}')`,
        ),
      );
      db.run(
        sql.raw(
          `update "transactions" set "counterparty_id" = null where "id" = '${withoutPerson}'`,
        ),
      );

      const step = REPLICA_STEPS.find((s) => s.tag === "0021_debt_categories");
      if (!step) throw new Error("no 0021_debt_categories step");
      for (const statement of step.statements) db.run(sql.raw(statement));
      expect(row(j, withPerson)).toMatchObject({
        obligationRole: "debt",
        obligationCounterpartyId: ID.cpA,
      });
      expect(row(j, withoutPerson)).toMatchObject({
        obligationRole: null,
        obligationCounterpartyId: null,
      });

      const before = JSON.stringify(transactionRows(j));
      for (const statement of step.statements) db.run(sql.raw(statement));
      expect(JSON.stringify(transactionRows(j)), "a second run changes nothing").toBe(before);
    } finally {
      j.close();
    }
  });
});
