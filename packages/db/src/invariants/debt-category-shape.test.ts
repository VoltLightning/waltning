/**
 * Proves: SPEC.md §6.6 — a row filed under one of the four debt categories
 * carries the `debt` role and a person on the other side, and the database
 * says so (WA022, `0025_debt_categories.sql`), whatever the application did.
 *
 * Also the migration's backfill: rows under the four that name a person become
 * debts on that person, rows that name nobody are left alone, and a second run
 * changes nothing.
 *
 * Findings: Opus review of the debt-categories PR (C — enforce on both engines).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEBT_SEED_KEYS } from "@waltning/core/taxonomy";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "../test/scratch.ts";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const NINA = "22222222-2222-4222-8222-222222222222";
const BORROWED = "33333333-3333-4333-8333-333333333331";
const SALARY = "33333333-3333-4333-8333-333333333332";
/** A category a person made and called Borrowed: no seed tag, so not a debt. */
const OWN_BORROWED = "33333333-3333-4333-8333-333333333333";

let s: Scratch;

beforeAll(async () => {
  s = await scratchDatabase("debt_category_shape");
  await s.sql.unsafe(`
    INSERT INTO currencies (code, name, is_pivot, decimals) VALUES ('PLN', 'Zloty', true, 2);
    INSERT INTO accounts (id, name, kind, currency, ownership)
      VALUES ('${ACCOUNT}', 'Bank A · PLN', 'bank', 'PLN', 'own');
    INSERT INTO counterparties (id, name, kind) VALUES ('${NINA}', 'Nina', 'person');
    INSERT INTO categories (id, name, kind, is_leaf, external_id)
      VALUES ('${BORROWED}', 'Money from friends', 'income', true, 'seed:borrowed');
    INSERT INTO categories (id, name, kind, is_leaf, external_id)
      VALUES ('${SALARY}', 'Salary', 'income', true, 'seed:salary');
    INSERT INTO categories (id, name, kind, is_leaf)
      VALUES ('${OWN_BORROWED}', 'Borrowed', 'income', true);`);
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
    return (error as { code?: string }).code ?? "unknown";
  }
}

let n = 0;
const nextId = () => `77777777-7777-4777-8777-${String(++n).padStart(12, "0")}`;

function insert(category: string, obligation: string): Promise<unknown> {
  return s.sql.unsafe(`
    INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate, category_id
      ${obligation === "" ? "" : ", obligation_counterparty_id, obligation_role"})
    VALUES ('${nextId()}', '${ACCOUNT}', '2026-01-01', 'income', 10, 'PLN', 1, '${category}'
      ${obligation === "" ? "" : `, ${obligation}`})`);
}

describe("a debt category is a debt (WA022)", () => {
  it("refuses a row under Borrowed with no debt", async () => {
    expect(await refusal(() => insert(BORROWED, ""))).toBe("WA022");
  });

  it("refuses a row under Borrowed with the debt role and nobody named", async () => {
    expect(await refusal(() => insert(BORROWED, "NULL, 'debt'"))).toBe("WA022");
  });

  it("refuses a row under Borrowed with a person and a role other than debt", async () => {
    expect(await refusal(() => insert(BORROWED, `'${NINA}', 'contribution'`))).toBe("WA022");
  });

  it("admits a row under Borrowed that is a debt on a person", async () => {
    expect(await refusal(() => insert(BORROWED, `'${NINA}', 'debt'`))).toBeNull();
  });

  it("admits any other category, and an untagged one called Borrowed", async () => {
    expect(await refusal(() => insert(SALARY, ""))).toBeNull();
    expect(await refusal(() => insert(OWN_BORROWED, ""))).toBeNull();
  });

  it("refuses moving a plain row into a debt category, and clearing the debt under one", async () => {
    const plain = nextId();
    await s.sql.unsafe(`
      INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate, category_id)
      VALUES ('${plain}', '${ACCOUNT}', '2026-01-02', 'income', 10, 'PLN', 1, '${SALARY}')`);
    expect(
      await refusal(() =>
        s.sql.unsafe(`UPDATE transactions SET category_id = '${BORROWED}' WHERE id = '${plain}'`),
      ),
    ).toBe("WA022");

    const debt = nextId();
    await s.sql.unsafe(`
      INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate,
        category_id, obligation_counterparty_id, obligation_role)
      VALUES ('${debt}', '${ACCOUNT}', '2026-01-02', 'income', 10, 'PLN', 1, '${BORROWED}', '${NINA}', 'debt')`);
    expect(
      await refusal(() =>
        s.sql.unsafe(
          `UPDATE transactions SET obligation_counterparty_id = NULL, obligation_role = NULL WHERE id = '${debt}'`,
        ),
      ),
    ).toBe("WA022");
  });

  it("does not reach an unrelated edit to a legacy row that names nobody", async () => {
    const legacy = nextId();
    await s.sql.unsafe(`ALTER TABLE transactions DISABLE TRIGGER transactions_debt_category_shape`);
    await s.sql.unsafe(`
      INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate, category_id)
      VALUES ('${legacy}', '${ACCOUNT}', '2026-01-03', 'income', 10, 'PLN', 1, '${BORROWED}')`);
    await s.sql.unsafe(`ALTER TABLE transactions ENABLE TRIGGER transactions_debt_category_shape`);
    expect(
      await refusal(() =>
        s.sql.unsafe(`UPDATE transactions SET note = 'a note' WHERE id = '${legacy}'`),
      ),
      "a note edit is not the trigger's business",
    ).toBeNull();
  });

  it("names the same four seed keys the core list does", () => {
    const sql = readFileSync(
      fileURLToPath(new URL("../../drizzle/0025_debt_categories.sql", import.meta.url)),
      "utf8",
    );
    for (const key of DEBT_SEED_KEYS) expect(sql).toContain(`'seed:${key}'`);
  });
});

describe("the backfill — existing rows with a person become debts", () => {
  const backfill = readFileSync(
    fileURLToPath(new URL("../../drizzle/0025_debt_categories.sql", import.meta.url)),
    "utf8",
  )
    .split("--> statement-breakpoint")[0]
    ?.split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  it("converts a row that names a person, leaves one that names nobody, and is idempotent", async () => {
    const withPerson = nextId();
    const withoutPerson = nextId();
    await s.sql.unsafe(`ALTER TABLE transactions DISABLE TRIGGER transactions_debt_category_shape`);
    await s.sql.unsafe(`
      INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate, category_id, counterparty_id)
      VALUES ('${withPerson}', '${ACCOUNT}', '2026-02-01', 'income', 10, 'PLN', 1, '${BORROWED}', '${NINA}');
      INSERT INTO transactions (id, account_id, date, type, amount_original, currency, fx_rate, category_id)
      VALUES ('${withoutPerson}', '${ACCOUNT}', '2026-02-01', 'income', 10, 'PLN', 1, '${BORROWED}')`);
    await s.sql.unsafe(`ALTER TABLE transactions ENABLE TRIGGER transactions_debt_category_shape`);

    expect(backfill, "the migration's first statement").toContain("UPDATE transactions");
    await s.sql.unsafe(backfill ?? "");
    const after = async (id: string) =>
      (
        await s.sql.unsafe(
          `SELECT obligation_counterparty_id AS who, obligation_role AS role FROM transactions WHERE id = '${id}'`,
        )
      )[0];
    expect(await after(withPerson)).toEqual({ who: NINA, role: "debt" });
    expect(await after(withoutPerson)).toEqual({ who: null, role: null });

    const again = await s.sql.unsafe(backfill ?? "");
    expect(again.count, "a second run finds nothing left to convert").toBe(0);
  });
});
