/**
 * Proves: SPEC.md §6.5 ("Integrity constraints" — `currencies_decimals_sane`,
 * `decimals BETWEEN 0 AND 8`, the rule this script scans every op for).
 * Findings: R4 H2, R4 C1-r3, R4 M1-r3.
 *
 * **Why `createAccount` carries the finding here.** The header's three ids
 * name candidate defects this fixed script can surface, not three separate
 * `it.fails`; the brief's own instruction is "mark `it.fails` with the
 * finding of the first op that leaks", and this script's own ordering
 * decides which one that is. `create_account`'s executor
 * (`accounts/create-account.executor.ts`) writes `opening_balance` straight
 * from the input with no currency-scale check anywhere in its path —
 * `zMoney` (`packages/core/src/zod.ts`) only bounds total digits against
 * `numeric(20,8)`, never a specific currency's own `decimals` — so an
 * over-scale opening balance is the first leak this script reaches, and
 * `"R4 C1-r3"` ("C" for `create_account`, rediscovered against round 3) is
 * the id used below. `"R4 H2"` and `"R4 M1-r3"` stay in the header as the
 * other defects this same scan is built to catch — `transactions.fee`,
 * `transaction_lines.amount`, `settle_debt`'s `amount`/`discharges.amount`,
 * and `reconcile_account`'s `observed_balance` are none of them
 * currency-scale checked either (verified by reading every executor this
 * script exercises) — should a rebase fix `create_account` first, this
 * script's later probes take over as "the first op that leaks" and the
 * finding id in the `it.fails` title moves with them, per the fix-agent
 * convention that only flips or strengthens, never invents past what a
 * covering test actually shows.
 *
 * **No `debt_reassignments` scan.** The brief names
 * `debt_reassignments.amount`, but no such table exists in `ledgerSchema`
 * (`../schema-map.ts`) on this branch — `settle_debt`'s own executor note
 * explains why: the debt fields it stamps land on two columns of
 * `transactions` (`debt_currency`/`debt_amount`, both scanned below), not a
 * separate table. A rebase that adds the table gains this scan then.
 */

import { accountingDate } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import {
  createAccountInput,
  createTransactionInput,
  reconcileAccountInput,
  setTransactionLinesInput,
  settleDebtInput,
  updateCurrencyInput,
} from "@waltning/core/registry/inputs";
import { describe, it } from "vitest";
import { type Journey, openJourney } from "../journeys/harness.ts";
import { ID, PIVOT, seedCounterparty, seedCurrency, seedRate } from "../journeys/seed.ts";
import { ledgerSchema } from "../schema-map.ts";

const USD = money.currencyCode("USD");
const JPY = money.currencyCode("JPY");
const RATE_DATE = accountingDate("2026-02-01");
const DATE = accountingDate("2026-02-10");
const LATER_DATE = accountingDate("2026-02-20");

/** A distinct, valid-shaped id per slot — `ID.*` covers three accounts, two transactions and two counterparties, and this script needs many more of each. */
function uid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(4, "0")}00000000`;
}

const ACCOUNT_JPY = uid(1);
const ACCOUNT_PLN2 = uid(2);
const ACCOUNT_LEAK = uid(3);
const ACCOUNT_LEAK_JPY = uid(4);
const ACCOUNT_PAD = uid(5);
const ACCOUNT_PAD2 = uid(6);

function currencyDecimals(j: Journey): ReadonlyMap<string, number> {
  const rows = j
    .raw()
    .replica.db.select({
      code: ledgerSchema.currencies.code,
      decimals: ledgerSchema.currencies.decimals,
    })
    .from(ledgerSchema.currencies)
    .all();
  return new Map(rows.map((r) => [r.code, r.decimals]));
}

/**
 * Every money column §7.2 governs, scanned against the row's own currency:
 * `transactions.amount_original/to_amount/fee/debt_amount`,
 * `transaction_lines.amount` (against its parent transaction's currency),
 * `accounts.opening_balance/expected_balance`,
 * `recurring_transactions.amount_original`. See the file header for why
 * `debt_reassignments` is not here.
 */
function assertScaleHolds(j: Journey, label: string): void {
  const decimals = currencyDecimals(j);
  const scaleOf = (code: string): number => {
    const found = decimals.get(code);
    if (found === undefined) throw new Error(`${label}: no currency row for ${code}`);
    return found;
  };

  const check = (value: string | null, currency: string | null, where: string): void => {
    if (value === null || currency === null) return;
    const places = money.dec(value).decimalPlaces();
    const max = scaleOf(currency);
    if (places > max) {
      throw new Error(
        `${label}: ${where} = ${value} carries ${places} decimal place(s), more than ` +
          `${currency}'s own ${max} (SPEC.md §7.2)`,
      );
    }
  };

  const db = j.raw().replica.db;

  const transactions = db.select().from(ledgerSchema.transactions).all();
  const txnCurrency = new Map<string, string>(transactions.map((t) => [t.id, t.currency]));

  for (const t of transactions) {
    check(t.amountOriginal, t.currency, `transactions[${t.id}].amount_original`);
    check(t.toAmount, t.toCurrency, `transactions[${t.id}].to_amount`);
    check(t.fee, t.currency, `transactions[${t.id}].fee`);
    check(t.debtAmount, t.debtCurrency, `transactions[${t.id}].debt_amount`);
  }

  for (const l of db.select().from(ledgerSchema.transactionLines).all()) {
    check(l.amount, txnCurrency.get(l.transactionId) ?? null, `transaction_lines[${l.id}].amount`);
  }

  for (const a of db.select().from(ledgerSchema.accounts).all()) {
    check(a.openingBalance, a.currency, `accounts[${a.id}].opening_balance`);
    check(a.expectedBalance, a.currency, `accounts[${a.id}].expected_balance`);
  }

  for (const r of db.select().from(ledgerSchema.recurringTransactions).all()) {
    check(r.amountOriginal, r.currency, `recurring_transactions[${r.id}].amount_original`);
  }
}

function setup(): Journey {
  const j = openJourney();
  seedCurrency(j, PIVOT, { isPivot: true, decimals: 2 });
  seedCurrency(j, USD, { decimals: 2 });
  seedCurrency(j, JPY, { decimals: 0 });
  seedRate(j, PIVOT, USD, RATE_DATE, "0.2500", "nbp");
  seedRate(j, PIVOT, JPY, RATE_DATE, "0.0300", "nbp");
  seedCounterparty(j, ID.cpA, "Placeholder");
  return j;
}

describe("scale after every op — SPEC.md §7.2", () => {
  it.fails("R4 C1-r3 — create_account's opening_balance carries no currency-scale check (op 15 of the fixed script)", () => {
    const j = setup();
    try {
      let n = 0;
      const step = (label: string, run: () => void): void => {
        n += 1;
        try {
          run();
        } catch {
          // A refused write is a legitimate outcome of an illegal input — the
          // invariant this script checks is about stored rows, not about
          // whether every op accepts every input. See
          // read-equals-write.test.ts for the same pattern.
        }
        assertScaleHolds(j, `op ${n} (${label})`);
      };

      /* ── Group A (ops 1-14) — a well-scaled script establishing state the later probes reuse. ── */

      step("createAccount PLN", () => {
        j.session.createAccount(
          createAccountInput.parse({
            id: ID.accountPln,
            name: "Bank A · PLN",
            currency: PIVOT,
            openingBalance: "1000.00",
          }),
          j.capture,
        );
      });

      step("createAccount USD", () => {
        j.session.createAccount(
          createAccountInput.parse({
            id: ID.accountUsd,
            name: "Bank B · USD",
            currency: USD,
            openingBalance: "500.00",
          }),
          j.capture,
        );
      });

      step("createAccount JPY", () => {
        j.session.createAccount(
          createAccountInput.parse({
            id: ACCOUNT_JPY,
            name: "Bank C · JPY",
            currency: JPY,
            openingBalance: "10000",
          }),
          j.capture,
        );
      });

      step("createAccount PLN #2", () => {
        j.session.createAccount(
          createAccountInput.parse({
            id: ACCOUNT_PLN2,
            name: "Bank D · PLN",
            currency: PIVOT,
            openingBalance: "0.00",
          }),
          j.capture,
        );
      });

      step("createTransaction expense PLN", () => {
        j.session.createTransaction(
          createTransactionInput.parse({
            id: uid(11),
            date: DATE,
            type: "expense",
            accountId: ID.accountPln,
            amountOriginal: "100.00",
            currency: PIVOT,
          }),
          j.capture,
        );
      });

      step("createTransaction income USD", () => {
        j.session.createTransaction(
          createTransactionInput.parse({
            id: uid(12),
            date: DATE,
            type: "income",
            accountId: ID.accountUsd,
            amountOriginal: "50.00",
            currency: USD,
          }),
          j.capture,
        );
      });

      step("createTransaction transfer PLN->USD with fee", () => {
        j.session.createTransaction(
          createTransactionInput.parse({
            id: uid(13),
            date: DATE,
            type: "transfer",
            accountId: ID.accountPln,
            amountOriginal: "40.00",
            currency: PIVOT,
            toAccountId: ID.accountUsd,
            toAmount: "10.00",
            toCurrency: USD,
            fee: "1.00",
          }),
          j.capture,
        );
      });

      step("createTransaction expense JPY", () => {
        j.session.createTransaction(
          createTransactionInput.parse({
            id: uid(14),
            date: DATE,
            type: "expense",
            accountId: ACCOUNT_JPY,
            amountOriginal: "500",
            currency: JPY,
          }),
          j.capture,
        );
      });

      step("createTransaction expense PLN (debt lend)", () => {
        j.session.createTransaction(
          createTransactionInput.parse({
            id: uid(15),
            date: DATE,
            type: "expense",
            accountId: ID.accountPln,
            amountOriginal: "20.00",
            currency: PIVOT,
            counterpartyId: ID.cpA,
            counterpartyRole: "debt",
          }),
          j.capture,
        );
      });

      step("setTransactionLines on the PLN expense", () => {
        j.session.setTransactionLines(
          setTransactionLinesInput.parse({
            transactionId: uid(11),
            version: 1,
            lines: [
              { id: uid(31), description: "Part A", amount: "40.00" },
              { id: uid(32), description: "Part B", amount: "60.00" },
            ],
          }),
          j.capture,
        );
      });

      step("reconcileAccount PLN", () => {
        j.session.reconcileAccount(
          reconcileAccountInput.parse({
            accountId: ID.accountPln,
            adjustmentId: uid(41),
            observedBalance: "1.00",
            asOf: LATER_DATE,
          }),
          j.capture,
        );
      });

      step("settleDebt partial", () => {
        j.session.settleDebt(
          settleDebtInput.parse({
            id: uid(51),
            counterpartyId: ID.cpA,
            accountId: ID.accountPln,
            date: LATER_DATE,
            amount: "10.00",
            currency: PIVOT,
            discharges: { currency: PIVOT, amount: "10.00" },
          }),
          j.capture,
        );
      });

      step("updateCurrency PLN symbol", () => {
        j.session.updateCurrency(
          updateCurrencyInput.parse({ code: PIVOT, version: 1, patch: { symbol: "zł" } }),
          j.capture,
        );
      });

      step("createTransaction income PLN (padding)", () => {
        j.session.createTransaction(
          createTransactionInput.parse({
            id: uid(16),
            date: DATE,
            type: "income",
            accountId: ID.accountPln,
            amountOriginal: "5.00",
            currency: PIVOT,
          }),
          j.capture,
        );
      });

      /* ── Group B (ops 15-40) — leak probes, one over-scale value per registry operation kind. ── */

      step("createAccount PLN, opening_balance over 2dp", () => {
        j.session.createAccount(
          createAccountInput.parse({
            id: ACCOUNT_LEAK,
            name: "Bank E · PLN",
            currency: PIVOT,
            openingBalance: "1.005",
          }),
          j.capture,
        );
      });

      step("createTransaction expense PLN, amount_original over 2dp", () => {
        j.session.createTransaction(
          createTransactionInput.parse({
            id: uid(21),
            date: DATE,
            type: "expense",
            accountId: ID.accountPln,
            amountOriginal: "1.005",
            currency: PIVOT,
          }),
          j.capture,
        );
      });

      step("createTransaction expense JPY, amount_original over 0dp", () => {
        j.session.createTransaction(
          createTransactionInput.parse({
            id: uid(22),
            date: DATE,
            type: "expense",
            accountId: ACCOUNT_JPY,
            amountOriginal: "0.5",
            currency: JPY,
          }),
          j.capture,
        );
      });

      step("createTransaction transfer, to_amount over 2dp", () => {
        j.session.createTransaction(
          createTransactionInput.parse({
            id: uid(23),
            date: DATE,
            type: "transfer",
            accountId: ID.accountPln,
            amountOriginal: "40.00",
            currency: PIVOT,
            toAccountId: ID.accountUsd,
            toAmount: "1.005",
            toCurrency: USD,
          }),
          j.capture,
        );
      });

      step("createTransaction transfer, fee over 2dp", () => {
        j.session.createTransaction(
          createTransactionInput.parse({
            id: uid(24),
            date: DATE,
            type: "transfer",
            accountId: ID.accountPln,
            amountOriginal: "40.00",
            currency: PIVOT,
            toAccountId: ID.accountUsd,
            toAmount: "10.00",
            toCurrency: USD,
            fee: "1.005",
          }),
          j.capture,
        );
      });

      step("setTransactionLines, a line over 2dp (sum still exact)", () => {
        j.session.setTransactionLines(
          setTransactionLinesInput.parse({
            transactionId: uid(11),
            version: 2,
            lines: [
              { id: uid(33), description: "Part A", amount: "40.005" },
              { id: uid(34), description: "Part B", amount: "59.995" },
            ],
          }),
          j.capture,
        );
      });

      step("settleDebt, amount over 2dp", () => {
        j.session.settleDebt(
          settleDebtInput.parse({
            id: uid(52),
            counterpartyId: ID.cpA,
            accountId: ID.accountPln,
            date: LATER_DATE,
            amount: "5.005",
            currency: PIVOT,
            discharges: { currency: PIVOT, amount: "5.005" },
          }),
          j.capture,
        );
      });

      step("reconcileAccount, observed_balance over 2dp", () => {
        j.session.reconcileAccount(
          reconcileAccountInput.parse({
            accountId: ACCOUNT_PLN2,
            adjustmentId: uid(42),
            observedBalance: "0.005",
            asOf: LATER_DATE,
          }),
          j.capture,
        );
      });

      step("createAccount JPY, opening_balance over 0dp", () => {
        j.session.createAccount(
          createAccountInput.parse({
            id: ACCOUNT_LEAK_JPY,
            name: "Bank F · JPY",
            currency: JPY,
            openingBalance: "0.5",
          }),
          j.capture,
        );
      });

      step("updateCurrency USD symbolPosition (padding)", () => {
        j.session.updateCurrency(
          updateCurrencyInput.parse({ code: USD, version: 1, patch: { symbolPosition: "S" } }),
          j.capture,
        );
      });

      step("createTransaction income PLN, amount_original over 2dp", () => {
        j.session.createTransaction(
          createTransactionInput.parse({
            id: uid(25),
            date: DATE,
            type: "income",
            accountId: ID.accountPln,
            amountOriginal: "2.005",
            currency: PIVOT,
          }),
          j.capture,
        );
      });

      step("createTransaction expense USD, amount_original over 2dp", () => {
        j.session.createTransaction(
          createTransactionInput.parse({
            id: uid(26),
            date: DATE,
            type: "expense",
            accountId: ID.accountUsd,
            amountOriginal: "3.005",
            currency: USD,
          }),
          j.capture,
        );
      });

      step("createTransaction income JPY, amount_original over 0dp", () => {
        j.session.createTransaction(
          createTransactionInput.parse({
            id: uid(27),
            date: DATE,
            type: "income",
            accountId: ACCOUNT_JPY,
            amountOriginal: "1.5",
            currency: JPY,
          }),
          j.capture,
        );
      });

      step("createTransaction transfer USD->PLN, amount_original over 2dp", () => {
        j.session.createTransaction(
          createTransactionInput.parse({
            id: uid(28),
            date: DATE,
            type: "transfer",
            accountId: ID.accountUsd,
            amountOriginal: "5.005",
            currency: USD,
            toAccountId: ID.accountPln,
            toAmount: "20.00",
            toCurrency: PIVOT,
          }),
          j.capture,
        );
      });

      step("setTransactionLines on the USD income, a line over 2dp", () => {
        j.session.setTransactionLines(
          setTransactionLinesInput.parse({
            transactionId: uid(12),
            version: 1,
            lines: [
              { id: uid(35), description: "Part A", amount: "20.005" },
              { id: uid(36), description: "Part B", amount: "29.995" },
            ],
          }),
          j.capture,
        );
      });

      step("settleDebt, a second over-2dp discharge", () => {
        j.session.settleDebt(
          settleDebtInput.parse({
            id: uid(53),
            counterpartyId: ID.cpA,
            accountId: ID.accountPln,
            date: LATER_DATE,
            amount: "1.005",
            currency: PIVOT,
            discharges: { currency: PIVOT, amount: "1.005" },
          }),
          j.capture,
        );
      });

      step("reconcileAccount JPY, observed_balance over 0dp", () => {
        j.session.reconcileAccount(
          reconcileAccountInput.parse({
            accountId: ACCOUNT_JPY,
            adjustmentId: uid(43),
            observedBalance: "10000.5",
            asOf: LATER_DATE,
          }),
          j.capture,
        );
      });

      step("createAccount PLN (padding, well-scaled)", () => {
        j.session.createAccount(
          createAccountInput.parse({
            id: ACCOUNT_PAD,
            name: "Bank G · PLN",
            currency: PIVOT,
            openingBalance: "10.00",
          }),
          j.capture,
        );
      });

      step("createTransaction expense PLN (padding, well-scaled)", () => {
        j.session.createTransaction(
          createTransactionInput.parse({
            id: uid(29),
            date: DATE,
            type: "expense",
            accountId: ACCOUNT_PAD,
            amountOriginal: "1.00",
            currency: PIVOT,
          }),
          j.capture,
        );
      });

      step("createTransaction income USD (padding, well-scaled)", () => {
        j.session.createTransaction(
          createTransactionInput.parse({
            id: uid(30),
            date: DATE,
            type: "income",
            accountId: ID.accountUsd,
            amountOriginal: "1.00",
            currency: USD,
          }),
          j.capture,
        );
      });

      step("setTransactionLines (padding, well-scaled)", () => {
        j.session.setTransactionLines(
          setTransactionLinesInput.parse({
            transactionId: uid(29),
            version: 1,
            lines: [
              { id: uid(37), description: "Part A", amount: "0.50" },
              { id: uid(38), description: "Part B", amount: "0.50" },
            ],
          }),
          j.capture,
        );
      });

      step("reconcileAccount PLN #2 (padding, well-scaled)", () => {
        j.session.reconcileAccount(
          reconcileAccountInput.parse({
            accountId: ID.accountPln,
            adjustmentId: uid(44),
            observedBalance: "500.00",
            asOf: LATER_DATE,
          }),
          j.capture,
        );
      });

      step("updateCurrency PLN symbol #2 (padding, well-scaled)", () => {
        j.session.updateCurrency(
          updateCurrencyInput.parse({ code: PIVOT, version: 2, patch: { symbol: "PLN" } }),
          j.capture,
        );
      });

      step("createTransaction expense JPY (padding, well-scaled)", () => {
        j.session.createTransaction(
          createTransactionInput.parse({
            id: uid(39),
            date: DATE,
            type: "expense",
            accountId: ACCOUNT_JPY,
            amountOriginal: "1",
            currency: JPY,
          }),
          j.capture,
        );
      });

      step("settleDebt (padding, well-scaled)", () => {
        j.session.settleDebt(
          settleDebtInput.parse({
            id: uid(54),
            counterpartyId: ID.cpA,
            accountId: ID.accountPln,
            date: LATER_DATE,
            amount: "1.00",
            currency: PIVOT,
            discharges: { currency: PIVOT, amount: "1.00" },
          }),
          j.capture,
        );
      });

      step("createAccount PLN (final padding, well-scaled)", () => {
        j.session.createAccount(
          createAccountInput.parse({
            id: ACCOUNT_PAD2,
            name: "Bank H · PLN",
            currency: PIVOT,
            openingBalance: "0.00",
          }),
          j.capture,
        );
      });
    } finally {
      j.close();
    }
  });
});
