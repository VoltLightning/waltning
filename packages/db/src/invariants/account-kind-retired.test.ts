/**
 * Proves: SPEC.md §6.6 — money a person owes you is a debt on that person,
 * so `loan_receivable` is retired for new accounts (WA021). An active one is
 * refused as it is created or brought back; an archived one — a converted
 * account, copied by insert when a device syncs down — still goes in.
 *
 * Findings: none — the rule is CLAUDE.md's, not a review finding.
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "../test/scratch.ts";

const BANK = "00000000-0000-4000-8000-000000000021";
const LENT = "00000000-0000-4000-8000-000000000022";

let s: Scratch;

beforeAll(async () => {
  s = await scratchDatabase("account_kind_retired");
  await s.sql`insert into currencies (code, name, decimals, is_pivot)
    values ('PLN', 'Polish Zloty', 2, true)`;
  await s.sql`insert into accounts (id, name, currency, ownership, is_business, opening_balance, kind)
    values (${BANK}, 'Bank A · PLN', 'PLN', 'own', false, '0', 'bank')`;
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

it("refuses a new, active loan-receivable account", async () => {
  await expect(
    s.sql`insert into accounts (id, name, currency, ownership, is_business, opening_balance, kind)
      values (${LENT}, 'Lent to a friend', 'PLN', 'own', false, '0', 'loan_receivable')`,
  ).rejects.toThrow(/loan_receivable is retired/);
});

it("refuses switching an account to the kind", async () => {
  await expect(
    s.sql`update accounts set kind = 'loan_receivable' where id = ${BANK}`,
  ).rejects.toThrow(/loan_receivable is retired/);
});

it("accepts an archived one — a converted account, synced down by insert", async () => {
  await s.sql`insert into accounts (id, name, currency, ownership, is_business, opening_balance, kind, archived)
    values (${LENT}, 'Lent to a friend', 'PLN', 'own', false, '0', 'loan_receivable', true)`;
  await expect(
    s.sql`update accounts set archived = false where id = ${LENT}`,
    "but not brought back",
  ).rejects.toThrow(/loan_receivable is retired/);
});
