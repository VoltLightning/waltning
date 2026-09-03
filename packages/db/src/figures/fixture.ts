/**
 * One fixture, loaded into Postgres AND handed to `money.ts`, so every
 * class-F figure is computed both ways from identical rows.
 *
 * Built to provoke §14's three silent disagreements: **rounding mode**
 * (`…001`'s `100.000000005` is a genuine tie at the ninth decimal — half up
 * and half even disagree on it, and both currently round it the same way,
 * which the differential test's "break it once" step proves is load-bearing
 * rather than incidental), **sign convention** (every transaction type, both
 * legs of two transfers, a negative `adjustment`), and **NULL-versus-zero**
 * (`Empty · PLN` carries no rows at all, and `…009` is soft-deleted — a huge
 * amount that must move neither figure on either side).
 *
 * Plain data, deliberately — no branded `Id`/`Money`/`CurrencyCode`. Postgres
 * gets these strings through a parameterized insert; `money.ts` gets them
 * through `money.toMoney`. Neither side is the type the other was built for.
 */

import type { TxnType } from "@waltning/core/money";

export const CURRENCIES = [
  { code: "PLN", name: "Polish Zloty", decimals: 2 },
  { code: "USD", name: "US Dollar", decimals: 2 },
] as const;

export const ACCOUNTS = [
  {
    id: "00000000-0000-4000-8000-00000000000a",
    name: "Bank A · PLN",
    currency: "PLN",
    ownership: "own",
    isBusiness: false,
    opening: "10.12345678",
  },
  {
    id: "00000000-0000-4000-8000-00000000000b",
    name: "Biz · PLN",
    currency: "PLN",
    ownership: "own",
    isBusiness: true,
    opening: "0",
  },
  {
    id: "00000000-0000-4000-8000-00000000000c",
    name: "Household · PLN",
    currency: "PLN",
    ownership: "shared",
    isBusiness: false,
    opening: "-5.5",
  },
  {
    id: "00000000-0000-4000-8000-00000000000d",
    name: "Cash · USD",
    currency: "USD",
    ownership: "own",
    isBusiness: false,
    opening: "3",
  },
  {
    id: "00000000-0000-4000-8000-00000000000e",
    name: "Empty · PLN",
    currency: "PLN",
    ownership: "own",
    isBusiness: false,
    opening: "0",
  },
] as const;

/**
 * §7 — one counterparty, three debt-carrying rows: a PLN loan, its PLN
 * repayment, and a separate USD loan. The USD row is what proves §7 is
 * `balance(c, ccy)` — parameterised by currency — rather than one figure per
 * counterparty: summing 200 PLN and 30 USD together would silently invent an
 * exchange rate nobody agreed to.
 */
export const COUNTERPARTY = { id: "10000000-0000-4000-8000-000000000001", name: "Counterparty A" };

export type FixtureTx = {
  id: string;
  date: string;
  type: TxnType;
  accountId: string;
  toAccountId?: string;
  amountOriginal: string;
  toAmount?: string;
  currency: string;
  toCurrency?: string;
  counterpartyId?: string;
  counterpartyRole?: "debt";
  /** Set on the one row both sides must exclude. */
  deleted?: boolean;
};

export const TRANSACTIONS: readonly FixtureTx[] = [
  {
    // Nine decimal digits, a genuine tie at the ninth: `numeric(20,8)` and
    // `money.toMoney` both round this on the way in, and only *how* they
    // round it (half up vs. half even) can disagree — `100.00000000` versus
    // `100.00000001`. Both currently round half up (proven: Postgres's own
    // `numeric` rounds `2.5::numeric(10,0)` to `3`, not `2`), so this and
    // every figure below it agree; Task 5 step 4 flips `money.ts` alone to
    // prove that agreement is load-bearing, not incidental.
    id: "20000000-0000-4000-8000-000000000001",
    date: "2026-09-01",
    type: "income",
    accountId: ACCOUNTS[0].id,
    amountOriginal: "100.000000005",
    currency: "PLN",
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    date: "2026-09-01",
    type: "expense",
    accountId: ACCOUNTS[0].id,
    amountOriginal: "0.00000001",
    currency: "PLN",
  },
  {
    id: "20000000-0000-4000-8000-000000000003",
    date: "2026-09-02",
    type: "adjustment",
    accountId: ACCOUNTS[0].id,
    amountOriginal: "-2.5",
    currency: "PLN",
  },
  // a transfer OUT of Bank A, INTO the shared Household account
  {
    id: "20000000-0000-4000-8000-000000000004",
    date: "2026-09-02",
    type: "transfer",
    accountId: ACCOUNTS[0].id,
    toAccountId: ACCOUNTS[2].id,
    amountOriginal: "40.33333333",
    toAmount: "40.33333333",
    currency: "PLN",
    toCurrency: "PLN",
  },
  // a cross-currency transfer OUT of Bank A, INTO Cash · USD
  {
    id: "20000000-0000-4000-8000-000000000005",
    date: "2026-09-03",
    type: "transfer",
    accountId: ACCOUNTS[0].id,
    toAccountId: ACCOUNTS[3].id,
    amountOriginal: "3.99",
    toAmount: "1.00000000",
    currency: "PLN",
    toCurrency: "USD",
  },
  {
    id: "20000000-0000-4000-8000-000000000006",
    date: "2026-09-03",
    type: "expense",
    accountId: ACCOUNTS[1].id,
    amountOriginal: "7.77777777",
    currency: "PLN",
  },
  // lent 200 out of Bank A: a receivable, counterparty on the source leg
  {
    id: "20000000-0000-4000-8000-000000000007",
    date: "2026-09-04",
    type: "expense",
    accountId: ACCOUNTS[0].id,
    amountOriginal: "200",
    currency: "PLN",
    counterpartyId: COUNTERPARTY.id,
    counterpartyRole: "debt",
  },
  // repaid 50 as a transfer INTO Bank A: counterparty on the destination leg
  {
    id: "20000000-0000-4000-8000-000000000008",
    date: "2026-09-05",
    type: "transfer",
    accountId: ACCOUNTS[2].id,
    toAccountId: ACCOUNTS[0].id,
    amountOriginal: "50",
    toAmount: "50",
    currency: "PLN",
    toCurrency: "PLN",
    counterpartyId: COUNTERPARTY.id,
    counterpartyRole: "debt",
  },
  // soft-deleted: large enough that either side including it by mistake fails loudly
  {
    id: "20000000-0000-4000-8000-000000000009",
    date: "2026-09-06",
    type: "expense",
    accountId: ACCOUNTS[0].id,
    amountOriginal: "999999",
    currency: "PLN",
    deleted: true,
  },
  // the same counterparty, a SEPARATE currency: must not net against the PLN
  // rows above (§7 is per currency).
  {
    id: "20000000-0000-4000-8000-000000000010",
    date: "2026-09-07",
    type: "expense",
    accountId: ACCOUNTS[3].id,
    amountOriginal: "30",
    currency: "USD",
    counterpartyId: COUNTERPARTY.id,
    counterpartyRole: "debt",
  },
];

export const ACCOUNT_IDS = ACCOUNTS.map((a) => a.id);
