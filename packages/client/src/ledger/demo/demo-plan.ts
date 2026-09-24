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
import * as money from "@waltning/core/money";
import type { AccountKind } from "@waltning/core/registry/inputs";

export type DemoAccount = {
  /** Referenced by the patterns below, never shown. */
  ref: string;
  name: string;
  currency: CurrencyCode;
  /**
   * **Every `ACCOUNT_KIND`, and `demo-plan.test.ts` refuses a list that
   * misses one.** This was five of the nine, so the demo ledger — the thing a
   * reader opens to see what the app *is* — never drew a loan in either
   * direction, an investment or an `other`, and the register's colour ramp
   * had four entries nothing rendered.
   */
  kind: AccountKind;
  /**
   * §6.7's flag, and the register draws a `BIZ` tag from it (S16 §4). No demo
   * account carried it, so the tag the component has always supported could
   * never appear on a screen anybody looked at — the same gap the four
   * missing account kinds had.
   */
  isBusiness?: boolean;
  openingBalance: string;
};

/**
 * Eleven accounts, three currencies, every kind.
 *
 * More than one currency on purpose: a single-currency ledger never exercises
 * a conversion, and the figures a reader most wants to trust are the ones that
 * crossed one.
 *
 * **And one clearing account, funded but unallocated.** Without it the
 * unsettled banner never fires on demo data, S36 is unreachable by hand, and
 * §6.4's whole invariant is a sentence nobody can look at — the same gap that
 * made Debt and Counterparty detail impossible to compare before this loader
 * seeded any people.
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
  {
    ref: "clearing",
    name: "Clearing",
    currency: "PLN" as CurrencyCode,
    kind: "clearing",
    // Zero, and funded by a transfer instead: a pot with an *opening*
    // balance is a pot nobody laid out, which is not the state J08 is about.
    openingBalance: "0.00",
  },
  /**
   * **Both directions of a loan, as two kinds rather than one signed
   * balance.** `loan_receivable` reads positive while somebody is repaying
   * you; `loan_payable` reads negative while you still owe. A demo with only
   * one of them shows half the register's money colours and none of the
   * question S16 asks by sorting these two sections last — *what of this is
   * not really mine?*
   */
  {
    ref: "loan-out",
    name: "Lent to a friend",
    currency: "PLN" as CurrencyCode,
    kind: "loan_receivable",
    openingBalance: "4000.00",
  },
  {
    ref: "loan-in",
    name: "Car loan",
    currency: "PLN" as CurrencyCode,
    kind: "loan_payable",
    openingBalance: "-18000.00",
  },
  /** A holding, in a third currency, so the pivot conversion has something real to do. */
  {
    ref: "investment",
    name: "Brokerage",
    currency: "USD" as CurrencyCode,
    kind: "investment",
    openingBalance: "12500.00",
  },
  /** The kind that exists so nothing has to be filed as a lie. */
  {
    ref: "other",
    name: "Travel card",
    currency: "EUR" as CurrencyCode,
    kind: "other",
    openingBalance: "120.00",
  },
  /**
   * A second bank and a second card — a section of one proves no section, and
   * the register's subtotal, inset rules and collapse control are all things
   * a one-row group cannot show.
   */
  {
    ref: "bank-c",
    name: "Studio account",
    currency: "PLN" as CurrencyCode,
    kind: "bank",
    isBusiness: true,
    openingBalance: "3100.00",
  },
  {
    ref: "card-b",
    name: "Card B",
    currency: "PLN" as CurrencyCode,
    kind: "card",
    openingBalance: "0.00",
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

  // Lending and repaying, so the two loan accounts have somewhere to file
  // their movement. `Lent out` is a real outgoing (§6.6: a receivable sits
  // outside net worth), and `Repayment made` is what comes back the other way.
  { name: "Debt & giving", kind: "expense", group: null },
  { name: "Lent out", kind: "expense", group: "Debt & giving" },
  { name: "Repayment made", kind: "expense", group: "Debt & giving" },

  { name: "Returns", kind: "income", group: null },
  { name: "Investment returns", kind: "income", group: "Returns" },
];

export type DemoPattern = {
  enteredName: string;
  category: string;
  type: "income" | "expense";
  account: string;
  /**
   * **A transfer's other leg, and the reason the demo balances at all.**
   * Without it a pattern can only add to an account or take from one, so
   * money entered the banks every month and left the wallet every month and
   * neither ever came back: 26 months in, the current account held 248 000 zł
   * and cash was 3 585 zł *negative*. A ledger nobody could hold is a ledger
   * nobody can judge the screens against.
   *
   * Present makes the row a transfer, and `category` is ignored — §7.5: a
   * transfer moves money between two of your own accounts and categorising it
   * would double count it against the same spend total.
   */
  toAccount?: string;
  amount: string;
  /** Days of the month it lands on. A day the month does not have is skipped. */
  days: readonly number[];
  /** Skip the pattern in months where the absolute month number is not a multiple. */
  every?: number;
};

export const DEMO_PATTERNS: readonly DemoPattern[] = [
  {
    enteredName: "Employer",
    category: "Salary",
    type: "income",
    account: "bank-a",
    amount: "9200.00",
    days: [27],
  },

  {
    enteredName: "Netflix",
    category: "Media & streaming",
    type: "expense",
    account: "card-a",
    amount: "12.99",
    days: [3],
  },
  {
    enteredName: "Spotify",
    category: "Media & streaming",
    type: "expense",
    account: "card-a",
    amount: "5.99",
    days: [3],
  },
  {
    enteredName: "YouTube Premium",
    category: "Media & streaming",
    type: "expense",
    account: "card-a",
    amount: "6.99",
    days: [8],
  },
  {
    enteredName: "Anthropic",
    category: "Software & tools",
    type: "expense",
    account: "card-a",
    amount: "20.00",
    days: [11],
  },

  {
    enteredName: "Landlord",
    category: "Rent",
    type: "expense",
    account: "bank-a",
    amount: "5200.00",
    days: [5],
  },
  {
    enteredName: "Utility Co",
    category: "Utilities",
    type: "expense",
    account: "bank-a",
    amount: "420.00",
    days: [14],
  },

  {
    enteredName: "Lidl",
    category: "Groceries",
    type: "expense",
    account: "bank-a",
    amount: "720.00",
    days: [2, 16, 29],
  },
  {
    enteredName: "Żabka",
    category: "Groceries",
    type: "expense",
    account: "cash",
    amount: "34.80",
    days: [9, 23],
  },
  {
    enteredName: "ORLEN",
    category: "Fuel & parking",
    type: "expense",
    account: "bank-a",
    amount: "280.00",
    days: [7, 21],
  },
  {
    enteredName: "Uber",
    category: "Taxi",
    type: "expense",
    account: "card-a",
    amount: "24.00",
    days: [6, 20],
  },
  // Deliberately not in the catalogue — an unmatched entered name has to fall back to
  // a monogram, and a ledger where everything matched would never show that.
  {
    enteredName: "Corner Cafe",
    category: "Eating out",
    type: "expense",
    account: "cash",
    amount: "19.50",
    days: [4, 11, 18, 25],
  },
  {
    enteredName: "Allegro",
    category: "Household supplies",
    type: "expense",
    account: "bank-a",
    amount: "149.00",
    days: [17],
    every: 2,
  },
  {
    enteredName: "IKEA",
    category: "Furniture & appliances",
    type: "expense",
    account: "bank-a",
    amount: "820.00",
    days: [13],
    every: 5,
  },
  // ── the kinds that had no activity at all ─────────────────────────────
  //
  // An opening balance puts a row in the register and proves nothing beyond
  // that: a loan with no repayments never moves, and an account that never
  // moves cannot show that its figure, its colour and its sign survive a
  // month of use. These are the smallest patterns that give the late kinds a
  // history worth looking at.
  {
    enteredName: "Brokerage",
    category: "Investment returns",
    type: "income",
    account: "investment",
    amount: "180.00",
    days: [20],
    every: 3,
  },
  {
    enteredName: "Transit",
    category: "Taxi",
    type: "expense",
    account: "other",
    amount: "24.00",
    days: [3, 17],
  },
  {
    enteredName: "Client",
    category: "Services",
    type: "income",
    account: "bank-c",
    amount: "3400.00",
    days: [15],
  },
  {
    enteredName: "Software & tools",
    category: "Software & tools",
    type: "expense",
    account: "card-b",
    amount: "89.00",
    days: [6],
  },
  // ── what makes the ledger circulate ───────────────────────────────────
  //
  // **Every one of these is a transfer, and before they existed the demo did
  // not balance.** Money arrived in the banks each month and left the wallet
  // each month with nothing carrying it back, so 26 months in the current
  // account held 248 000 zł, cash was 3 585 zł negative, and a receivable had
  // been repaid four times over. None of that is a ledger anybody could hold,
  // which makes it useless for judging the screens that draw it.
  {
    enteredName: "Cash withdrawal",
    category: "",
    type: "expense",
    account: "bank-a",
    toAccount: "cash",
    amount: "150.00",
    days: [7],
  },
  {
    enteredName: "To savings",
    category: "",
    type: "expense",
    account: "bank-a",
    toAccount: "bank-b",
    amount: "600.00",
    days: [28],
  },
  {
    enteredName: "Card A",
    category: "",
    type: "expense",
    account: "bank-a",
    // ~94 € of subscriptions and rides a month, in the złoty that buys them.
    toAccount: "card-a",
    amount: "406.00",
    days: [14],
  },
  {
    enteredName: "Card B",
    category: "",
    type: "expense",
    account: "bank-a",
    toAccount: "card-b",
    amount: "89.00",
    days: [14],
  },
  // The car loan amortises: what you owe walks toward zero over the demo's
  // 26 months rather than sitting at its opening figure forever.
  {
    enteredName: "Car loan",
    category: "",
    type: "expense",
    account: "bank-a",
    toAccount: "loan-in",
    amount: "620.00",
    days: [8],
  },
  // And the friend repays you, into the account the money left from.
  {
    enteredName: "Repayment received",
    category: "",
    type: "expense",
    account: "loan-out",
    toAccount: "bank-a",
    amount: "150.00",
    days: [12],
  },
  // The studio pays its owner, so a business account does not grow forever
  // either. Its own costs are the `card-b` software line above.
  {
    enteredName: "Owner draw",
    category: "",
    type: "expense",
    account: "bank-c",
    toAccount: "bank-a",
    amount: "3000.00",
    days: [26],
  },
  {
    enteredName: "Top up",
    category: "",
    type: "expense",
    account: "bank-a",
    // ~48 € of transit a month, likewise.
    toAccount: "other",
    amount: "207.00",
    days: [2],
  },
  {
    enteredName: "Restaurant",
    category: "Eating out",
    type: "expense",
    account: "bank-a",
    amount: "320.00",
    days: [3, 16, 24],
  },
];

/**
 * The three people and companies money moves between, and the three states
 * S14 sorts them into: **one who owes you, one you owe, and one settled.**
 *
 * A demo with no counterparties leaves Debt drawing its empty state and S15
 * unreachable, so the whole debt half of the app could not be looked at —
 * which is how it stayed uncompared against its own drawing for months.
 *
 * Invented, like every account and employer here (the merchants are the only
 * real names, and `demo-plan`'s header says why).
 */
export type DemoCounterparty = {
  /** Referenced by `DEMO_DEBTS`, never shown. */
  ref: string;
  name: string;
  kind: "person" | "company";
  settlementCurrency: string | null;
};

export const DEMO_COUNTERPARTIES: readonly DemoCounterparty[] = [
  { ref: "owing", name: "Marta", kind: "person", settlementCurrency: null },
  { ref: "owed", name: "Piotr", kind: "person", settlementCurrency: null },
  { ref: "settled", name: "Studio B", kind: "company", settlementCurrency: null },
  // **Not only Polish names.** The ledger is kept in three languages, and a
  // directory of Polish names never exercises `fold()` on an umlaut or on
  // Cyrillic at all — the two scripts its uniqueness rule most needs to hold
  // for. A German friend settling in euros, and a Belarusian one written in
  // his own alphabet.
  { ref: "de-owing", name: "Jürgen", kind: "person", settlementCurrency: "EUR" },
  { ref: "by-owed", name: "Алесь", kind: "person", settlementCurrency: null },
];

/**
 * A debt row, dated by how many days back from today it sits.
 *
 * `role: "debt"` is the only role that moves a balance (§6.6); the
 * contribution is here so S15's history shows the row kinds it has to tell
 * apart, and it is deliberately on the person who is otherwise settled.
 */
export type DemoDebt = {
  counterparty: string;
  role: "debt" | "contribution";
  account: string;
  category: string;
  enteredName: string;
  type: "income" | "expense";
  amount: string;
  daysAgo: number;
  /** Settled in full, by a settlement written straight after it. */
  settle?: boolean;
};

export const DEMO_DEBTS: readonly DemoDebt[] = [
  // They owe you: you paid, on their behalf.
  {
    counterparty: "owing",
    role: "debt",
    account: "bank-a",
    category: "Eating out",
    enteredName: "Dinner · split",
    type: "expense",
    amount: "240.00",
    daysAgo: 12,
  },
  {
    counterparty: "owing",
    role: "debt",
    account: "card-a",
    category: "Taxi",
    enteredName: "Train tickets",
    type: "expense",
    amount: "96.50",
    daysAgo: 4,
  },
  // You owe them: they paid you, and it is not yours to keep.
  {
    counterparty: "owed",
    role: "debt",
    account: "bank-a",
    category: "Services",
    enteredName: "Deposit forwarded",
    type: "income",
    amount: "1400.00",
    daysAgo: 21,
  },
  // A euro debt, on the euro card, owed by someone who settles in euros.
  {
    counterparty: "de-owing",
    role: "debt",
    account: "card-a",
    category: "Eating out",
    enteredName: "Concert · tickets",
    type: "expense",
    amount: "84.00",
    daysAgo: 9,
  },
  // Money that arrived and is owed back — filed under `Borrowed`, the income
  // leaf for exactly that.
  {
    counterparty: "by-owed",
    role: "debt",
    account: "cash",
    category: "Borrowed",
    enteredName: "Cash · until Friday",
    type: "income",
    amount: "300.00",
    daysAgo: 6,
  },
  // Settled: the debt, then the settlement that clears it.
  {
    counterparty: "settled",
    role: "debt",
    account: "bank-a",
    category: "Software & tools",
    enteredName: "Studio B · invoice",
    type: "expense",
    amount: "600.00",
    daysAgo: 45,
    settle: true,
  },
  {
    counterparty: "settled",
    role: "contribution",
    account: "cash",
    category: "Eating out",
    enteredName: "Studio B · lunch",
    type: "expense",
    amount: "58.00",
    daysAgo: 30,
  },
];

/** One row of the plan — a transaction to create, by name rather than by id. */
export type DemoTransaction = {
  account: string;
  category: string;
  enteredName: string;
  type: "income" | "expense" | "transfer";
  /** The destination leg, on a transfer and only a transfer (§7.5). */
  toAccount?: string;
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
          enteredName: pattern.enteredName,
          type: pattern.toAccount === undefined ? pattern.type : "transfer",
          ...(pattern.toAccount === undefined ? {} : { toAccount: pattern.toAccount }),
          amount: vary(pattern.amount, `${pattern.enteredName}-${date}`),
          date,
        });
      }
    }
  }
  return rows;
}

/** Two years and change: enough that a year chart has two of them. */
export const DEMO_MONTHS = 26;

/**
 * A rate to the pivot for every currency the demo spends in but the ledger
 * does not keep its books in.
 *
 * **Without these, most of the demo is refused.** A currency with no rate is
 * not `capturable`, and the controller declines a transaction in it before the
 * write — the honest refusal, because a row it cannot value is a row that
 * would land in no total. On a device that has never synced there are no rates
 * at all, so the USD and EUR accounts took every row with them: 600-odd
 * refusals and a ledger of nothing but the PLN ones.
 *
 * Plausible, not accurate. A demo's figures only have to hold still.
 */
/**
 * What one unit of each demo currency is worth, in one reference currency.
 *
 * **A table, not a rate list, because the demo does not get to pick the
 * pivot.** The first version stated *USD 4.05, EUR 4.32* and a `DEMO_PIVOT` of
 * `"PLN"` — and a device that has never synced bootstraps `currencies.ts`'s
 * own default, which is **USD**. So every rate was quoted against a pivot the
 * ledger did not have, all six writes were refused with *base must be the
 * pivot*, and what the reader saw was **532 transactions refused for
 * `needsRate`**: one cause wearing five hundred unrelated symptoms, twice over
 * (the 366-day cap was the other).
 *
 * The reference here is arbitrary and cancels out — `demoRates` divides two of
 * these, so only their ratios matter.
 */
export const DEMO_REFERENCE: Readonly<Record<string, string>> = {
  PLN: "1",
  USD: "4.05",
  EUR: "4.32",
};

/**
 * The rates this ledger needs, quoted against **its own** pivot.
 *
 * **`UnitsPerPivot` — how many of the quote one pivot buys**, which is what
 * `set_manual_rate` takes (`rate: zUnitsPerPivot`) and what `fx_rates.rate`
 * stores: the figure you *divide* by. With the books in USD, one unit of the
 * pivot buys 4.05 PLN, so the USD/PLN rate is `4.05`.
 *
 * **The first version returned the reciprocal**, and the brands did not catch
 * it because the loader's own `setManualRate` signature typed the field as a
 * plain `string` — the loose type at a seam `CLAUDE.md` warns about, routed
 * straight around the pair of types `money.ts` introduced *because* getting
 * this backwards once cost a 14.1x error. Here it was 16.4x, it looked
 * entirely plausible on screen (4.05 and 0.2469 are both believable USD/PLN
 * figures), and a test pinned the wrong values green. The signature is
 * `UnitsPerPivot` now, so the direction is a compile error rather than a
 * reading exercise.
 *
 * The reference below is arbitrary and cancels: only the ratio of two entries
 * is used. A currency the table does not price is skipped rather than guessed.
 */
export function demoRates(pivot: string): readonly { quote: string; rate: money.UnitsPerPivot }[] {
  const base = DEMO_REFERENCE[pivot];
  if (base === undefined) return [];
  const out: { quote: string; rate: money.UnitsPerPivot }[] = [];
  for (const [quote, reference] of Object.entries(DEMO_REFERENCE)) {
    if (quote === pivot) continue;
    // `ref[pivot] / ref[quote]`, at the rate scale rather than the money one —
    // a rate column is `numeric(24,12)` and this is not a place to round to 8.
    out.push({ quote, rate: money.unitsPerPivot(money.dec(base).dividedBy(reference)) });
  }
  return out;
}

/** The first and last day the plan can name, for a rate that spans all of it. */
export function demoSpan(today: string, months: number): { from: string; to: string } {
  const rows = demoTransactions(today, months);
  const dates = rows.map((row) => row.date).sort();
  return { from: dates[0] ?? today, to: dates.at(-1) ?? today };
}
