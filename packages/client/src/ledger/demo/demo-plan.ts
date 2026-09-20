/**
 * A ledger's worth of invented data, as a plan of registry operations.
 *
 * **What this is for.** There was no way to look at the app with a real-looking
 * ledger in it without either entering rows by hand or standing up Postgres,
 * the API and a reachable host for the phone to talk to. A device already
 * holds a complete ledger of its own — the replica, which every screen reads —
 * so the shortest path to a populated app is to write into it directly.
 *
 * **Operations, not rows.** The plan is drafts for `create_account`,
 * `create_category` and `create_transaction`, replayed through the same
 * controller a person's taps go through. Writing rows straight into the
 * replica would skip brand matching, the outbox, and every refusal the
 * executors make — and would therefore produce data that behaves differently
 * from data you entered, which is the one thing a test fixture must not do.
 *
 * **Every account, employer and client is invented; the merchants are real.**
 * Those are two different rules. The placeholder rule protects *this* ledger's
 * private data — which bank, which employer, which client — and none of that
 * appears here. A supermarket is not private data, and naming real ones is the
 * only way §14.4b's offline matcher has anything to recognise.
 *
 * Deliberately separate from `packages/db`'s Postgres fixture, which serves
 * the API-backed dev flow and cannot be imported from a phone bundle. The two
 * hold the same *kind* of data and are not the same list.
 */

import type { CurrencyCode } from "@waltning/core/money";

export type DemoAccount = {
  /** Referenced by the patterns below, never shown. */
  ref: string;
  name: string;
  currency: CurrencyCode;
  kind: "bank" | "card" | "cash" | "deposit";
  openingBalance: string;
};

/**
 * Four accounts, three currencies.
 *
 * More than one currency on purpose: a single-currency ledger never exercises
 * a conversion, and the figures a reader most wants to trust are the ones that
 * crossed one.
 */
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    ref: "bank-a",
    name: "Bank A",
    currency: "PLN" as CurrencyCode,
    kind: "bank",
    openingBalance: "8400.00",
  },
  {
    ref: "bank-b",
    name: "Bank B",
    currency: "USD" as CurrencyCode,
    kind: "deposit",
    openingBalance: "2500.00",
  },
  {
    ref: "card-a",
    name: "Card A",
    currency: "EUR" as CurrencyCode,
    kind: "card",
    openingBalance: "0.00",
  },
  {
    ref: "cash",
    name: "Cash",
    currency: "PLN" as CurrencyCode,
    kind: "cash",
    openingBalance: "300.00",
  },
];

export type DemoCategory = { name: string; kind: "income" | "expense"; group: string | null };

/**
 * A small taxonomy, created only where the device does not already have one by
 * that name.
 *
 * A device that has never synced has no category tree at all, and a
 * transaction with a null category is a legal but dull row — the categorised
 * views are most of what there is to look at. `group: null` marks a group;
 * everything else names its parent.
 */
export const DEMO_CATEGORIES: readonly DemoCategory[] = [
  { name: "Income", kind: "income", group: null },
  { name: "Salary", kind: "income", group: "Income" },
  { name: "Services", kind: "income", group: "Income" },

  { name: "Food", kind: "expense", group: null },
  { name: "Groceries", kind: "expense", group: "Food" },
  { name: "Eating out", kind: "expense", group: "Food" },

  { name: "Home", kind: "expense", group: null },
  { name: "Rent", kind: "expense", group: "Home" },
  { name: "Utilities", kind: "expense", group: "Home" },
  { name: "Furniture & appliances", kind: "expense", group: "Home" },

  { name: "Transport", kind: "expense", group: null },
  { name: "Fuel & parking", kind: "expense", group: "Transport" },
  { name: "Taxi", kind: "expense", group: "Transport" },

  { name: "Subscriptions", kind: "expense", group: null },
  { name: "Media & streaming", kind: "expense", group: "Subscriptions" },
  { name: "Software & tools", kind: "expense", group: "Subscriptions" },

  { name: "Shopping", kind: "expense", group: null },
  { name: "Household supplies", kind: "expense", group: "Shopping" },
];

export type DemoPattern = {
  payee: string;
  category: string;
  type: "income" | "expense";
  account: string;
  amount: string;
  /** Days of the month it lands on. A day the month does not have is skipped. */
  days: readonly number[];
  /** Skip the pattern in months where the absolute month number is not a multiple. */
  every?: number;
};

export const DEMO_PATTERNS: readonly DemoPattern[] = [
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
  // Deliberately not in the catalogue — an unmatched payee has to fall back to
  // a monogram, and a ledger where everything matched would never show that.
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

/** One row of the plan — a transaction to create, by name rather than by id. */
export type DemoTransaction = {
  account: string;
  category: string;
  payee: string;
  type: "income" | "expense";
  amount: string;
  date: string;
};

/**
 * A deterministic 0–30 from a key, for varying an amount month to month.
 *
 * Deterministic rather than random so the same month always produces the same
 * ledger: a demo you can describe to somebody else ("look at March") is worth
 * more than one that is different every time.
 */
function jitter(key: string): number {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) % 100_000;
  }
  return hash % 31;
}

/** The typical amount, varied ±15%, to the cent. */
function vary(amount: string, key: string): string {
  const cents = Math.round(Number(amount) * 100);
  return (Math.round((cents * (85 + jitter(key))) / 100) / 100).toFixed(2);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function iso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Every transaction to create, walking back a month at a time from `today`.
 *
 * **Months rather than consecutive days**, so the ledger has whole months
 * behind it and a *partial* month in front — the shape every period figure is
 * read against, and the one a run of consecutive days never produces. Nothing
 * is dated later than `today`: rows in the future are a different feature.
 */
export function demoTransactions(today: string, months: number): readonly DemoTransaction[] {
  const [thisYear, thisMonth, todayDay] = today.split("-").map(Number);
  if (thisYear === undefined || thisMonth === undefined || todayDay === undefined) {
    throw new Error(`demo data needs a YYYY-MM-DD to walk back from, got ${today}`);
  }

  const rows: DemoTransaction[] = [];
  for (let back = 0; back < months; back += 1) {
    const absolute = thisYear * 12 + (thisMonth - 1) - back;
    const year = Math.floor(absolute / 12);
    const month = absolute % 12;
    const length = daysInMonth(year, month);
    const isCurrent = back === 0;

    for (const pattern of DEMO_PATTERNS) {
      if (pattern.every !== undefined && absolute % pattern.every !== 0) continue;
      for (const day of pattern.days) {
        if (day > length) continue;
        if (isCurrent && day > todayDay) continue;
        const date = iso(year, month, day);
        rows.push({
          account: pattern.account,
          category: pattern.category,
          payee: pattern.payee,
          type: pattern.type,
          amount: vary(pattern.amount, `${pattern.payee}-${date}`),
          date,
        });
      }
    }
  }
  return rows;
}

/** Two years and change: enough that a year chart has two of them. */
export const DEMO_MONTHS = 26;
