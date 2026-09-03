# A1 · Class-F figures twice, and the differential test — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every class-F figure (`computations.md` §1–2 account balance, §3 net worth, §7 counterparty balance, §8 clearing) exists in `money.ts` for the phone and in SQL for the server, and one differential test proves them equal to eight decimal places on one fixture — so changing the rounding mode on either side alone turns it red.

**Architecture:** `packages/core/src/money.ts` already owns `signed()`/`debtDelta()`; this adds the folds over them as pure functions of row arrays (`accountBalance`, `netWorth`, `counterpartyBalance`) so any reader — phone or test — computes a figure from rows the same way. `packages/ledger` readers call those folds instead of inlining them. The server gains a net-worth query beside its existing balance SQL, and one SQL `signed_amount()` helper replaces the two inline restatements. The differential test lives in `packages/db` (it needs real Postgres) and imports `money.ts` directly.

**Tech Stack:** decimal.js via `money.ts` (never `Number`), drizzle-orm, `better-sqlite3` for ledger tests, real Postgres via `packages/db/src/test/scratch.ts`, `fast-check` (new root devDependency) for property tests.

**Spec:** `docs/superpowers/specs/2026-09-03-arc-phone-stack-design.md` §3 A1 · `docs/specification/computations.md` §0, §0a, §1, §2, §3, §7, §8.

**Board cards closed:** *§1–2 signing + account balance* · *§3 net worth, mine and ours* · *The class-F figures a second time, in `money.ts`, and a differential test* · *Property tests: money, signing, debt*.

## Global Constraints

- Money is `numeric(20,8)` **strings**; arithmetic only through `money.ts`. A JS number holding an amount is a bug. `ROUND_HALF_UP`, precision 28, round once at the boundary (§0a).
- `packages/core` imports nothing platform-bound and no Node API. `packages/ledger` never imports `expo-sqlite`; the driver is injected.
- Type parameters before `unknown`/`any`/`never`; `any` and `!` are lint errors.
- Explicit `.ts` specifiers on relative imports. No barrels. No re-exports.
- Every new top-level folder under a `src/` must be added to `ALLOWED` in `tests/architecture.test.ts` — the test does an exact set comparison.
- Placeholders only: `Bank A · PLN`, invented names. Never real ledger data.
- Where the spec's formula and the code disagree, **change the spec in the same PR** and say so in the commit.
- `pnpm verify` green before the PR opens; `git add` untracked files first or the hook cannot see them. Postgres must be up: `pnpm db:up`, with `MIGRATE_DATABASE_URL` set (see `.env.example`).
- Branch: `feature/a1-class-f-figures` off `main`. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File structure

| File | Responsibility |
|---|---|
| `packages/core/src/money.ts` (modify) | Add the folds: `accountBalance`, `netWorth`, `counterpartyBalance`, `clearingBalance`. Pure, over row arrays. |
| `packages/core/src/money.property.test.ts` (create) | fast-check properties: signed both legs, `debtDelta = −signed`, scale-8 round-trip, no float path. |
| `packages/core/src/figures.test.ts` (create) | Unit tests for the folds on hand-written rows. |
| `packages/ledger/src/accounts/read-accounts.ts` (modify) | Call `money.accountBalance` instead of the inline fold. |
| `packages/ledger/src/accounts/read-net-worth.ts` (create) | `readNetWorth(db)` → `{ mine, ours }` per currency, via `money.netWorth`. |
| `packages/db/src/figures/signed.sql.ts` (create) | One `signedAmount` SQL fragment; both services import it. |
| `packages/db/src/figures/net-worth.ts` (create) | `netWorth(db)` server query, §3. |
| `apps/api/src/modules/accounts/accounts.service.ts` (modify) | Use the shared fragment. |
| `apps/api/src/modules/transactions/transactions.service.ts` (modify) | Use the shared fragment. |
| `packages/db/src/figures/differential.test.ts` (create) | **The deliverable.** One fixture, every class-F figure both ways, `toBe` on the eight-decimal string. |
| `tests/architecture.test.ts` (modify) | Add `figures` to `packages/db/src` ALLOWED. |
| `package.json` (modify) | `fast-check` root devDependency. |

---

### Task 1: Property tests pin what `money.ts` already promises

**Files:**
- Create: `packages/core/src/money.property.test.ts`
- Modify: `package.json` (root devDependencies)

**Interfaces:**
- Consumes: `money.signed`, `money.debtDelta`, `money.toMoney`, `money.dec`, `money.add`, `money.neg` from `packages/core/src/money.ts` (signatures in the file; `signed(tx, side = "from")`, `debtDelta(tx, side)` with `side` **required**).
- Produces: nothing new — this task's product is the test.

- [ ] **Step 1: Install fast-check**

```bash
pnpm add -Dw fast-check
```

Add beside it in root `package.json`, one line above the entry, no other edits: a comment is not legal in JSON, so put the reason in the commit message: *test tool, not a stack choice — §4.3 does not list it and need not.*

- [ ] **Step 2: Write the failing property tests**

```ts
// packages/core/src/money.property.test.ts
/**
 * Money arithmetic, for every input rather than the ones someone thought of.
 *
 * The four properties the board card names: `signed` on both legs,
 * `debtDelta(tx, side) = −signed(tx, side)` on both sides, decimal round-trips
 * lossless at scale 8, and no path through a JS number. The last is the one
 * only a property test can make: any single example that survives `Number`
 * looks fine; the generator finds the 17th significant digit.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import * as money from "./money.ts";

/** A scale-8 decimal string, up to numeric(20,8): 12 integer digits, 8 fractional. */
const moneyArb = fc
  .tuple(fc.bigInt({ min: 0n, max: 999_999_999_999n }), fc.bigInt({ min: 0n, max: 99_999_999n }))
  .map(([whole, frac]) => money.toMoney(`${whole}.${frac.toString().padStart(8, "0")}`));

const positiveMoneyArb = moneyArb.filter((m) => !money.isZero(m));

const txArb = fc.record({
  type: fc.constantFrom("income", "expense", "transfer", "adjustment") as fc.Arbitrary<money.TxnType>,
  amountOriginal: positiveMoneyArb,
  toAmount: positiveMoneyArb,
});

describe("money, for every input", () => {
  it("round-trips a scale-8 string losslessly", () => {
    fc.assert(fc.property(moneyArb, (m) => expect(money.toMoney(money.dec(m))).toBe(m)));
  });

  it("never passes an amount through a JS number", () => {
    // 0.1 + 0.2 is the canonical float failure; scale 8 makes it 0.30000000.
    // The stronger claim: for any two operands, add() equals the string result
    // decimal.js produces, which a float path could not reproduce past 15 digits.
    fc.assert(
      fc.property(moneyArb, moneyArb, (a, b) => {
        const viaMoney = money.add(a, b);
        const viaFloat = (Number(a) + Number(b)).toFixed(8);
        // They may agree on small inputs; the property is that money.add equals
        // the exact decimal, which we recompute independently here.
        const exact = money.toMoney(money.dec(a).plus(money.dec(b)));
        expect(viaMoney).toBe(exact);
        // And that the float path is NOT what we rely on: at least one
        // generated pair must disagree, or the generator is too narrow.
        return viaMoney !== viaFloat || money.dec(a).abs().lt(1e6);
      }),
    );
  });

  it("signs the source leg by type and the destination leg as toAmount", () => {
    fc.assert(
      fc.property(txArb, (tx) => {
        const from = money.signed(tx, "from");
        switch (tx.type) {
          case "income":
          case "adjustment":
            expect(from).toBe(tx.amountOriginal);
            break;
          case "expense":
            expect(from).toBe(money.neg(tx.amountOriginal));
            break;
          case "transfer":
            expect(from).toBe(money.neg(tx.amountOriginal));
            expect(money.signed(tx, "to")).toBe(tx.toAmount);
            break;
        }
      }),
    );
  });

  it("debtDelta is exactly −signed on both sides", () => {
    fc.assert(
      fc.property(txArb, fc.constantFrom("from", "to") as fc.Arbitrary<"from" | "to">, (tx, side) => {
        if (side === "to" && tx.type !== "transfer") return; // signed throws by design; §1
        expect(money.debtDelta(tx, side)).toBe(money.neg(money.signed(tx, side)));
      }),
    );
  });

  it("rounds half away from zero at scale 8, in both signs", () => {
    expect(money.round(money.toMoney("1.000000005"), 8)).toBe("1.00000001");
    expect(money.round(money.toMoney("-1.000000005"), 8)).toBe("-1.00000001");
  });
});
```

- [ ] **Step 3: Run to verify the suite runs and passes** (these pin existing behaviour; a failure here is a real finding — stop and report it)

Run: `npx vitest run packages/core/src/money.property.test.ts`
Expected: 5 passed.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml packages/core/src/money.property.test.ts
git commit -m "Money holds for every input, not only the ones someone tried

fast-check as a root devDependency — a test tool, not a stack choice.
Four properties the board card names, pinned: signed on both legs,
debtDelta = −signed on both sides, scale-8 round-trip, and no path
through a JS number.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The folds in `money.ts`

**Files:**
- Modify: `packages/core/src/money.ts` (append after `debtDelta`, before `export { Decimal }`)
- Create: `packages/core/src/figures.test.ts`

**Interfaces:**
- Produces (exact, later tasks depend on these):

```ts
export type LegRow = {
  type: TxnType;
  accountId: string;
  toAccountId?: string | null;
  amountOriginal: Money;
  toAmount?: Money | null;
};
export function accountBalance(openingBalance: Money, accountId: string, rows: readonly LegRow[]): Money;

export type BalanceRow = { ownership: "own" | "shared"; balance: Money };
export function netWorth(balances: readonly BalanceRow[]): { mine: Money; ours: Money };

export type DebtRow = {
  type: TxnType;
  amountOriginal: Money;
  toAmount?: Money | null;
  side: "from" | "to";
};
export function counterpartyBalance(rows: readonly DebtRow[]): Money;

export const clearingBalance: typeof accountBalance;
```

- [ ] **Step 1: Write the failing unit tests**

```ts
// packages/core/src/figures.test.ts
/**
 * The class-F folds, on rows written by hand so the expected figure can be
 * checked with a pencil. `computations.md` §2, §3, §7, §8 are the source of
 * every expected value here; the differential test in `packages/db` is where
 * the same fixture meets SQL.
 */

import { describe, expect, it } from "vitest";
import * as money from "./money.ts";

const m = (s: string) => money.toMoney(s);

describe("accountBalance — §2", () => {
  it("signs the source leg by type and adds the destination leg verbatim", () => {
    const rows: money.LegRow[] = [
      { type: "income", accountId: "a", amountOriginal: m("100") },
      { type: "expense", accountId: "a", amountOriginal: m("30.5") },
      { type: "adjustment", accountId: "a", amountOriginal: m("-2") },
      // a transfer OUT of a: source leg −40 on a
      { type: "transfer", accountId: "a", toAccountId: "b", amountOriginal: m("40"), toAmount: m("9.99") },
      // a transfer INTO a: destination leg +12.34 on a (not the source amount)
      { type: "transfer", accountId: "b", toAccountId: "a", amountOriginal: m("55"), toAmount: m("12.34") },
      // a row on another account entirely
      { type: "expense", accountId: "b", amountOriginal: m("999") },
    ];
    // 10 + 100 − 30.5 − 2 − 40 + 12.34 = 49.84
    expect(money.accountBalance(m("10"), "a", rows)).toBe("49.84000000");
  });

  it("is the opening balance when there are no rows — never NULL, never 0 losing the opening", () => {
    expect(money.accountBalance(m("5.5"), "a", [])).toBe("5.50000000");
  });
});

describe("netWorth — §3", () => {
  it("mine is own accounts only; ours is every account; business is in mine", () => {
    const balances: money.BalanceRow[] = [
      { ownership: "own", balance: m("100") },
      { ownership: "own", balance: m("-20") }, // a business account: still own, still mine
      { ownership: "shared", balance: m("50") },
    ];
    expect(money.netWorth(balances)).toEqual({ mine: "80.00000000", ours: "130.00000000" });
  });
});

describe("counterpartyBalance — §7", () => {
  it("negates the cash flow on the leg that carries the counterparty", () => {
    const rows: money.DebtRow[] = [
      // lent 200 (expense, from leg): receivable +200
      { type: "expense", amountOriginal: m("200"), side: "from" },
      // repaid 50 as a transfer INTO my bank, counterparty on the `to` leg: −50
      { type: "transfer", amountOriginal: m("999"), toAmount: m("50"), side: "to" },
    ];
    expect(money.counterpartyBalance(rows)).toBe("150.00000000");
  });
});

describe("clearingBalance — §8", () => {
  it("is an ordinary account balance", () => {
    expect(money.clearingBalance).toBe(money.accountBalance);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/core/src/figures.test.ts`
Expected: FAIL — `money.accountBalance is not a function`.

- [ ] **Step 3: Implement the folds**

Append to `packages/core/src/money.ts` immediately before `export { Decimal };`:

```ts
/* ── The class-F folds — computations.md §2, §3, §7, §8 ──────────────────── */

/**
 * The rows a balance is folded over: both legs of a transfer reach the fold,
 * and the fold decides which leg belongs to which account. Named `LegRow`
 * rather than "transaction" because a transaction contributes to two
 * accounts with two different amounts (§7.2), and a type that carried only
 * `amountOriginal` could not express the destination.
 */
export type LegRow = {
  type: TxnType;
  accountId: string;
  toAccountId?: string | null;
  amountOriginal: Money;
  toAmount?: Money | null;
};

/**
 * §2 — `opening_balance + Σ signed(from) + Σ to_amount`, in the account's own
 * currency. **Never `SUM(amount_pivot)`**: that column exists only on the
 * source leg. Full precision throughout; the caller rounds at the boundary.
 *
 * This is the phone's copy of the SQL in `packages/db/src/figures/`, and
 * `differential.test.ts` is what keeps the two equal.
 */
export const accountBalance = (
  openingBalance: Money,
  accountId: string,
  rows: readonly LegRow[],
): Money => {
  let total = dec(openingBalance);
  for (const row of rows) {
    if (row.accountId === accountId) total = total.plus(dec(signed(row, "from")));
    if (row.toAccountId === accountId) total = total.plus(dec(signed(row, "to")));
  }
  return toMoney(total);
};

export type BalanceRow = { ownership: "own" | "shared"; balance: Money };

/**
 * §3 — `mine` over `ownership = 'own'`, `ours` over every account. Business
 * accounts are **in** `mine`: the scope partition (§6.7) is a transaction-level
 * filter and cannot partition a balance composed of rows on both sides of it.
 * Receivables are excluded by construction — they are not accounts.
 */
export const netWorth = (balances: readonly BalanceRow[]): { mine: Money; ours: Money } => {
  let mine = dec(0);
  let ours = dec(0);
  for (const { ownership, balance } of balances) {
    const b = dec(balance);
    ours = ours.plus(b);
    if (ownership === "own") mine = mine.plus(b);
  }
  return { mine: toMoney(mine), ours: toMoney(ours) };
};

export type DebtRow = {
  type: TxnType;
  amountOriginal: Money;
  toAmount?: Money | null;
  side: "from" | "to";
};

/**
 * §7 — `Σ −signed(t, side)` where `side` is the leg carrying the counterparty.
 * The caller resolves the side from `counterparty_id` against `account_id` /
 * `to_account_id`; this fold only sums. The negation is the whole rule (§6.6).
 */
export const counterpartyBalance = (rows: readonly DebtRow[]): Money => {
  let total = dec(0);
  for (const row of rows) total = total.plus(dec(debtDelta(row, row.side)));
  return toMoney(total);
};

/** §8 — a clearing balance is an ordinary balance. Same function, named for the reader. */
export const clearingBalance = accountBalance;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run packages/core/src/figures.test.ts packages/core/src/money.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/money.ts packages/core/src/figures.test.ts
git commit -m "The class-F folds live in money.ts

accountBalance, netWorth, counterpartyBalance, clearingBalance — pure
folds over row arrays, full precision, rounded once at the boundary.
Net worth includes business accounts in mine (§3: the scope partition
is a transaction filter and cannot partition a balance).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The ledger readers use the folds

**Files:**
- Modify: `packages/ledger/src/accounts/read-accounts.ts:38-75` (the inline fold)
- Create: `packages/ledger/src/accounts/read-net-worth.ts`
- Test: `packages/ledger/src/test/figures.test.ts` (create)

**Interfaces:**
- Consumes: `money.accountBalance`, `money.netWorth` (Task 2); `ReplicaDb` from `../open.ts`; `ledgerSchema` from `../schema-map.ts`; `scratchLedger()` from `./scratch.ts` (returns `{ db, sqlite, close }`, one merged in-memory database).
- Produces:

```ts
export type LocalNetWorth = { currency: CurrencyCode; decimals: number; mine: Money; ours: Money };
export function readNetWorth<TRun, TSchema extends typeof ledgerSchema>(db: ReplicaDb<TRun, TSchema>): readonly LocalNetWorth[];
```
Per currency — there is no display currency yet and no rate to sum across (the *An account holds its own currency* card's rule).

- [ ] **Step 1: Write the failing test**

```ts
// packages/ledger/src/test/figures.test.ts
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { afterEach, describe, expect, it } from "vitest";
import { readAccounts } from "../accounts/read-accounts.ts";
import { readNetWorth } from "../accounts/read-net-worth.ts";
import { ledgerSchema } from "../schema-map.ts";
import { scratchLedger } from "./scratch.ts";

const { accounts, currencies, transactions } = ledgerSchema;
const PLN = currencyCode("PLN");

describe("the phone's class-F figures", () => {
  const scratch = scratchLedger();
  afterEach(() => scratch.close());

  it("computes balances and net worth through the money.ts folds", () => {
    scratch.db.insert(currencies).values({ code: PLN, name: "Polish Złoty", decimals: 2, isPivot: true }).run();
    scratch.db.insert(accounts).values([
      { id: id<"accounts">("a"), name: "Bank A · PLN", currency: PLN, openingBalance: money.toMoney("10"), ownership: "own" },
      { id: id<"accounts">("b"), name: "Household · PLN", currency: PLN, openingBalance: money.toMoney("0"), ownership: "shared" },
    ]).run();
    scratch.db.insert(transactions).values([
      { id: id<"transactions">("t1"), date: accountingDate("2026-09-01"), type: "income", accountId: id<"accounts">("a"), amountOriginal: money.toMoney("100"), currency: PLN, fxRate: money.pivotPerUnit("1") },
      { id: id<"transactions">("t2"), date: accountingDate("2026-09-02"), type: "transfer", accountId: id<"accounts">("a"), toAccountId: id<"accounts">("b"), amountOriginal: money.toMoney("40"), toAmount: money.toMoney("40"), currency: PLN, toCurrency: PLN, fxRate: money.pivotPerUnit("1") },
    ]).run();

    const byId = new Map(readAccounts(scratch.db).map((a) => [a.id, a.balance]));
    expect(byId.get(id<"accounts">("a"))).toBe("70.00000000");
    expect(byId.get(id<"accounts">("b"))).toBe("40.00000000");

    expect(readNetWorth(scratch.db)).toEqual([
      { currency: PLN, decimals: 2, mine: "70.00000000", ours: "110.00000000" },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/ledger/src/test/figures.test.ts`
Expected: FAIL — cannot find `../accounts/read-net-worth.ts`.

- [ ] **Step 3: Replace the inline fold in `read-accounts.ts`**

Replace the block from `const activeIds = new Set(...)` through the end of the balance computation with:

```ts
  const activeIds = new Set(active.map((account) => account.id));

  const rows =
    activeIds.size > 0
      ? db
          .select({
            type: transactions.type,
            accountId: transactions.accountId,
            toAccountId: transactions.toAccountId,
            amountOriginal: transactions.amountOriginal,
            toAmount: transactions.toAmount,
          })
          .from(transactions)
          .where(
            and(
              isNull(transactions.deletedAt),
              or(
                inArray(transactions.accountId, [...activeIds]),
                inArray(transactions.toAccountId, [...activeIds]),
              ),
            ),
          )
          .all()
      : [];

  return active.map((account) => ({
    id: account.id,
    name: account.name,
    kind: account.kind,
    currency: account.currency,
    decimals: account.decimals,
    // §2, through the one fold the phone and the differential test share.
    balance: money.accountBalance(account.openingBalance, account.id, rows),
  }));
```
Keep the existing imports; drop any now-unused local `Map`/`signed` usage.

- [ ] **Step 4: Create `read-net-worth.ts`**

```ts
// packages/ledger/src/accounts/read-net-worth.ts
/**
 * §3 net worth, per currency. No display currency exists on the phone yet and
 * no rate to sum across, so this is one `{mine, ours}` pair per currency held —
 * the same call `CurrencyTotals` makes on the Today screen, and for the same
 * reason: inventing a rate here is H21 with nothing to check it against.
 */

import type { CurrencyCode, Money } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import type { ReplicaDb } from "../open.ts";
import type { ledgerSchema } from "../schema-map.ts";
import { readAccountsForNetWorth } from "./read-accounts.ts";

export type LocalNetWorth = { currency: CurrencyCode; decimals: number; mine: Money; ours: Money };

export function readNetWorth<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): readonly LocalNetWorth[] {
  const byCurrency = new Map<CurrencyCode, { decimals: number; rows: money.BalanceRow[] }>();
  for (const account of readAccountsForNetWorth(db)) {
    const bucket = byCurrency.get(account.currency) ?? { decimals: account.decimals, rows: [] };
    bucket.rows.push({ ownership: account.ownership, balance: account.balance });
    byCurrency.set(account.currency, bucket);
  }
  return [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, { decimals, rows }]) => ({ currency, decimals, ...money.netWorth(rows) }));
}
```

And in `read-accounts.ts`, add `ownership` to the select and export a second reader that returns it (keep `LocalAccountSummary` unchanged for existing consumers):

```ts
export type LocalAccountForNetWorth = LocalAccountSummary & { ownership: "own" | "shared" };

/** Every active account with its ownership — what §3 needs and the summary does not carry. */
export function readAccountsForNetWorth<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): readonly LocalAccountForNetWorth[] { /* same query as readAccounts plus `ownership: accounts.ownership` in the select and the map */ }
```
Refactor so `readAccounts` is `readAccountsForNetWorth(db).map(({ ownership: _o, ...rest }) => rest)` — one query, one fold.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run packages/ledger`
Expected: all pass (existing session/write tests included — they exercise `readAccounts`).

- [ ] **Step 6: Commit**

```bash
git add packages/ledger/src/accounts/ packages/ledger/src/test/figures.test.ts
git commit -m "The ledger reads balances and net worth through the folds

read-accounts.ts stops inlining §2; read-net-worth.ts is §3 per
currency, because there is no display currency to sum across yet.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: One `signed` in SQL, and net worth on the server

**Files:**
- Create: `packages/db/src/figures/signed.sql.ts`
- Create: `packages/db/src/figures/net-worth.ts`
- Modify: `apps/api/src/modules/accounts/accounts.service.ts:1-60` (replace `sourceLeg`'s CASE with the fragment)
- Modify: `apps/api/src/modules/transactions/transactions.service.ts:41-47` (replace `signedAmount`)
- Modify: `tests/architecture.test.ts` — add `"figures"` to `"packages/db/src"` in `ALLOWED`
- Test: `packages/db/src/figures/net-worth.test.ts` (create; needs Postgres)

**Interfaces:**
- Produces:

```ts
// signed.sql.ts
export const signedFromLeg: SQL<Money>;   // CASE over transactions.type — §1 signed(t,'from')
// net-worth.ts
export type NetWorthRow = { currency: string; mine: Money; ours: Money };
export async function netWorth(db: Db): Promise<NetWorthRow[]>;  // Db = the type accounts.service.ts uses
```

- [ ] **Step 1: Write the failing test**

```ts
// packages/db/src/figures/net-worth.test.ts
import * as money from "@waltning/core/money";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scratchDatabase, type Scratch } from "../test/scratch.ts";
import { netWorth } from "./net-worth.ts";

describe("net worth — §3, in SQL", () => {
  let scratch: Scratch;
  beforeAll(async () => { scratch = await scratchDatabase("networth"); });
  afterAll(async () => { await scratch.drop(); });

  it("mine over own accounts, ours over all, per currency, business in mine", async () => {
    await scratch.sql`insert into currencies (code, name, decimals, is_pivot) values ('PLN','Polish Złoty',2,true)`;
    await scratch.sql`insert into accounts (id, name, currency, ownership, is_business, opening_balance)
      values ('a','Bank A · PLN','PLN','own',false,100),
             ('b','Biz · PLN','PLN','own',true,-20),
             ('c','Household · PLN','PLN','shared',false,50)`;
    const rows = await netWorth(scratch.db);
    expect(rows).toEqual([{ currency: "PLN", mine: "80.00000000", ours: "130.00000000" }]);
  });
});
```
(Use the same insert idioms `packages/db/src/**/*.test.ts` already use — check `fill-forward.test.ts` for the exact helper before inventing raw SQL; the account ids above must be valid for the `uuid` column — use the `id()` helper from `@waltning/core/id` with real UUIDs if the column refuses short strings.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm db:up && npx vitest run packages/db/src/figures/net-worth.test.ts`
Expected: FAIL — cannot find `./net-worth.ts`.

- [ ] **Step 3: The shared fragment**

```ts
// packages/db/src/figures/signed.sql.ts
/**
 * `computations.md` §1's `signed(t, 'from')`, in SQL, **once**.
 *
 * It was written twice — `accounts.service.ts` and `transactions.service.ts`
 * each carried the same CASE — which is exactly the drift surface §0a warns
 * about, and the third copy is `money.signed()` on the phone. The
 * differential test holds this one equal to that one; nothing holds two SQL
 * copies equal to each other.
 */

import type { Money } from "@waltning/core/money";
import { type SQL, sql } from "drizzle-orm";
import { transactions } from "../schema.ts";

export const signedFromLeg: SQL<Money> = sql<Money>`
  CASE ${transactions.type}
    WHEN 'expense'  THEN -${transactions.amountOriginal}
    WHEN 'transfer' THEN -${transactions.amountOriginal}
    ELSE                   ${transactions.amountOriginal}
  END`;
```
Check `packages/db/src/schema.ts` for the actual export name of the transactions table and the `Db` type the services use; bind to those names exactly.

- [ ] **Step 4: Net worth in SQL**

```ts
// packages/db/src/figures/net-worth.ts
/**
 * §3, server side. A sum of §2 balances grouped by currency and split by
 * ownership — never a cross-currency sum, and business accounts are in
 * `mine` (the scope partition is a transaction filter, not a balance one).
 */

import type { Money } from "@waltning/core/money";
import { sql } from "drizzle-orm";
import { accounts, transactions } from "../schema.ts";
import type { Db } from "../client.ts"; // ← use the real name from packages/db
import { signedFromLeg } from "./signed.sql.ts";

export type NetWorthRow = { currency: string; mine: Money; ours: Money };

const live = sql`${transactions.deletedAt} is null`;

const balance = sql<Money>`(
  ${accounts.openingBalance}
  + coalesce((select sum(${signedFromLeg}) from ${transactions}
              where ${transactions.accountId} = ${accounts.id} and ${live}), 0)
  + coalesce((select sum(${transactions.toAmount}) from ${transactions}
              where ${transactions.toAccountId} = ${accounts.id} and ${live}), 0)
)`;

export async function netWorth(db: Db): Promise<NetWorthRow[]> {
  const rows = await db
    .select({
      currency: accounts.currency,
      mine: sql<Money>`sum(case when ${accounts.ownership} = 'own' then ${balance} else 0 end)::numeric(20,8)::text`,
      ours: sql<Money>`sum(${balance})::numeric(20,8)::text`,
    })
    .from(accounts)
    .where(sql`${accounts.archived} = false`)
    .groupBy(accounts.currency)
    .orderBy(accounts.currency);
  return rows;
}
```

- [ ] **Step 5: Replace the two inline CASEs**

In `accounts.service.ts`, `sourceLeg` becomes:
```ts
const sourceLeg = sql<string>`
  coalesce((SELECT sum(${signedFromLeg}) FROM ${transactions}
            WHERE ${transactions.accountId} = ${accounts.id} AND ${live}), 0)`;
```
In `transactions.service.ts`, delete the local `signedAmount` and import `signedFromLeg` in its place. Update the doc comment that said "one implementation of it" — it is true now.

- [ ] **Step 6: Allowlist the folder and run**

In `tests/architecture.test.ts`, `"packages/db/src": ["figures", "fx", "seed", "test"]`.

Run: `npx vitest run packages/db apps/api tests/architecture.test.ts`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/figures apps/api/src/modules/accounts/accounts.service.ts apps/api/src/modules/transactions/transactions.service.ts tests/architecture.test.ts
git commit -m "signed() in SQL exactly once, and net worth on the server

Two services carried the same CASE; now one fragment. §3 net worth
had no SQL at all — the phone would have been the only implementation
of a figure the spec files under 'one implementation, in SQL'.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The differential test

**Files:**
- Create: `packages/db/src/figures/differential.test.ts`
- Create: `packages/db/src/figures/fixture.ts` (the one fixture, as plain data both sides load)

**Interfaces:**
- Consumes: `money.accountBalance`, `money.netWorth`, `money.counterpartyBalance` (Task 2); `netWorth` and `listAccounts`-equivalent SQL (Task 4); `scratchDatabase` (Postgres).
- Produces: the proof. Nothing imports this.

- [ ] **Step 1: The fixture — designed to hit the three ways two sums disagree**

```ts
// packages/db/src/figures/fixture.ts
/**
 * One fixture, loaded into Postgres AND handed to money.ts, so every class-F
 * figure is computed both ways from identical rows.
 *
 * Built to provoke §14's three silent disagreements: **rounding order**
 * (eight-decimal amounts whose sum rounds differently if rounded per row),
 * **sign convention** (every transaction type, both transfer legs, a
 * negative adjustment), and **NULL-versus-zero** (an account with no rows,
 * a transfer with no destination amount on a non-transfer type).
 */

import type { Money, TxnType } from "@waltning/core/money";
import * as money from "@waltning/core/money";

export const CURRENCIES = [{ code: "PLN", decimals: 2 }, { code: "USD", decimals: 2 }] as const;

export const ACCOUNTS = [
  { id: "00000000-0000-4000-8000-00000000000a", name: "Bank A · PLN", currency: "PLN", ownership: "own", isBusiness: false, opening: "10.12345678" },
  { id: "00000000-0000-4000-8000-00000000000b", name: "Biz · PLN", currency: "PLN", ownership: "own", isBusiness: true, opening: "0" },
  { id: "00000000-0000-4000-8000-00000000000c", name: "Household · PLN", currency: "PLN", ownership: "shared", isBusiness: false, opening: "-5.5" },
  { id: "00000000-0000-4000-8000-00000000000d", name: "Cash · USD", currency: "USD", ownership: "own", isBusiness: false, opening: "3" },
  { id: "00000000-0000-4000-8000-00000000000e", name: "Empty · PLN", currency: "PLN", ownership: "own", isBusiness: false, opening: "0" },
] as const;

export type FixtureTx = {
  id: string; date: string; type: TxnType; accountId: string; toAccountId?: string;
  amountOriginal: string; toAmount?: string; currency: string; toCurrency?: string;
  counterpartyId?: string; counterpartyRole?: "debt";
};

export const TRANSACTIONS: readonly FixtureTx[] = [
  { id: "…001", date: "2026-09-01", type: "income", accountId: ACCOUNTS[0].id, amountOriginal: "100.00000001", currency: "PLN" },
  { id: "…002", date: "2026-09-01", type: "expense", accountId: ACCOUNTS[0].id, amountOriginal: "0.00000001", currency: "PLN" },
  { id: "…003", date: "2026-09-02", type: "adjustment", accountId: ACCOUNTS[0].id, amountOriginal: "-2.5", currency: "PLN" },
  { id: "…004", date: "2026-09-02", type: "transfer", accountId: ACCOUNTS[0].id, toAccountId: ACCOUNTS[2].id, amountOriginal: "40.33333333", toAmount: "40.33333333", currency: "PLN", toCurrency: "PLN" },
  { id: "…005", date: "2026-09-03", type: "transfer", accountId: ACCOUNTS[0].id, toAccountId: ACCOUNTS[3].id, amountOriginal: "3.99", toAmount: "1.00000000", currency: "PLN", toCurrency: "USD" },
  { id: "…006", date: "2026-09-03", type: "expense", accountId: ACCOUNTS[1].id, amountOriginal: "7.77777777", currency: "PLN" },
  // debt: lent 200 from Bank A (from leg), repaid 50 by transfer into Bank A (to leg)
  { id: "…007", date: "2026-09-04", type: "expense", accountId: ACCOUNTS[0].id, amountOriginal: "200", currency: "PLN", counterpartyId: "cp-1", counterpartyRole: "debt" },
  { id: "…008", date: "2026-09-05", type: "transfer", accountId: ACCOUNTS[2].id, toAccountId: ACCOUNTS[0].id, amountOriginal: "50", toAmount: "50", currency: "PLN", toCurrency: "PLN", counterpartyId: "cp-1", counterpartyRole: "debt" },
];
// Replace "…00N" with full UUIDs of the same form as the accounts before use.

export const ACCOUNT_IDS = ACCOUNTS.map((a) => a.id);
```
(Also write a deleted row — `deletedAt` set — so both sides prove they exclude it.)

- [ ] **Step 2: The test**

```ts
// packages/db/src/figures/differential.test.ts
/**
 * The differential test — the board card's deliverable.
 *
 * Every class-F figure computed in SQL against real Postgres and in
 * `money.ts` against the same rows, asserted equal **as eight-decimal
 * strings**. Not `toBeCloseTo`: the failure this exists to catch is the one
 * where both sides look right and differ in the last place.
 *
 * Changing the rounding mode on one side alone must turn this red — the
 * fixture's 0.00000001 rows are what make that true.
 */

import * as money from "@waltning/core/money";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scratchDatabase, type Scratch } from "../test/scratch.ts";
import { ACCOUNTS, CURRENCIES, TRANSACTIONS } from "./fixture.ts";
import { netWorth } from "./net-worth.ts";
import { signedFromLeg } from "./signed.sql.ts";
import { accounts, transactions } from "../schema.ts";

describe("class-F figures agree to eight decimals, SQL against money.ts", () => {
  let scratch: Scratch;
  beforeAll(async () => {
    scratch = await scratchDatabase("differential");
    // load CURRENCIES, ACCOUNTS, TRANSACTIONS via drizzle inserts — see net-worth.test.ts for the idiom
  });
  afterAll(async () => { await scratch.drop(); });

  it("§2 account balance, every account, including the empty one", async () => {
    const live = sql`${transactions.deletedAt} is null`;
    const rows = await scratch.db.select({
      id: accounts.id,
      balance: sql<string>`(${accounts.openingBalance}
        + coalesce((select sum(${signedFromLeg}) from ${transactions} where ${transactions.accountId} = ${accounts.id} and ${live}), 0)
        + coalesce((select sum(${transactions.toAmount}) from ${transactions} where ${transactions.toAccountId} = ${accounts.id} and ${live}), 0)
      )::numeric(20,8)::text`,
    }).from(accounts);

    const legRows: money.LegRow[] = TRANSACTIONS.map((t) => ({
      type: t.type, accountId: t.accountId, toAccountId: t.toAccountId ?? null,
      amountOriginal: money.toMoney(t.amountOriginal), toAmount: t.toAmount ? money.toMoney(t.toAmount) : null,
    }));
    for (const account of ACCOUNTS) {
      const sqlSide = rows.find((r) => r.id === account.id)?.balance;
      const tsSide = money.accountBalance(money.toMoney(account.opening), account.id, legRows);
      expect(sqlSide, account.name).toBe(tsSide);
    }
  });

  it("§3 net worth, per currency", async () => {
    const sqlSide = await netWorth(scratch.db);
    // TS side: balances from the fold above, grouped by currency
    // …compute with money.netWorth per currency and expect(sqlSide).toEqual(tsSide)
  });

  it("§7 counterparty balance", async () => {
    // SQL: Σ −signed on the leg carrying cp-1; TS: money.counterpartyBalance over the same rows with `side` resolved
    // expect both to be "150.00000000"
  });

  it("excludes soft-deleted rows on both sides", async () => { /* the deleted row moves neither figure */ });
});
```
Fill each `…` with real code before running — the plan's "no placeholders" rule applies to the file, not to this excerpt.

- [ ] **Step 3: Run to verify it passes**

Run: `npx vitest run packages/db/src/figures`
Expected: all pass.

- [ ] **Step 4: Break it once — the card's *Done when***

Temporarily change `ROUND_HALF_UP` to `ROUND_HALF_EVEN` in `money.ts`'s Decimal clone. Run the differential test. Expected: at least one `§2` assertion fails on the `…005`/`…002` rows. Revert. Record the failing output in the PR description.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/figures/
git commit -m "The differential test — SQL and money.ts agree to the eighth decimal

One fixture built to provoke rounding order, sign convention and
NULL-versus-zero. Every class-F figure both ways, toBe on the string.
Flipping the rounding mode on one side turns it red (proven, reverted).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Spec, gate, PR

- [ ] **Step 1: Spec check.** If any figure's code diverged from `computations.md` (e.g. net-worth grouping by currency is not stated there), add the sentence to the relevant § in the same commit. §0's table row for §3 should mention "per currency until a display currency exists".

- [ ] **Step 2: Full gate**

Run: `git add -A && pnpm verify`
Expected: green. (Visual suite unaffected — no UI changed.)

- [ ] **Step 3: Push and open the PR** against `main`, title *"Every class-F figure twice, held equal by one test"*, body quoting each of the four board cards' *Done when* and how it was met, including the break-it-once output from Task 5 step 4. End the body with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
