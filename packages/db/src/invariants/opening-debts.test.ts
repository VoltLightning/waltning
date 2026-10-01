/**
 * Proves: SPEC.md §6.6 — a debt that predates the ledger is a row of its own
 * (`opening_debts`), whose shape the database holds whatever the application
 * did: an amount above zero and under the ceiling, a known direction, one row
 * per person and currency, and a figure that fits its currency's scale
 * (WA016) and cannot be stranded by lowering that scale (WA018).
 *
 * And what it does to the figures: it moves the person's balance as a lend or
 * a borrow, folds into ageing, and touches no transaction — so no account and
 * no period figure.
 *
 * Findings: owner decision 2026-10-01 — an existing debt is entered on the
 * person's page, never as income or spending.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { oldestOpenDebt } from "../figures/counterparty-ageing.ts";
import { counterpartyBalances } from "../figures/counterparty-balance.ts";
import { type Scratch, scratchDatabase } from "../test/scratch.ts";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const NINA = "22222222-2222-4222-8222-222222222221";
const MAREK = "22222222-2222-4222-8222-222222222222";
const ACME = "22222222-2222-4222-8222-222222222223";

let s: Scratch;

beforeAll(async () => {
  s = await scratchDatabase("opening_debts");
  await s.sql.unsafe(`
    INSERT INTO currencies (code, name, is_pivot, decimals) VALUES ('PLN', 'Zloty', true, 2);
    INSERT INTO currencies (code, name, decimals) VALUES ('JPY', 'Yen', 0);
    INSERT INTO accounts (id, name, kind, currency, ownership)
      VALUES ('${ACCOUNT}', 'Bank A · PLN', 'bank', 'PLN', 'own');
    INSERT INTO counterparties (id, name, kind) VALUES ('${NINA}', 'Nina', 'person');
    INSERT INTO counterparties (id, name, kind) VALUES ('${MAREK}', 'Marek', 'person');
    INSERT INTO counterparties (id, name, kind) VALUES ('${ACME}', 'Acme', 'company');`);
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

async function refusal(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error: unknown) {
    // `catch` gives no choice about the binding's type.
    const failure = error as { code?: string; constraint_name?: string; message?: string };
    return failure.constraint_name ?? failure.code ?? failure.message ?? "unknown";
  }
}

const insert = (
  counterparty: string,
  over: { currency?: string; direction?: string; amount?: string | number; date?: string } = {},
) =>
  s.sql.unsafe(
    `INSERT INTO opening_debts (counterparty_id, currency, direction, amount, date)
     VALUES ('${counterparty}', '${over.currency ?? "PLN"}', '${over.direction ?? "theyOwe"}',
             ${over.amount ?? 200}, '${over.date ?? "2026-01-01"}')`,
  );

describe("opening_debts — the shape the database holds", () => {
  it("takes a valid row, and the largest amount the ceiling allows", async () => {
    await insert(NINA);
    await insert(MAREK, { amount: "999999999.99", direction: "youOwe" });
  });

  it("refuses an amount that is not above zero (opening_debts_amount_positive)", async () => {
    expect(await refusal(() => insert(ACME, { amount: 0 }))).toBe("opening_debts_amount_positive");
    expect(await refusal(() => insert(ACME, { amount: -5 }))).toBe("opening_debts_amount_positive");
  });

  it("refuses an amount at the ceiling (opening_debts_amount_ceiling)", async () => {
    expect(await refusal(() => insert(ACME, { amount: "1000000000" }))).toBe(
      "opening_debts_amount_ceiling",
    );
  });

  it("refuses a direction that is neither of the two (opening_debts_direction_known)", async () => {
    expect(await refusal(() => insert(ACME, { direction: "both" }))).toBe(
      "opening_debts_direction_known",
    );
  });

  it("refuses a second row for one person and currency (opening_debts_counterparty_currency_uq)", async () => {
    expect(await refusal(() => insert(NINA))).toBe("opening_debts_counterparty_currency_uq");
    // The same person in another currency is a different debt.
    await insert(NINA, { currency: "JPY", amount: 5000 });
  });

  it("refuses a figure past its currency's scale (WA016)", async () => {
    expect(await refusal(() => insert(ACME, { amount: "10.005" }))).toBe(
      "opening_debts_amount_scale_matches_currency",
    );
    // Yen holds none, so a fraction is past it; the in-bounds twin is whole yen.
    expect(await refusal(() => insert(ACME, { currency: "JPY", amount: "10.5" }))).toBe(
      "opening_debts_amount_scale_matches_currency",
    );
    await insert(ACME, { currency: "JPY", amount: 10 });
  });

  it("cannot be stranded by lowering its currency's decimals (WA018)", async () => {
    await s.sql.unsafe(`UPDATE currencies SET decimals = 3 WHERE code = 'PLN'`);
    await s.sql.unsafe(
      `UPDATE opening_debts SET amount = 12.125 WHERE counterparty_id = '${NINA}' AND currency = 'PLN'`,
    );
    expect(
      await refusal(() => s.sql.unsafe(`UPDATE currencies SET decimals = 2 WHERE code = 'PLN'`)),
    ).toBe("currencies_decimals_safe");
    await s.sql.unsafe(
      `UPDATE opening_debts SET amount = 200 WHERE counterparty_id = '${NINA}' AND currency = 'PLN'`,
    );
    await s.sql.unsafe(`UPDATE currencies SET decimals = 2 WHERE code = 'PLN'`);
  });

  it("moves updated_at on every update", async () => {
    const [before] = await s.sql<{ updated_at: number }[]>`
      SELECT extract(epoch FROM updated_at)::float8 AS updated_at FROM opening_debts WHERE counterparty_id = ${NINA} AND currency = 'PLN'`;
    await s.sql.unsafe(`SELECT pg_sleep(0.01)`);
    await s.sql.unsafe(
      `UPDATE opening_debts SET amount = 201 WHERE counterparty_id = '${NINA}' AND currency = 'PLN'`,
    );
    const [after] = await s.sql<{ updated_at: number }[]>`
      SELECT extract(epoch FROM updated_at)::float8 AS updated_at FROM opening_debts WHERE counterparty_id = ${NINA} AND currency = 'PLN'`;
    expect(after?.updated_at).toBeGreaterThan(before?.updated_at ?? 0);
    await s.sql.unsafe(
      `UPDATE opening_debts SET amount = 200 WHERE counterparty_id = '${NINA}' AND currency = 'PLN'`,
    );
  });
});

describe("opening_debts — soft delete and the repayment link", () => {
  it("frees the person and currency for a new debt once the old one is soft-deleted", async () => {
    await insert(ACME, { amount: 5 });
    expect(await refusal(() => insert(ACME, { amount: 6 }))).toBe(
      "opening_debts_counterparty_currency_uq",
    );
    await s.sql.unsafe(
      `UPDATE opening_debts SET deleted_at = now() WHERE counterparty_id = '${ACME}' AND currency = 'PLN'`,
    );
    await insert(ACME, { amount: 6 });
    await s.sql.unsafe(`DELETE FROM opening_debts WHERE counterparty_id = '${ACME}'`);
  });

  it("only a debt-role transaction may name the opening debt it settles (transactions_opening_link_shape)", async () => {
    const [debt] = await s.sql<{ id: string }[]>`
      SELECT id FROM opening_debts WHERE counterparty_id = ${NINA} AND currency = 'PLN'`;
    const row = (role: string) =>
      s.sql.unsafe(
        `INSERT INTO transactions (date, type, account_id, amount_original, currency, fx_rate,
                                   settles_opening_debt_id, obligation_counterparty_id, obligation_role)
         VALUES ('2026-09-03', 'income', '${ACCOUNT}', 1, 'PLN', 1, '${debt?.id}',
                 ${role === "debt" ? `'${NINA}'` : "NULL"}, ${role === "debt" ? "'debt'" : "NULL"})`,
      );
    expect(await refusal(() => row("none"))).toBe("transactions_opening_link_shape");
    await row("debt");
    await s.sql.unsafe(`DELETE FROM transactions WHERE settles_opening_debt_id = '${debt?.id}'`);
  });
});

describe("opening_debts — the person's balance, and nothing else", () => {
  it("folds in as a lend or a borrow, beside the debt-role transactions already there", async () => {
    // Nina already owes 200 PLN from the opening row; she repays 50 as a debt-role income.
    await s.sql.unsafe(`
      INSERT INTO transactions (date, type, account_id, amount_original, currency, fx_rate,
                                obligation_counterparty_id, obligation_role)
      VALUES ('2026-09-02', 'income', '${ACCOUNT}', 50, 'PLN', 1, '${NINA}', 'debt')`);

    const rows = await counterpartyBalances(s.db);
    const of = (counterparty: string, currency: string) =>
      rows.find((row) => row.counterpartyId === counterparty && row.currency === currency)?.balance;

    expect(of(NINA, "PLN")).toBe("150.00000000");
    expect(of(NINA, "JPY")).toBe("5000.00000000");
    // Marek: borrowed, so negative.
    expect(of(MAREK, "PLN")).toBe("-999999999.99000000");
  });

  it("is never a transaction: no account, no period figure, no row to categorise", async () => {
    const [count] = await s.sql<{ n: string }[]>`SELECT count(*)::text AS n FROM transactions`;
    // Only the one debt-role repayment above; the opening debts added none.
    expect(count?.n).toBe("1");
    const columns = await s.sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'opening_debts'`;
    expect(columns.map((row) => row.column_name).sort()).toEqual([
      "amount",
      "counterparty_id",
      "created_at",
      "currency",
      "date",
      "deleted_at",
      "direction",
      "id",
      "updated_at",
    ]);
  });

  it("ages the oldest open leg: the opening debt is the oldest, and it is named", async () => {
    // Nina owes 200 (opened 2026-01-01) and repaid 50 on 2026-09-02: the oldest
    // still-open leg is the opening debt itself.
    const rows = await oldestOpenDebt(s.db);
    const nina = rows.find((row) => row.counterpartyId === NINA && row.currency === "PLN");
    expect(nina?.oldestDate).toBe("2026-01-01");
    const [opening] = await s.sql<{ id: string }[]>`
      SELECT id FROM opening_debts WHERE counterparty_id = ${NINA} AND currency = 'PLN'`;
    expect(nina?.oldestUnconsumedTransactionId).toBe(opening?.id);
  });
});
