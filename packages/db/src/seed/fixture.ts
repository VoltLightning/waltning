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
import { matchBrand } from "@waltning/core/brands/match";
import { type AccountingDate, accountingDate, todayIn } from "@waltning/core/date";
import type { Id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { type CurrencyCode, currencyCode } from "@waltning/core/money";
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
  currency: CurrencyCode;
  kind: "bank" | "cash" | "card" | "deposit";
  openingBalance: string;
};

const ACCOUNTS: FixtureAccount[] = [
  {
    ref: "bank-a",
    name: "Bank A",
    currency: currencyCode("PLN"),
    kind: "bank",
    openingBalance: "8400.00",
  },
  {
    ref: "bank-b",
    name: "Bank B",
    currency: currencyCode("USD"),
    kind: "deposit",
    openingBalance: "2500.00",
  },
  {
    ref: "card-a",
    name: "Card A",
    currency: currencyCode("EUR"),
    kind: "card",
    openingBalance: "0.00",
  },
  {
    ref: "cash",
    name: "Cash",
    currency: currencyCode("PLN"),
    kind: "cash",
    openingBalance: "300.00",
  },
];

/**
 * Payee, category leaf, amount, and which account it lands on.
 *
 * `days` is where in the month the thing happens — a salary on the 27th, rent
 * on the 5th, groceries four times across the month. Anchoring to real days of
 * the month rather than walking backwards from today is what gives the ledger
 * months that look like months: a period total means something, a calendar has
 * quiet stretches, and the current month is partial because today is partway
 * through it.
 */
type Pattern = {
  payee: string;
  category: string;
  type: "income" | "expense";
  account: string;
  /** The typical amount. Each occurrence varies deterministically around it. */
  amount: string;
  /** Days of the month it lands on. A day past the month's length is skipped. */
  days: number[];
  /** Skip the pattern entirely in months where `month % every !== 0`. */
  every?: number;
};

const PATTERNS: Pattern[] = [
  // ── income ────────────────────────────────────────────────────────────
  // Employers and clients stay abstract: a real one would be *this* ledger's
  // private data, which is the thing the placeholder rule is about. Merchants
  // are not — they are public brands, and the point of naming them is that the
  // offline matcher (§14.4b) has something real to recognise.
  {
    payee: "Employer",
    category: "Salary",
    type: "income",
    account: "bank-a",
    amount: "14200.00",
    days: [27],
  },
  {
    payee: "Client One",
    category: "Services",
    type: "income",
    account: "bank-b",
    amount: "1800.00",
    days: [12],
  },
  {
    payee: "Client Two",
    category: "Services",
    type: "income",
    account: "bank-b",
    amount: "950.00",
    days: [19],
    every: 3,
  },

  // ── subscriptions, every one of them a catalogue hit ──────────────────
  {
    payee: "Netflix",
    category: "Media & streaming",
    type: "expense",
    account: "card-a",
    amount: "12.99",
    days: [3],
  },
  {
    payee: "Spotify",
    category: "Media & streaming",
    type: "expense",
    account: "card-a",
    amount: "5.99",
    days: [3],
  },
  {
    payee: "YouTube Premium",
    category: "Media & streaming",
    type: "expense",
    account: "card-a",
    amount: "6.99",
    days: [8],
  },
  {
    payee: "Anthropic",
    category: "Software & tools",
    type: "expense",
    account: "card-a",
    amount: "20.00",
    days: [11],
  },

  // ── the fixed monthly shape ───────────────────────────────────────────
  {
    payee: "Landlord",
    category: "Rent",
    type: "expense",
    account: "bank-a",
    amount: "3200.00",
    days: [5],
  },
  {
    payee: "Utility Co",
    category: "Utilities",
    type: "expense",
    account: "bank-a",
    amount: "287.60",
    days: [14],
  },

  // ── week to week ──────────────────────────────────────────────────────
  {
    payee: "Lidl",
    category: "Groceries",
    type: "expense",
    account: "bank-a",
    amount: "204.30",
    days: [2, 16, 29],
  },
  {
    payee: "Żabka",
    category: "Groceries",
    type: "expense",
    account: "cash",
    amount: "34.80",
    days: [9, 23],
  },
  {
    payee: "ORLEN",
    category: "Fuel & parking",
    type: "expense",
    account: "bank-a",
    amount: "280.00",
    days: [7, 21],
  },
  {
    payee: "Uber",
    category: "Taxi",
    type: "expense",
    account: "card-a",
    amount: "24.00",
    days: [6, 20],
  },
  // **Deliberately not in the catalogue.** An unmatched payee is the other
  // half of the feature: it must fall back to a monogram rather than borrow
  // somebody else's mark, and a fixture where everything matches would never
  // show that.
  {
    payee: "Corner Cafe",
    category: "Eating out",
    type: "expense",
    account: "cash",
    amount: "19.50",
    days: [4, 11, 18, 25],
  },
  {
    payee: "Allegro",
    category: "Household supplies",
    type: "expense",
    account: "bank-a",
    amount: "149.00",
    days: [17],
    every: 2,
  },
  // Occasional and large — the shape a "this month against the usual" figure
  // has to survive without calling every month an anomaly.
  {
    payee: "IKEA",
    category: "Furniture & appliances",
    type: "expense",
    account: "bank-a",
    amount: "820.00",
    days: [13],
    every: 5,
  },
];

/**
 * Money moved between your own accounts, monthly.
 *
 * Present because a ledger without transfers hides a whole class of bug: a
 * transfer must not count as income or expense anywhere, and nothing proves
 * that until one exists. The card payment is also the only thing that stops
 * `card-a` running unboundedly negative across two years.
 */
type Move = { from: string; to: string; amount: string; day: number };

const MOVES: Move[] = [
  { from: "bank-a", to: "cash", amount: "400.00", day: 8 },
  { from: "bank-a", to: "card-a", amount: "40.00", day: 22 },
];

/**
 * A deterministic 0–30 from a key, for varying an amount month to month.
 *
 * **Deterministic, not random**, because the fixture is idempotent: the same
 * external id must produce the same amount on every run, or a second
 * `pnpm db:fixture` would rewrite every row it already wrote and a diff of two
 * runs would never be empty.
 */
function jitter(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 100_000;
  return hash % 31;
}

/** The typical amount, varied ±15% by `jitter`, in whole cents. */
function vary(amount: string, key: string): string {
  const cents = Math.round(Number(amount) * 100);
  const scaled = Math.round((cents * (85 + jitter(key))) / 100);
  return (scaled / 100).toFixed(2);
}

/**
 * The brand fields a payee resolves to, or nothing.
 *
 * `brand_key` and `brand_source` are a valid pair or both absent
 * (`transactions_brand_shape`), so this returns them together or not at all.
 */
function brandOf(payee: string): { brandKey: string; brandSource: "auto" } | Record<string, never> {
  const matched = matchBrand(payee);
  return matched === undefined ? {} : { brandKey: matched, brandSource: "auto" };
}

/** How many days that month has — the same question `DatePicker` asks. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * A leaf id by name, or `null`.
 *
 * A fixture must not invent taxonomy: the category tree is reference data with
 * its own rules (`TAXONOMY.md` R1 — a category is a group **or** a leaf), and a
 * fixture that created missing ones would be seeding a second tree. Every name
 * in `PATTERNS` is checked against the real seed; `null` here means one was
 * renamed, and the transaction simply arrives uncategorised.
 */
async function leafId(name: string): Promise<Id<"categories"> | null> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, name))
    .limit(1);
  return row?.id ?? null;
}

/** Bare `YYYY-MM-DD`, walked back by whole days. No `Date` arithmetic on it. */
/**
 * `days` calendar days before `iso`.
 *
 * **The UTC round trip is safe here and is not safe in general**, which is
 * worth saying because `new Date(...).toISOString().slice(0, 10)` is precisely
 * the shape `AccountingDate` exists to reject: it converts an *instant* to a
 * UTC day, and the ledger's day is local (C28).
 *
 * It holds in this function because the input is anchored at `T00:00:00Z` and
 * the arithmetic is whole days, so the result never leaves the UTC calendar day
 * it started on. Seed data has no timezone of its own; a real capture does, and
 * uses `todayIn(zone)`.
 */

async function drop(): Promise<void> {
  await db.delete(transactions).where(like(transactions.externalId, `${PREFIX}%`));
  await db.delete(accounts).where(like(accounts.externalId, `${PREFIX}%`));
  console.log("fixture removed");
}

async function apply(today: AccountingDate, months: number): Promise<void> {
  const accountIds = new Map<string, Id<"accounts">>();

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
  const [thisYear, thisMonth, todayDay] = today.split("-").map(Number);
  if (thisYear === undefined || thisMonth === undefined || todayDay === undefined) {
    throw new Error(`today is not a date this can walk back from: ${today}`);
  }

  /** A row's own date, as the bare `YYYY-MM-DD` §7.0a requires. */
  const on = (year: number, month: number, day: number): AccountingDate =>
    accountingDate(
      `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );

  // Walked back a month at a time from the current one, so the ledger has
  // whole months behind it and a **partial** month in front — the shape every
  // period figure is read against, and the one a fixture of consecutive days
  // never produces.
  for (let back = 0; back < months; back += 1) {
    const absolute = thisYear * 12 + (thisMonth - 1) - back;
    const year = Math.floor(absolute / 12);
    const month = absolute % 12;
    const length = daysInMonth(year, month);
    const isCurrent = back === 0;

    for (const pattern of PATTERNS) {
      if (pattern.every !== undefined && absolute % pattern.every !== 0) continue;

      const accountId = accountIds.get(pattern.account);
      const account = ACCOUNTS.find((a) => a.ref === pattern.account);
      if (!accountId || !account) continue;
      const categoryId = await leafId(pattern.category);

      for (const day of pattern.days) {
        // A day the month does not have, and — in the month we are standing
        // in — a day that has not happened yet. A ledger with rows dated
        // tomorrow is a different feature (`ExpectedGroup`), not this one.
        if (day > length) continue;
        if (isCurrent && day > todayDay) continue;

        const externalId = `${PREFIX}${pattern.account}-${pattern.payee}-${year}-${month + 1}-${day}`;
        const amount = vary(pattern.amount, externalId);

        await db
          .insert(transactions)
          .values({
            externalId,
            date: on(year, month, day),
            type: pattern.type,
            accountId,
            categoryId,
            amountOriginal: money.toMoney(amount),
            currency: account.currency,
            fxRate: money.pivotPerUnit(TO_PIVOT[account.currency] ?? "1"),
            payee: pattern.payee,
            // **Matched, not asserted.** `resolveBrand` is the same function
            // `create_transaction`'s executor calls, so the fixture exercises
            // the offline matcher rather than hand-writing its answer — which
            // is the only way a wrong alias in the catalogue shows up here.
            ...brandOf(pattern.payee),
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
            set: { amountOriginal: money.toMoney(amount), date: on(year, month, day) },
          });
        written += 1;
      }
    }

    for (const move of MOVES) {
      if (move.day > length) continue;
      if (isCurrent && move.day > todayDay) continue;

      const fromId = accountIds.get(move.from);
      const toId = accountIds.get(move.to);
      const from = ACCOUNTS.find((a) => a.ref === move.from);
      const to = ACCOUNTS.find((a) => a.ref === move.to);
      if (!fromId || !toId || !from || !to) continue;

      const externalId = `${PREFIX}move-${move.from}-${move.to}-${year}-${month + 1}`;
      const fromRate = TO_PIVOT[from.currency] ?? "1";
      const toRate = TO_PIVOT[to.currency] ?? "1";
      // The destination amount is the source converted through the pivot, so a
      // cross-currency transfer nets to zero the way `computations.md` §5
      // requires rather than inventing value at the boundary.
      const toAmount = ((Number(move.amount) * Number(fromRate)) / Number(toRate)).toFixed(2);

      await db
        .insert(transactions)
        .values({
          externalId,
          date: on(year, month, move.day),
          type: "transfer",
          accountId: fromId,
          toAccountId: toId,
          amountOriginal: money.toMoney(move.amount),
          currency: from.currency,
          fxRate: money.pivotPerUnit(fromRate),
          toAmount: money.toMoney(toAmount),
          toCurrency: to.currency,
          toFxRate: money.pivotPerUnit(toRate),
        })
        .onConflictDoUpdate({
          target: transactions.externalId,
          targetWhere: sql`${transactions.externalId} is not null and ${transactions.deletedAt} is null`,
          set: { date: on(year, month, move.day) },
        });
      written += 1;
    }
  }

  console.log(
    `fixture applied: ${ACCOUNTS.length} accounts, ${written} transactions across ${months} months`,
  );
  console.log("  every name invented — this is placeholder data, not a ledger");
}

/**
 * **This was `new Date().toISOString().slice(0, 10)`** — the exact shape C28
 * records: an instant converted to a *UTC* day, so anyone east of UTC seeding
 * after their local midnight gets yesterday's date on every row.
 *
 * Harmless in seed data and not harmless in the capture path, which is why the
 * type now refuses it and there is one function that answers the question
 * properly. The zone is the machine's, because a person seeding a database
 * means their own today.
 */
const today = todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);

/**
 * How far back to go. Two years by default — enough that a year chart has two
 * of them, a month stepper has somewhere to step, and "this month against the
 * usual" has a usual to compare against.
 */
const MONTHS_DEFAULT = 26;

function monthsRequested(argv: readonly string[]): number {
  const flag = argv.find((a) => a.startsWith("--months="));
  if (flag === undefined) return MONTHS_DEFAULT;
  const months = Number(flag.slice("--months=".length));
  if (!Number.isInteger(months) || months < 1 || months > 120) {
    throw new Error(`--months must be a whole number of months from 1 to 120, got ${flag}`);
  }
  return months;
}

if (process.argv.includes("--drop")) await drop();
else await apply(today, monthsRequested(process.argv));
process.exit(0);
