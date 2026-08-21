/**
 * Development fixture — a ledger with something in it.
 *
 * `seed/run.ts` loads **reference** data: currencies and the category tree.
 * That is the right split, because reference data is real and belongs in every
 * database including the Pi's. This file is the other thing: accounts and
 * transactions to look at while building a screen, which must never reach a
 * real ledger.
 *
 * **Every name here is invented.** This is a public repository and the ledger it
 * is built for is not; `Bank A`, `Card B` and a payee called `Grocer` are the
 * whole cast. No amount, payee or account name corresponds to anything.
 *
 * Idempotent, like the seed: everything keys on a stable `fixture:` external id,
 * so a second run updates rather than duplicating. Deliberately *not* wired into
 * `db:reset` — a fixture that arrives automatically is a fixture someone
 * eventually mistakes for their own data.
 *
 *   pnpm db:fixture          add it
 *   pnpm db:fixture --drop   take it away again
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { money } from "@waltning/core";
import { eq, isNotNull, like, sql } from "drizzle-orm";
import { createDb } from "../client.ts";
import { accounts, categories, transactions } from "../schema.ts";

const rootEnv = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const db = createDb();

const PREFIX = "fixture:";

/**
 * Rates to the pivot, as `amount_original × fx_rate = amount_pivot`.
 *
 * Fixed rather than fetched: a fixture that depends on the network is a fixture
 * that fails on a train, and the figures only have to be plausible.
 */
const TO_PIVOT: Record<string, string> = {
  USD: "1.000000000000",
  PLN: "0.250000000000",
  EUR: "1.080000000000",
};

type FixtureAccount = {
  ref: string;
  name: string;
  currency: string;
  kind: "bank" | "cash" | "card" | "deposit";
  openingBalance: string;
};

const ACCOUNTS: FixtureAccount[] = [
  { ref: "bank-a", name: "Bank A", currency: "PLN", kind: "bank", openingBalance: "8400.00" },
  { ref: "bank-b", name: "Bank B", currency: "USD", kind: "deposit", openingBalance: "2500.00" },
  { ref: "card-a", name: "Card A", currency: "EUR", kind: "card", openingBalance: "0.00" },
  { ref: "cash", name: "Cash", currency: "PLN", kind: "cash", openingBalance: "300.00" },
];

/** Payee, category leaf, amount, and which account it lands on. */
type Pattern = {
  payee: string;
  category: string;
  type: "income" | "expense";
  account: string;
  amounts: string[];
};

const PATTERNS: Pattern[] = [
  {
    payee: "Employer",
    category: "Salary",
    type: "income",
    account: "bank-a",
    amounts: ["14200.00"],
  },
  {
    payee: "Grocer",
    category: "Groceries",
    type: "expense",
    account: "bank-a",
    amounts: ["184.30", "212.75", "96.40", "310.15"],
  },
  {
    payee: "Transit",
    category: "Public transport",
    type: "expense",
    account: "cash",
    amounts: ["26.00", "26.00"],
  },
  {
    payee: "Cafe",
    category: "Eating out",
    type: "expense",
    account: "cash",
    amounts: ["18.00", "22.50", "18.00"],
  },
  { payee: "Landlord", category: "Rent", type: "expense", account: "bank-a", amounts: ["3200.00"] },
  {
    payee: "Utility Co",
    category: "Utilities",
    type: "expense",
    account: "bank-a",
    amounts: ["287.60"],
  },
  {
    payee: "Cloud Host",
    category: "Software & tools",
    type: "expense",
    account: "card-a",
    amounts: ["12.00", "12.00"],
  },
  {
    payee: "Pharmacy",
    category: "Pharmacy",
    type: "expense",
    account: "bank-a",
    amounts: ["64.90"],
  },
  {
    payee: "Client One",
    category: "Services",
    type: "income",
    account: "bank-b",
    amounts: ["1800.00"],
  },
];

/**
 * A leaf id by name, or `null`.
 *
 * A fixture must not invent taxonomy: the category tree is reference data with
 * its own rules (`TAXONOMY.md` R1 — a category is a group **or** a leaf), and a
 * fixture that created missing ones would be seeding a second tree. Every name
 * in `PATTERNS` is checked against the real seed; `null` here means one was
 * renamed, and the transaction simply arrives uncategorised.
 */
async function leafId(name: string): Promise<string | null> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, name))
    .limit(1);
  return row?.id ?? null;
}

/** Bare `YYYY-MM-DD`, walked back by whole days. No `Date` arithmetic on it. */
function dayBefore(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) - days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

async function drop(): Promise<void> {
  await db.delete(transactions).where(like(transactions.externalId, `${PREFIX}%`));
  await db.delete(accounts).where(like(accounts.externalId, `${PREFIX}%`));
  console.log("fixture removed");
}

async function apply(today: string): Promise<void> {
  const accountIds = new Map<string, string>();

  for (const a of ACCOUNTS) {
    const externalId = `${PREFIX}${a.ref}`;
    const [row] = await db
      .insert(accounts)
      .values({
        externalId,
        name: a.name,
        currency: a.currency,
        kind: a.kind,
        openingBalance: money.toMoney(a.openingBalance),
      })
      .onConflictDoUpdate({
        target: accounts.externalId,
        // The index is **partial** (`WHERE external_id IS NOT NULL`), so the
        // predicate has to be restated here or Postgres cannot match the
        // conflict target to it — "no unique or exclusion constraint matching
        // the ON CONFLICT specification", which reads like a missing index.
        targetWhere: isNotNull(accounts.externalId),
        set: {
          name: a.name,
          currency: a.currency,
          openingBalance: money.toMoney(a.openingBalance),
        },
      })
      .returning({ id: accounts.id });

    if (!row) throw new Error(`account upsert returned nothing: ${a.name}`);
    accountIds.set(a.ref, row.id);
  }

  let written = 0;
  let day = 0;

  // Walked backwards from today so the list always has something recent in it,
  // and so `period spend` has a partial current month to work with.
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const pattern of PATTERNS) {
      const accountId = accountIds.get(pattern.account);
      const account = ACCOUNTS.find((a) => a.ref === pattern.account);
      if (!accountId || !account) continue;

      const categoryId = await leafId(pattern.category);

      for (const [index, amount] of pattern.amounts.entries()) {
        day += 1;
        const externalId = `${PREFIX}${pattern.account}-${pattern.payee}-${cycle}-${index}`;

        await db
          .insert(transactions)
          .values({
            externalId,
            date: dayBefore(today, day),
            type: pattern.type,
            accountId,
            categoryId,
            amountOriginal: money.toMoney(amount),
            currency: account.currency,
            fxRate: TO_PIVOT[account.currency] ?? "1.000000000000",
            payee: pattern.payee,
          })
          .onConflictDoUpdate({
            target: transactions.externalId,
            // Two conditions, not one: uniqueness on transactions applies only
            // to **live** rows, so a soft-deleted import can be re-imported
            // rather than blocked forever by its own tombstone. The predicate
            // must match the index exactly or Postgres will not use it.
            // Written as raw SQL rather than `and(...)`, which is typed
            // `SQL | undefined` because it collapses when every operand is
            // undefined — and `targetWhere` will not take an optional under
            // `exactOptionalPropertyTypes`.
            targetWhere: sql`${transactions.externalId} is not null and ${transactions.deletedAt} is null`,
            set: { amountOriginal: money.toMoney(amount), date: dayBefore(today, day) },
          });
        written += 1;
      }
    }
  }

  console.log(`fixture applied: ${ACCOUNTS.length} accounts, ${written} transactions`);
  console.log("  every name invented — this is placeholder data, not a ledger");
}

const today = new Date().toISOString().slice(0, 10);
if (process.argv.includes("--drop")) await drop();
else await apply(today);
process.exit(0);
