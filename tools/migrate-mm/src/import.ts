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
import { createDb, requireRow } from "@waltning/db";
import {
  accountGroups,
  accountKind,
  accounts,
  categories,
  currencies,
  fxRates,
  transactions,
} from "@waltning/db/schema";
import { Decimal } from "decimal.js";
import { and, eq, sql } from "drizzle-orm";

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

/**
 * The extractor reads `kind` out of JSON, where everything is a string. It was
 * forced into the enum column with `as never`, which is not a narrowing so much
 * as a way of telling the compiler to stop asking — an unrecognised kind went
 * straight to Postgres and failed there, or worse, matched something.
 *
 * Deriving the union from `accountKind.enumValues` means adding a kind to the
 * schema updates this automatically, and a kind the schema has never heard of
 * stops the import with the value named. H31 established the principle for
 * currencies: throw rather than skip, because skipping produced a wrong balance
 * that reconciled.
 */
type AccountKind = (typeof accountKind.enumValues)[number];

function toAccountKind(value: string): AccountKind {
  const kinds: readonly string[] = accountKind.enumValues;
  if (!kinds.includes(value)) {
    throw new Error(
      `unknown account kind "${value}" — the extractor's map and the schema disagree. ` +
        `Known kinds: ${kinds.join(", ")}`,
    );
  }
  return value as AccountKind;
}

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
  // Captured after the guard because narrowing does not follow `pivot` into
  // the nested `pivotRate` closure below — which is why both uses there had
  // grown a `!`. One named constant answers it once instead.
  const pivotCode: string = pivot;

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
      const rows = await db
        .insert(accountGroups)
        .values({ name })
        .returning({ id: accountGroups.id });
      groupIds.set(name, requireRow(rows, `account group "${name}"`).id);
    }
  }

  /* ---- accounts (opening balance filled in after income) ---------------- */
  const accountIds = new Map<string, string>();
  for (const a of data.accounts) {
    if (!a.currency || !known.has(a.currency)) {
      // Not a warning. Skipping the account silently drops every row that
      // references it, and the opening-balance plug then absorbs the difference
      // so the verification gate still reconciles — a wrong balance that looks
      // right. The probe reports the currencies actually in use (7 in this
      // backup); an unseeded one is a seeding bug, and the fix is to seed it,
      // not to import a partial ledger.
      throw new Error(
        `${a.name}: currency ${a.currency ?? "(none)"} is not seeded. ` +
          `Seed it before importing — skipping the account would drop its ` +
          `transactions and let the opening-balance plug hide the gap. ` +
          `Run tools/migrate-mm/probe.py §5 for the full list.`,
      );
    }
    const existing = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.externalId, a.external_id))
      .limit(1);

    const values = {
      name: a.name,
      kind: toAccountKind(a.kind),
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
      const rows = await db.insert(accounts).values(values).returning({ id: accounts.id });
      accountIds.set(a.external_id, requireRow(rows, `account "${a.name}"`).id);
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

  /**
   * Rate converting `ccy` into the pivot on `date`.
   *
   * Falls back to the nearest available rate when the date has none — the
   * carry cap (§7.7) deliberately leaves holes where a source died, and a
   * missing rate must never cost us the transaction (§7.6). The fallback is
   * reported so the row can carry `fx_rate_estimated`.
   */
  const rateCache = new Map<string, { rate: string; estimated: boolean }>();
  async function pivotRate(
    ccy: string,
    date: string,
  ): Promise<{ rate: string; estimated: boolean } | null> {
    if (ccy === pivot) return { rate: "1", estimated: false };
    const k = `${ccy}|${date}`;
    const hit = rateCache.get(k);
    if (hit) return hit;

    const exact = (
      await db
        .select({ rate: fxRates.rate })
        .from(fxRates)
        .where(and(eq(fxRates.base, pivotCode), eq(fxRates.quote, ccy), eq(fxRates.date, date)))
        .limit(1)
    )[0];

    // Nearest by absolute distance in either direction — a rate from three
    // days later is a better estimate than one from four years earlier.
    const row =
      exact ??
      (
        await db
          .select({ rate: fxRates.rate })
          .from(fxRates)
          .where(and(eq(fxRates.base, pivotCode), eq(fxRates.quote, ccy)))
          .orderBy(sql`abs(${fxRates.date} - ${date}::date)`)
          .limit(1)
      )[0];
    if (!row) return null;

    // Stored as units of `ccy` per 1 pivot; we want pivot per unit of `ccy`.
    const out = {
      rate: new Decimal(1).div(row.rate).toFixed(12),
      estimated: !exact,
    };
    rateCache.set(k, out);
    return out;
  }

  const imported = new Map<string, Decimal>(); // account external id → Σ amount
  let inserted = 0;
  let skippedCategory = 0;
  let missingRate = 0;
  let estimated = 0;
  let driftMax = new Decimal(0);

  for (const t of data.income) {
    // Destructured with a default rather than asserted: `split` always yields
    // at least one element, but saying so with `!` is a claim the compiler
    // cannot check, and an empty path should read as unmapped rather than crash.
    const [rawHead = ""] = t.category_path.split(">");
    const head = rawHead.trim();
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

    // `accountIds` was built from `data.accounts`, so a match must exist — but
    // "must" is the word this codebase has learned to distrust. If the two ever
    // disagree, say so with the id rather than crashing on a missing property.
    const acct = data.accounts.find((a) => a.external_id === t.account);
    if (!acct) throw new Error(`income row references unknown account ${t.account}`);
    const fx = await pivotRate(acct.currency, t.date);
    // Only reachable when a currency has no rate at all — nothing to estimate
    // from. Reported rather than swallowed.
    if (fx === null) {
      console.warn(`  ! no rate at all for ${acct.currency} — row skipped`);
      missingRate++;
      continue;
    }
    if (fx.estimated) estimated++;

    const amount = new Decimal(t.amount).abs();
    const pivotAmount = amount.times(fx.rate);

    // Money Manager's own USD figure used one global, undated rate. Divergence
    // here is expected and is the FX correction (§6.1), not an error — but it
    // is worth knowing how large it gets.
    if (t.amount_usd) {
      const drift = pivotAmount.minus(Math.abs(t.amount_usd)).abs();
      if (drift.gt(driftMax)) driftMax = drift;
    }

    const categoryId = catIds.get(key);
    if (!categoryId) throw new Error(`no seeded category for "${key}" — run the seed`);

    const values = {
      date: t.date,
      type: "income" as const,
      accountId,
      categoryId,
      amountOriginal: amount.toFixed(8),
      currency: acct.currency,
      fxRate: fx.rate,
      fxRateEstimated: fx.estimated,
      // amountPivot is GENERATED ALWAYS (§7.4) — Postgres computes it.
      payee: t.payee,
      note: t.note,
      source: "migration" as const,
      externalId: t.external_id,
    };

    await db
      .insert(transactions)
      .values(values)
      // The index is PARTIAL (`WHERE external_id is not null and deleted_at is
      // null`); Postgres cannot infer it without the matching predicate, so
      // without targetWhere this throws 42P10 on the first row — and §8.3 calls
      // this the mechanism that makes re-migration idempotent.
      .onConflictDoUpdate({
        target: transactions.externalId,
        targetWhere: sql`${transactions.externalId} is not null and ${transactions.deletedAt} is null`,
        set: values,
      });

    imported.set(t.account, (imported.get(t.account) ?? new Decimal(0)).plus(amount));
    inserted++;
  }

  /* ---- opening balances ------------------------------------------------- */
  let withOpening = 0;
  for (const a of data.accounts) {
    const id = accountIds.get(a.external_id);
    if (!id) continue;
    const opening = new Decimal(a.computed_balance).minus(imported.get(a.external_id) ?? 0);
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
  console.log(`  accounts          ${accountIds.size}`);
  console.log(`  income rows       ${inserted}`);
  console.log(`  skipped by map    ${skippedCategory}  (Base saving / Allowance are transfers)`);
  if (estimated)
    console.log(
      `  estimated FX      ${estimated}  (no published rate for the date; nearest used, flagged on the row)`,
    );
  if (missingRate) console.log(`  ! no rate at all  ${missingRate}  — rows skipped`);
  console.log(`  opening balances  ${withOpening} non-zero`);
  console.log(`  max FX drift vs Money Manager's stale global rate: ${driftMax.toFixed(2)}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
