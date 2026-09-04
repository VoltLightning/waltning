/**
 * Proves: CLAUDE.md's "break it once to prove it fires", and SPEC.md §6.5
 * ("Integrity constraints" — "Enforced in the database, not merely the
 * application", naming nine of these thirteen CHECKs by name and SQL).
 *
 * Two claims, both about every CHECK constraint Postgres actually holds
 * today, read live from `pg_constraint` rather than assumed from
 * `schema.ts` or from §6.5's own list. Four of the thirteen are absent from
 * §6.5, for two different reasons: `transactions_counterparty_role_shape`
 * and `transactions_occurrence_shape` are declared in `schema.ts`'s own
 * `check(...)` calls but simply not named in §6.5's SQL block, while
 * `transactions_debt_shape` and `transactions_tax_fx_shape` postdate both —
 * they live only in the hand-written `0001_database_objects.sql` (from
 * `0004_business_logic_columns.sql`, folded in), missing from `schema.ts`
 * *and* §6.5. A list built by reading either alone would silently omit some
 * of the thirteen.
 *
 * Findings: none — the rule is CLAUDE.md's, not a review finding.
 *
 * 1. No CHECK is `NOT VALID` — a constraint declared but never validated
 *    against existing rows would pass every test here and refuse nothing on
 *    a database that already had bad data when it was added.
 * 2. Every CHECK on `transactions` actually fires: `CHECKS` below is a table
 *    of `{ name → a violating insert }`, and the test asserts its keys equal
 *    the live set from `pg_constraint` — so a new CHECK added to `schema.ts`
 *    without a breaking case here fails this file rather than shipping
 *    unverified.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "../test/scratch.ts";

const CURRENCY = { code: "PLN", name: "Polish Zloty", decimals: 2 };
const ACCOUNT = { id: "00000000-0000-4000-8000-000000000001", name: "Bank A · PLN" };
const TO_ACCOUNT = { id: "00000000-0000-4000-8000-000000000002", name: "Cash · PLN" };
const CATEGORY = { id: "00000000-0000-4000-8000-000000000003", name: "Placeholder category" };
const COUNTERPARTY = { id: "00000000-0000-4000-8000-000000000004", name: "Anna Placeholder" };

let s: Scratch;

beforeAll(async () => {
  s = await scratchDatabase("check_validated");
  await s.sql`insert into currencies (code, name, decimals, is_pivot)
    values (${CURRENCY.code}, ${CURRENCY.name}, ${CURRENCY.decimals}, true)`;
  await s.sql`insert into accounts (id, name, currency, ownership, is_business, opening_balance, kind)
    values (${ACCOUNT.id}, ${ACCOUNT.name}, ${CURRENCY.code}, 'own', false, '0', 'other'),
           (${TO_ACCOUNT.id}, ${TO_ACCOUNT.name}, ${CURRENCY.code}, 'own', false, '0', 'other')`;
  await s.sql`insert into categories (id, name, kind) values (${CATEGORY.id}, ${CATEGORY.name}, 'expense')`;
  await s.sql`insert into counterparties (id, name) values (${COUNTERPARTY.id}, ${COUNTERPARTY.name})`;
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

/** A minimal, otherwise-valid `expense` row — every check below overrides only what it needs to break. */
type Row = Record<string, string | boolean | null>;
const BASE: Row = {
  date: "2026-08-12",
  type: "expense",
  account_id: ACCOUNT.id,
  amount_original: "10.00",
  currency: CURRENCY.code,
  fx_rate: "1",
};

async function insertRow(overrides: Row): Promise<unknown> {
  const row: Row = { id: crypto.randomUUID(), ...BASE, ...overrides };
  const columns: string[] = Object.keys(row);
  return s.sql`insert into transactions ${s.sql(row, ...columns)}`;
}

/**
 * One violating insert per live CHECK on `transactions`, keyed by constraint
 * name. Every insert breaks *only* the named CHECK — every other column
 * stays inside every other CHECK's shape, so a failure here points at one
 * constraint, not a tangle of them.
 */
const CHECKS: Record<string, () => Promise<unknown>> = {
  // Negative and not an adjustment.
  transactions_amount_positive: () => insertRow({ amount_original: "-1.00" }),
  // to_account_id set on a non-transfer.
  transactions_transfer_shape: () => insertRow({ to_account_id: TO_ACCOUNT.id }),
  // A transfer into the account it left.
  transactions_transfer_distinct: () =>
    insertRow({
      type: "transfer",
      to_account_id: ACCOUNT.id,
      to_amount: "10.00",
      to_currency: CURRENCY.code,
      to_fx_rate: "1",
    }),
  // A transfer with no destination amount.
  transactions_to_amount_shape: () =>
    insertRow({
      type: "transfer",
      to_account_id: TO_ACCOUNT.id,
      to_currency: CURRENCY.code,
      to_fx_rate: "1",
    }),
  // A transfer that moves zero into the other leg.
  transactions_to_amount_positive: () =>
    insertRow({
      type: "transfer",
      to_account_id: TO_ACCOUNT.id,
      to_amount: "0.00",
      to_currency: CURRENCY.code,
      to_fx_rate: "1",
    }),
  // A transfer with no destination currency.
  transactions_to_currency_shape: () =>
    insertRow({
      type: "transfer",
      to_account_id: TO_ACCOUNT.id,
      to_amount: "10.00",
      to_fx_rate: "1",
    }),
  // A transfer with no destination FX rate.
  transactions_to_fx_rate_shape: () =>
    insertRow({
      type: "transfer",
      to_account_id: TO_ACCOUNT.id,
      to_amount: "10.00",
      to_currency: CURRENCY.code,
    }),
  // A category on a type that is neither income nor expense.
  transactions_category_shape: () => insertRow({ type: "adjustment", category_id: CATEGORY.id }),
  // A counterparty with no role.
  transactions_counterparty_role_shape: () => insertRow({ counterparty_id: COUNTERPARTY.id }),
  // An occurrence date with no recurring rule behind it.
  transactions_occurrence_shape: () => insertRow({ occurrence_date: "2026-08-12" }),
  // A debt amount with no debt currency.
  transactions_debt_shape: () => insertRow({ debt_amount: "5.00" }),
  // A zero fee — "no fee" is null, never zero.
  transactions_fee_positive: () => insertRow({ fee: "0.00" }),
  // A tax FX rate with no tax FX date.
  transactions_tax_fx_shape: () => insertRow({ tax_fx_rate: "1" }),
};

describe("every CHECK on transactions is VALID", () => {
  it("no CHECK constraint is left unvalidated", async () => {
    const rows = await s.sql<{ conname: string }[]>`
      select conname from pg_constraint where contype = 'c' and not convalidated`;
    expect(rows.map((r) => r.conname)).toEqual([]);
  });
});

describe("every CHECK on transactions breaks once", () => {
  it("CHECKS covers exactly today's live CHECK set on transactions", async () => {
    const rows = await s.sql<{ conname: string }[]>`
      select conname from pg_constraint
      where contype = 'c' and conrelid = 'transactions'::regclass`;
    const live = rows.map((r) => r.conname).sort();
    expect(Object.keys(CHECKS).sort()).toEqual(live);
  });

  for (const [name, violate] of Object.entries(CHECKS)) {
    it(`${name} refuses the row that violates it`, async () => {
      await expect(violate()).rejects.toThrow(new RegExp(name));
    });
  }
});
