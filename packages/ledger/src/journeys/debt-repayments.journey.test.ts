/**
 * Proves: SPEC.md §6.6 — a repayment is written only by `settle_debt`; the
 * discharge figure a settlement stamped follows its amount and leaves with its
 * category; a split line is never filed under a debt category; and an entry
 * captured before the rule is brought to it at replay, never dropped.
 *
 * Findings: Opus re-review of the debt-categories PR (the second repayment path,
 * stale `debt_amount`, queued pre-upgrade captures, split lines).
 */
import { accountingDate } from "@waltning/core/date";
import { type Id, id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { openJourney, outboxEntries, transactionRows } from "./harness.ts";
import { ID, PIVOT, seedAccount, seedCounterparty, seedCurrency, seedRate } from "./seed.ts";

type J = ReturnType<typeof openJourney>;
const EUR = money.currencyCode("EUR");
const ACCOUNT_EUR = id<"accounts">("44444444-4444-4444-8444-444444444441");

function setup() {
  const j = openJourney();
  seedCurrency(j, PIVOT, { isPivot: true });
  seedCurrency(j, EUR);
  seedAccount(j, ID.accountPln, "Bank A · PLN", PIVOT);
  seedAccount(j, ACCOUNT_EUR, "Bank B · EUR", EUR);
  seedCounterparty(j, ID.cpA, "Nina");
  seedRate(j, PIVOT, EUR, "2026-03-01", "0.2500");
  return j;
}

function category(j: J, seedKey: string): Id<"categories"> {
  const row = j.session.listCategories().find((c) => c.externalId === `seed:${seedKey}`);
  if (!row) throw new Error(`no seed category ${seedKey}`);
  return row.id;
}

let n = 0;
const nextId = () => id<"transactions">(`77777777-7777-4777-8777-${String(++n).padStart(12, "0")}`);
const DATE = accountingDate("2026-03-01");

/** Nina owes `amount` PLN: a lend through the ordinary write path. */
function lend(j: J, amount: string) {
  const txnId = nextId();
  j.session.createTransaction(
    {
      id: txnId,
      date: DATE,
      type: "expense",
      accountId: ID.accountPln,
      amountOriginal: money.toMoney(amount),
      currency: PIVOT,
      categoryId: category(j, "lent-out"),
      counterpartyId: ID.cpA,
      obligationCounterpartyId: ID.cpA,
      obligationRole: "debt",
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

function settle(j: J, amount: string, extra: { account?: Id<"accounts">; currency?: string } = {}) {
  const txnId = nextId();
  j.session.settleDebt(
    {
      id: txnId,
      counterpartyId: ID.cpA,
      accountId: extra.account ?? ID.accountPln,
      date: DATE,
      amount: money.toMoney(amount),
      currency: money.currencyCode(extra.currency ?? "PLN"),
      type: "income",
      discharges: { currency: PIVOT, amount: money.toMoney("100.00") },
      note: "",
      categoryId: category(j, "repayment-received"),
    },
    j.capture,
  );
  return txnId;
}

const balance = (j: J) =>
  Number(
    j.session
      .listCounterpartyBalances(accountingDate("2026-03-31"))
      .find((row) => row.counterpartyId === ID.cpA && row.currency === PIVOT)?.balance ?? 0,
  );

const row = (j: J, txnId: string) => {
  const found = transactionRows(j).find((r) => r.id === txnId);
  if (!found) throw new Error(`no row ${txnId}`);
  return found;
};

describe("a repayment is written only by settle_debt", () => {
  it("refuses a plain create, a plain update into the category and a batch into it, naming settle_debt", () => {
    const j = setup();
    try {
      const repayment = category(j, "repayment-received");
      const salary = category(j, "salary");
      expect(() =>
        j.session.createTransaction(
          {
            id: nextId(),
            date: DATE,
            type: "income",
            accountId: ID.accountPln,
            amountOriginal: money.toMoney("10.00"),
            currency: PIVOT,
            categoryId: repayment,
            obligationCounterpartyId: ID.cpA,
            obligationRole: "debt",
            enteredName: "",
            note: "",
            isBusiness: false,
            isCapital: false,
            source: "manual",
          },
          j.capture,
        ),
      ).toThrow(/create_transaction: category_id.*settle_debt/);

      const plain = nextId();
      j.session.createTransaction(
        {
          id: plain,
          date: DATE,
          type: "income",
          accountId: ID.accountPln,
          amountOriginal: money.toMoney("10.00"),
          currency: PIVOT,
          categoryId: salary,
          enteredName: "",
          note: "",
          isBusiness: false,
          isCapital: false,
          source: "manual",
        },
        j.capture,
      );
      expect(() =>
        j.session.updateTransaction(
          {
            id: plain,
            version: row(j, plain).version,
            patch: {
              categoryId: repayment,
              obligationCounterpartyId: ID.cpA,
              obligationRole: "debt",
            },
          },
          j.capture,
        ),
      ).toThrow(/update_transaction: category_id.*settle_debt/);
      expect(() =>
        j.session.categorizeBatch({ categoryId: repayment, transactionIds: [plain] }, j.capture),
      ).toThrow(/categorize_batch: category_id.*settle_debt/);
      // …and nothing reverse was opened by any of it.
      expect(balance(j)).toBe(0);
    } finally {
      j.close();
    }
  });

  it("still writes one through settle_debt", () => {
    const j = setup();
    try {
      lend(j, "200.00");
      settle(j, "100.00");
      expect(balance(j)).toBe(100);
    } finally {
      j.close();
    }
  });
});

describe("the discharge figure follows the settlement", () => {
  it("moves the balance by the new amount when a same-currency repayment is edited 100 → 120", () => {
    const j = setup();
    try {
      lend(j, "200.00");
      const paid = settle(j, "100.00");
      expect(balance(j)).toBe(100);
      j.session.updateTransaction(
        {
          id: paid,
          version: row(j, paid).version,
          patch: { amountOriginal: money.toMoney("120.00") },
        },
        j.capture,
      );
      expect(row(j, paid)).toMatchObject({ debtAmount: "120.00000000", debtCurrency: PIVOT });
      expect(balance(j)).toBe(80);
    } finally {
      j.close();
    }
  });

  it("refuses to restate a cross-currency repayment, and says to re-settle", () => {
    const j = setup();
    try {
      lend(j, "200.00");
      // 25 EUR discharging 100 PLN.
      const paid = settle(j, "25.00", { account: ACCOUNT_EUR, currency: "EUR" });
      expect(() =>
        j.session.updateTransaction(
          {
            id: paid,
            version: row(j, paid).version,
            patch: { amountOriginal: money.toMoney("30.00") },
          },
          j.capture,
        ),
      ).toThrow(/Re-settle/);
      expect(balance(j)).toBe(100);
    } finally {
      j.close();
    }
  });

  it("clears the figure with the role when the row leaves the category, and does not bring it back", () => {
    const j = setup();
    try {
      lend(j, "200.00");
      const paid = settle(j, "100.00");
      j.session.updateTransaction(
        { id: paid, version: row(j, paid).version, patch: { categoryId: category(j, "salary") } },
        j.capture,
      );
      expect(row(j, paid)).toMatchObject({
        debtAmount: null,
        debtCurrency: null,
        obligationRole: null,
        obligationCounterpartyId: null,
      });
      // Re-entering a debt category the allowed way does not resurrect the old figure.
      j.session.updateTransaction(
        {
          id: paid,
          version: row(j, paid).version,
          patch: {
            categoryId: category(j, "borrowed"),
            obligationCounterpartyId: ID.cpA,
            obligationRole: "debt",
          },
        },
        j.capture,
      );
      expect(row(j, paid)).toMatchObject({ debtAmount: null, debtCurrency: null });
    } finally {
      j.close();
    }
  });

  it("clears it for categorize_batch too", () => {
    const j = setup();
    try {
      lend(j, "200.00");
      const paid = settle(j, "100.00");
      j.session.categorizeBatch(
        { categoryId: category(j, "salary"), transactionIds: [paid] },
        j.capture,
      );
      expect(row(j, paid)).toMatchObject({ debtAmount: null, debtCurrency: null });
    } finally {
      j.close();
    }
  });
});

describe("a split line is never filed under a debt category", () => {
  it("refuses it in the executor, and the trigger refuses a raw insert", () => {
    const j = setup();
    try {
      const txnId = nextId();
      j.session.createTransaction(
        {
          id: txnId,
          date: DATE,
          type: "expense",
          accountId: ID.accountPln,
          amountOriginal: money.toMoney("10.00"),
          currency: PIVOT,
          enteredName: "",
          note: "",
          isBusiness: false,
          isCapital: false,
          source: "manual",
        },
        j.capture,
      );
      const lineId = id<"transactionLines">("88888888-8888-4888-8888-888888888881");
      expect(() =>
        j.session.setTransactionLines(
          {
            transactionId: txnId,
            version: row(j, txnId).version,
            lines: [
              {
                id: lineId,
                description: "Half",
                amount: money.toMoney("10.00"),
                categoryId: category(j, "borrowed"),
              },
            ],
          },
          j.capture,
        ),
      ).toThrow(/split line has no person/);

      const db = j.raw().replica.db;
      let message = "";
      try {
        db.run(
          sql.raw(
            `insert into "transaction_lines" ("id","transaction_id","description","amount","category_id")
             values ('${lineId}','${txnId}','Half','10.00000000','${category(j, "borrowed")}')`,
          ),
        );
      } catch (error) {
        message = `${(error as Error).message} ${((error as Error).cause as Error | undefined)?.message ?? ""}`;
      }
      expect(message).toMatch(/WA022/);
    } finally {
      j.close();
    }
  });

  it("makes a merge count the lines the loser holds", () => {
    const j = setup();
    try {
      const txnId = nextId();
      j.session.createTransaction(
        {
          id: txnId,
          date: DATE,
          type: "expense",
          accountId: ID.accountPln,
          amountOriginal: money.toMoney("10.00"),
          currency: PIVOT,
          enteredName: "",
          note: "",
          isBusiness: false,
          isCapital: false,
          source: "manual",
        },
        j.capture,
      );
      const groceries = category(j, "groceries");
      j.session.setTransactionLines(
        {
          transactionId: txnId,
          version: row(j, txnId).version,
          lines: [
            {
              id: id<"transactionLines">("88888888-8888-4888-8888-888888888882"),
              description: "Half",
              amount: money.toMoney("10.00"),
              categoryId: groceries,
            },
          ],
        },
        j.capture,
      );
      // The only thing under Groceries is that line: a merge into a debt category must see it.
      expect(() =>
        j.session.mergeCategories(
          { loserId: groceries, winnerId: category(j, "lent-out") },
          j.capture,
        ),
      ).toThrow(/merge_categories:/);
    } finally {
      j.close();
    }
  });
});

/** The first half of a write, as the build before this rule left it: an entry that was never applied. */
function queueLegacy(j: J, payload: Record<string, unknown>) {
  const seq = Math.max(0, ...outboxEntries(j).map((e) => e.seq)) + 1;
  j.raw()
    .outbox.db.insert(ledgerSchema.outbox)
    .values({
      seq,
      operation: "create_transaction",
      opVersion: 1,
      payload,
      deps: [],
      capturedTz: "Europe/Warsaw",
      capturedOffsetMinutes: 60,
    })
    .run();
}

function legacyPayload(j: J, categoryKey: string, extra: Record<string, unknown>) {
  const txnId = nextId();
  return {
    txnId,
    payload: {
      id: txnId,
      date: DATE,
      type: categoryKey.startsWith("repayment-received") ? "income" : "expense",
      accountId: ID.accountPln,
      amountOriginal: "100.00000000",
      currency: "PLN",
      categoryId: category(j, categoryKey),
      enteredName: "",
      note: "",
      isBusiness: false,
      isCapital: false,
      source: "manual",
      ...extra,
    },
  };
}

describe("an entry queued before the rule is brought to it at replay, never dropped", () => {
  it("makes a queued Lent out that names a person the debt it was meant to be", () => {
    const j = setup();
    try {
      const { txnId, payload } = legacyPayload(j, "lent-out", { counterpartyId: ID.cpA });
      queueLegacy(j, payload);
      j.relaunch();
      expect(row(j, txnId)).toMatchObject({
        categoryId: category(j, "lent-out"),
        obligationRole: "debt",
        obligationCounterpartyId: ID.cpA,
      });
      expect(outboxEntries(j)[0]?.disposition ?? null).toBeNull();
    } finally {
      j.close();
    }
  });

  it("keeps a queued Lent out that names nobody as a plain uncategorised row", () => {
    const j = setup();
    try {
      const { txnId, payload } = legacyPayload(j, "lent-out", {});
      queueLegacy(j, payload);
      j.relaunch();
      expect(row(j, txnId)).toMatchObject({
        categoryId: null,
        obligationRole: null,
        amountOriginal: "100.00000000",
      });
    } finally {
      j.close();
    }
  });

  it("turns a queued repayment against an open debt into a settlement", () => {
    const j = setup();
    try {
      lend(j, "200.00");
      const { txnId, payload } = legacyPayload(j, "repayment-received", {
        counterpartyId: ID.cpA,
        obligationCounterpartyId: ID.cpA,
        obligationRole: "debt",
      });
      queueLegacy(j, payload);
      j.relaunch();
      expect(row(j, txnId)).toMatchObject({
        categoryId: category(j, "repayment-received"),
        debtAmount: "100.00000000",
        debtCurrency: PIVOT,
      });
      expect(balance(j)).toBe(100);
    } finally {
      j.close();
    }
  });

  it("keeps a queued repayment with no debt to settle as a plain row, and opens no reverse debt", () => {
    const j = setup();
    try {
      const { txnId, payload } = legacyPayload(j, "repayment-received", {
        counterpartyId: ID.cpA,
        obligationCounterpartyId: ID.cpA,
        obligationRole: "debt",
      });
      queueLegacy(j, payload);
      j.relaunch();
      expect(row(j, txnId)).toMatchObject({
        categoryId: null,
        obligationRole: null,
        obligationCounterpartyId: null,
        counterpartyId: ID.cpA,
      });
      expect(balance(j)).toBe(0);
    } finally {
      j.close();
    }
  });
});
