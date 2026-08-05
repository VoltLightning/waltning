/**
 * Money Manager JSON → Postgres.
 *
 * Imports the taxonomy of accounts, the 498 income rows, and opening balances.
 * Expenses and transfers stay behind (SPEC.md §8.0).
 *
 * Opening balance is *derived*, not entered:
 *
 *     opening = computed_balance − Σ(imported income for that account)
 *
 * so the account's balance after import equals what Money Manager reports,
 * without importing five years of rows to get there.
 *
 * Idempotent on Money Manager's ZUID via the partial unique indexes on
 * `external_id`, so re-running against a later backup upserts.
 *
 * Usage:  pnpm mm:import [path-to-export.json]
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { and, eq, sql } from "drizzle-orm";
import { createDb } from "@waltning/db";
import {
  accountGroups,
  accounts,
  categories,
  currencies,
  fxRates,
  transactions,
} from "@waltning/db/schema";
import { Decimal } from "decimal.js";

const rootEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const db = createDb();

/**
 * Income category mapping (TAXONOMY.md §4). `null` means deliberately not
 * migrated — `Base saving` and `Allowance` were transfers recorded as income,
 * so importing them would invent earnings that never existed.
 */
const INCOME_MAP: Record<string, string | null> = {
  Salary: "seed:employment.salary",
  Bonus: "seed:employment.bonus-equity",
  Gift: "seed:other-inflows.gift-received",
  Debt: "seed:other-inflows.repayment-received",
  "My debt": "seed:other-inflows.repayment-received",
  Other: "seed:other-inflows.other-inflow",
  "Petty cash": "seed:other-inflows.other-inflow",
  "Base saving": null,
  Allowance: null,
};

type Export = {
  accounts: {
    external_id: string;
    name: string;
    currency: string;
    group: string;
    kind: string;
    ownership: "own" | "shared";
    memo: string;
    sort: number;
    computed_balance: number;
  }[];
  income: {
    external_id: string;
    date: string;
    account: string;
    category_path: string;
    amount: number;
    amount_usd: number;
    payee: string;
    note: string;
  }[];
};

async function main() {
  const path = process.argv[2] ?? "/tmp/mm-export.json";
  const data = JSON.parse(readFileSync(path, "utf8")) as Export;

  const pivot = (
    await db
      .select({ code: currencies.code })
      .from(currencies)
      .where(eq(currencies.isPivot, true))
      .limit(1)
  )[0]?.code;
  if (!pivot) throw new Error("no pivot currency — run the seed first");

  const known = new Set(
    (await db.select({ code: currencies.code }).from(currencies)).map((c) => c.code),
  );

  /* ---- groups ---------------------------------------------------------- */
  const groupIds = new Map<string, string>();
  for (const name of new Set(data.accounts.map((a) => a.group).filter(Boolean))) {
    const found = await db
      .select({ id: accountGroups.id })
      .from(accountGroups)
      .where(sql`lower(btrim(${accountGroups.name})) = lower(btrim(${name}))`)
      .limit(1);
    if (found[0]) groupIds.set(name, found[0].id);
    else {
      const [row] = await db
        .insert(accountGroups)
        .values({ name })
        .returning({ id: accountGroups.id });
      groupIds.set(name, row!.id);
    }
  }

  /* ---- accounts (opening balance filled in after income) ---------------- */
  const accountIds = new Map<string, string>();
  let skippedAccounts = 0;
  for (const a of data.accounts) {
    if (!a.currency || !known.has(a.currency)) {
      console.warn(`  ! ${a.name}: unknown currency ${a.currency} — skipped`);
      skippedAccounts++;
      continue;
    }
    const existing = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.externalId, a.external_id))
      .limit(1);

    const values = {
      name: a.name,
      kind: a.kind as never,
      currency: a.currency,
      groupId: a.group ? (groupIds.get(a.group) ?? null) : null,
      ownership: a.ownership,
      memo: a.memo,
      sort: a.sort,
      externalId: a.external_id,
    };

    if (existing[0]) {
      await db.update(accounts).set(values).where(eq(accounts.id, existing[0].id));
      accountIds.set(a.external_id, existing[0].id);
    } else {
      const [row] = await db
        .insert(accounts)
        .values(values)
        .returning({ id: accounts.id });
      accountIds.set(a.external_id, row!.id);
    }
  }

  /* ---- income ---------------------------------------------------------- */
  const catIds = new Map<string, string>();
  for (const key of new Set(Object.values(INCOME_MAP).filter(Boolean) as string[])) {
    const row = (
      await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.externalId, key))
        .limit(1)
    )[0];
    if (!row) throw new Error(`seed category missing: ${key} — run the seed`);
    catIds.set(key, row.id);
  }

  /** Rate converting `ccy` into the pivot on `date`. */
  const rateCache = new Map<string, string>();
  async function pivotRate(ccy: string, date: string): Promise<string | null> {
    if (ccy === pivot) return "1";
    const k = `${ccy}|${date}`;
    if (rateCache.has(k)) return rateCache.get(k)!;
    const row = (
      await db
        .select({ rate: fxRates.rate })
        .from(fxRates)
        .where(
          and(
            eq(fxRates.base, pivot!),
            eq(fxRates.quote, ccy),
            eq(fxRates.date, date),
          ),
        )
        .limit(1)
    )[0];
    if (!row) return null;
    // Stored as units of `ccy` per 1 pivot; we want pivot per unit of `ccy`.
    const inv = new Decimal(1).div(row.rate).toFixed(12);
    rateCache.set(k, inv);
    return inv;
  }

  const imported = new Map<string, Decimal>(); // account external id → Σ amount
  let inserted = 0;
  let skippedCategory = 0;
  let missingRate = 0;
  let driftMax = new Decimal(0);

  for (const t of data.income) {
    const head = t.category_path.split(">")[0]!.trim();
    if (!(head in INCOME_MAP)) {
      console.warn(`  ! unmapped income category "${head}" — skipped`);
      skippedCategory++;
      continue;
    }
    // null = deliberately not migrated; undefined cannot occur after the `in`
    // check above, but TypeScript does not narrow index access from it.
    const key = INCOME_MAP[head];
    if (!key) {
      skippedCategory++;
      continue;
    }
    const accountId = accountIds.get(t.account);
    if (!accountId) continue;

    const acct = data.accounts.find((a) => a.external_id === t.account)!;
    const rate = await pivotRate(acct.currency, t.date);
    if (rate === null) {
      missingRate++;
      continue;
    }

    const amount = new Decimal(t.amount).abs();
    const pivotAmount = amount.times(rate);

    // Money Manager's own USD figure used one global, undated rate. Divergence
    // here is expected and is the FX correction (§6.1), not an error — but it
    // is worth knowing how large it gets.
    if (t.amount_usd) {
      const drift = pivotAmount.minus(Math.abs(t.amount_usd)).abs();
      if (drift.gt(driftMax)) driftMax = drift;
    }

    const values = {
      date: t.date,
      type: "income" as const,
      accountId,
      categoryId: catIds.get(key)!,
      amountOriginal: amount.toFixed(8),
      currency: acct.currency,
      fxRate: rate,
      amountPivot: pivotAmount.toFixed(8),
      payee: t.payee,
      note: t.note,
      source: "migration" as const,
      externalId: t.external_id,
    };

    await db
      .insert(transactions)
      .values(values)
      .onConflictDoUpdate({ target: transactions.externalId, set: values });

    imported.set(
      t.account,
      (imported.get(t.account) ?? new Decimal(0)).plus(amount),
    );
    inserted++;
  }

  /* ---- opening balances ------------------------------------------------- */
  let withOpening = 0;
  for (const a of data.accounts) {
    const id = accountIds.get(a.external_id);
    if (!id) continue;
    const opening = new Decimal(a.computed_balance).minus(
      imported.get(a.external_id) ?? 0,
    );
    await db
      .update(accounts)
      .set({
        openingBalance: opening.toFixed(8),
        openingDate: "2020-11-24", // the day before the first transaction
      })
      .where(eq(accounts.id, id));
    if (!opening.isZero()) withOpening++;
  }

  console.log("\nimported");
  console.log(`  accounts          ${accountIds.size}${skippedAccounts ? ` (${skippedAccounts} skipped)` : ""}`);
  console.log(`  income rows       ${inserted}`);
  console.log(`  skipped by map    ${skippedCategory}  (Base saving / Allowance are transfers)`);
  if (missingRate) console.log(`  ! missing FX      ${missingRate}`);
  console.log(`  opening balances  ${withOpening} non-zero`);
  console.log(`  max FX drift vs Money Manager's stale global rate: ${driftMax.toFixed(2)}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
