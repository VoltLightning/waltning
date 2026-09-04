/**
 * H1-b — a transaction's category must be the same kind as the transaction
 * itself. `transactions_category_shape` (`0000_schema.sql`) already refuses a
 * category on anything but income/expense, but that is a single-table CHECK
 * and cannot tell an income category from an expense one — that needs
 * `categories.kind`, a second table's row.
 *
 * The `createTransaction` controller (`create-phone-ledger.ts`) already
 * refuses this before a write ever leaves the phone
 * (`transactions.categoryKindMismatch`), but a client-side refusal is not a
 * guarantee (`CLAUDE.md`: "New guarantee → new constraint").
 * `0012_transaction_scale_and_category_kind.sql` is that constraint; this is
 * what breaks it once to prove it fires.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "./scratch.ts";

let s: Scratch;

const ACCOUNT = "11111111-1111-1111-1111-111111111111";
const EXPENSE_LEAF = "55555555-5555-5555-5555-555555555555";
const INCOME_LEAF = "66666666-6666-6666-6666-666666666666";

beforeAll(async () => {
  s = await scratchDatabase("categorykind");
  await s.sql.unsafe(`
    INSERT INTO currencies (code, name, is_pivot, decimals) VALUES ('PLN', 'Zloty', true, 2);
    INSERT INTO accounts (id, name, kind, currency, ownership)
      VALUES ('${ACCOUNT}', 'Bank A · PLN', 'bank', 'PLN', 'own');
    INSERT INTO categories (id, name, kind, is_leaf) VALUES ('${EXPENSE_LEAF}', 'Eating out', 'expense', true);
    INSERT INTO categories (id, name, kind, is_leaf) VALUES ('${INCOME_LEAF}', 'Salary', 'income', true);`);
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

/** The SQLSTATE, if the statement was refused by one of ours. */
async function refusal(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error: unknown) {
    // The driver's error carries the code; `catch` gives no choice about the
    // binding's type, which is one of the few legitimate uses of `unknown`.
    return (error as { code?: string }).code ?? "unknown";
  }
}

let n = 0;
function nextId(): string {
  return `77777777-7777-7777-7777-${String(++n).padStart(12, "0")}`;
}

describe("a transaction's category matches its own kind", () => {
  it("refuses an expense-kind category on an income row (WA017)", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate, category_id)
        VALUES ('${id}', '${ACCOUNT}', '2026-01-01', 'income', 10, 'PLN', 1, '${EXPENSE_LEAF}')`),
    );
    expect(code, "an expense category on an income row must be refused").toBe("WA017");
  });

  it("refuses an income-kind category on an expense row (WA017)", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate, category_id)
        VALUES ('${id}', '${ACCOUNT}', '2026-01-01', 'expense', 10, 'PLN', 1, '${INCOME_LEAF}')`),
    );
    expect(code, "an income category on an expense row must be refused").toBe("WA017");
  });

  it("admits a category whose own kind matches the transaction", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate, category_id)
        VALUES ('${id}', '${ACCOUNT}', '2026-01-01', 'expense', 10, 'PLN', 1, '${EXPENSE_LEAF}')`),
    );
    expect(code).toBeNull();
  });

  it("admits no category at all", async () => {
    const id = nextId();
    const code = await refusal(() =>
      s.sql.unsafe(`
        INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate)
        VALUES ('${id}', '${ACCOUNT}', '2026-01-01', 'expense', 10, 'PLN', 1)`),
    );
    expect(code).toBeNull();
  });

  it("re-checks on an UPDATE that changes the category, not only on INSERT", async () => {
    const id = nextId();
    await s.sql.unsafe(`
      INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate, category_id)
      VALUES ('${id}', '${ACCOUNT}', '2026-01-01', 'expense', 10, 'PLN', 1, '${EXPENSE_LEAF}')`);

    const code = await refusal(() =>
      s.sql.unsafe(`UPDATE transactions SET category_id = '${INCOME_LEAF}' WHERE id = '${id}'`),
    );
    expect(code).toBe("WA017");
  });
});
