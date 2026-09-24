/**
 * Proves: screens/S16 §3 ("every account wears its own") and `02-tokens`
 * §2.1b — `accounts_color_known` holds an account's colour to the nine
 * keys or none. A hex, or a name the ramp does not have, would
 * render in a colour nobody checked against either theme's ground, and could
 * put a kind's mark on an account of another kind.
 *
 * Findings: none — the rule is CLAUDE.md's, not a review finding.
 */
import { ACCOUNT_COLOR } from "@waltning/schema/enums";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "../test/scratch.ts";

const ACCOUNT = "00000000-0000-4000-8000-000000000011";

let s: Scratch;

beforeAll(async () => {
  s = await scratchDatabase("account_color");
  await s.sql`insert into currencies (code, name, decimals, is_pivot)
    values ('PLN', 'Polish Zloty', 2, true)`;
  await s.sql`insert into accounts (id, name, currency, ownership, is_business, opening_balance, kind)
    values (${ACCOUNT}, 'Bank A · PLN', 'PLN', 'own', false, '0', 'bank')`;
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

it("refuses a colour that is not one of the ramp's", async () => {
  await expect(s.sql`update accounts set color = '#ff00ff' where id = ${ACCOUNT}`).rejects.toThrow(
    /accounts_color_known/,
  );
});

it("accepts each of the nine, and none", async () => {
  for (const color of ACCOUNT_COLOR) {
    await s.sql`update accounts set color = ${color} where id = ${ACCOUNT}`;
  }
  await s.sql`update accounts set color = null where id = ${ACCOUNT}`;
  const [row] = await s.sql`select color from accounts where id = ${ACCOUNT}`;
  expect(row?.["color"]).toBeNull();
});
