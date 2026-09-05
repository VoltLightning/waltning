/**
 * Proves: SPEC.md §14.4b's two CHECKs outside `transactions` — CLAUDE.md's
 * "break it once to prove it fires", restated per table because
 * `check-validated.test.ts` already covers `transactions_brand_shape`
 * alongside every other CHECK on `transactions`. This file is the rest:
 * `recurring_transactions` (no write path exists yet, so the shape is
 * proved by direct SQL rather than through an executor) and `brand_aliases`.
 *
 * Findings: none — the rule is CLAUDE.md's, not a review finding.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "../test/scratch.ts";

const CURRENCY = { code: "PLN", name: "Polish Zloty", decimals: 2 };
const ACCOUNT = { id: "00000000-0000-4000-8000-000000000011", name: "Bank A · PLN" };

let s: Scratch;

beforeAll(async () => {
  s = await scratchDatabase("brand_shape");
  await s.sql`insert into currencies (code, name, decimals, is_pivot)
    values (${CURRENCY.code}, ${CURRENCY.name}, ${CURRENCY.decimals}, true)`;
  await s.sql`insert into accounts (id, name, currency, ownership, is_business, opening_balance, kind)
    values (${ACCOUNT.id}, ${ACCOUNT.name}, ${CURRENCY.code}, 'own', false, '0', 'other')`;
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

describe("recurring_transactions_brand_shape", () => {
  /**
   * The exact case the "`brand_source is not null and` is load-bearing"
   * comment (`packages/db/src/schema.ts`) exists for:
   * a CHECK that evaluates to `NULL` (not `false`) is admitted, not
   * refused, so a `brand_key` with no `brand_source` at all is the row a
   * naive three-value CHECK would let straight through.
   */
  it("refuses a brand_key with no brand_source", async () => {
    await expect(
      s.sql`insert into recurring_transactions
        (id, type, account_id, amount_original, currency, rrule, brand_key)
        values (
          ${crypto.randomUUID()}, 'expense', ${ACCOUNT.id}, '10.00', ${CURRENCY.code},
          'FREQ=MONTHLY', 'orlen'
        )`,
    ).rejects.toThrow(/recurring_transactions_brand_shape/);
  });

  it("refuses a brand_source with no brand_key", async () => {
    await expect(
      s.sql`insert into recurring_transactions
        (id, type, account_id, amount_original, currency, rrule, brand_source)
        values (
          ${crypto.randomUUID()}, 'expense', ${ACCOUNT.id}, '10.00', ${CURRENCY.code},
          'FREQ=MONTHLY', 'auto'
        )`,
    ).rejects.toThrow(/recurring_transactions_brand_shape/);
  });

  /** A `brand_key` paired with `'none'` is refused as well — `'none'` names a row with no key, by definition. */
  it("refuses a brand_key paired with 'none'", async () => {
    await expect(
      s.sql`insert into recurring_transactions
        (id, type, account_id, amount_original, currency, rrule, brand_key, brand_source)
        values (
          ${crypto.randomUUID()}, 'expense', ${ACCOUNT.id}, '10.00', ${CURRENCY.code},
          'FREQ=MONTHLY', 'orlen', 'none'
        )`,
    ).rejects.toThrow(/recurring_transactions_brand_shape/);
  });

  it("admits a resolved brand (key + 'auto' or 'manual')", async () => {
    await s.sql`insert into recurring_transactions
      (id, type, account_id, amount_original, currency, rrule, brand_key, brand_source)
      values (
        ${crypto.randomUUID()}, 'expense', ${ACCOUNT.id}, '10.00', ${CURRENCY.code},
        'FREQ=MONTHLY', 'orlen', 'auto'
      )`;
    await s.sql`insert into recurring_transactions
      (id, type, account_id, amount_original, currency, rrule, brand_key, brand_source)
      values (
        ${crypto.randomUUID()}, 'expense', ${ACCOUNT.id}, '10.00', ${CURRENCY.code},
        'FREQ=MONTHLY', 'youtube', 'manual'
      )`;
  });

  it("admits a deliberate 'no brand' (null key, 'none' source)", async () => {
    await s.sql`insert into recurring_transactions
      (id, type, account_id, amount_original, currency, rrule, brand_source)
      values (
        ${crypto.randomUUID()}, 'expense', ${ACCOUNT.id}, '10.00', ${CURRENCY.code},
        'FREQ=MONTHLY', 'none'
      )`;
  });

  it("admits both absent (never matched)", async () => {
    await s.sql`insert into recurring_transactions
      (id, type, account_id, amount_original, currency, rrule)
      values (${crypto.randomUUID()}, 'expense', ${ACCOUNT.id}, '10.00', ${CURRENCY.code}, 'FREQ=MONTHLY')`;
  });
});

describe("brand_aliases", () => {
  it("refuses a blank alias", async () => {
    await expect(
      s.sql`insert into brand_aliases (alias, brand_key) values ('   ', 'orlen')`,
    ).rejects.toThrow(/brand_aliases_alias_not_blank/);
  });

  it("refuses a blank brand_key", async () => {
    await expect(
      s.sql`insert into brand_aliases (alias, brand_key) values ('orlen', '   ')`,
    ).rejects.toThrow(/brand_aliases_key_not_blank/);
  });

  it("admits a real alias, once — the primary key is 'one non-blank alias wins'", async () => {
    await s.sql`insert into brand_aliases (alias, brand_key) values ('orlen', 'orlen')`;
    await expect(
      s.sql`insert into brand_aliases (alias, brand_key) values ('orlen', 'someone-else')`,
    ).rejects.toThrow(/duplicate key/);
  });
});
