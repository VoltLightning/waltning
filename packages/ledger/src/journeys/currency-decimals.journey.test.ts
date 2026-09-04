/**
 * Proves: SPEC.md §6.5 "Integrity constraints" (`currencies_decimals_sane` —
 * a figure never holds more places than its currency), CLAUDE.md "every
 * 'must never' gets both a service check (good error) and a constraint
 * (holds when code is wrong)".
 *
 * Findings: R4 C1-r3, R4 H-r4 (mirror parity).
 *
 * **`XAA` is seeded as its own pivot**, not alongside a separate pivot with a
 * seeded rate to it — `create_transaction`'s `provisionalFxRate` refuses to
 * write a row in a replica with no pivot currency at all, and refuses a
 * cross-currency row with no last-known rate (`create-transaction.executor.ts`).
 * Making `XAA` the pivot keeps every transaction's `fx_rate` a trivial `1`
 * and isolates this file's actual question — the decimals-shrink guard on
 * `update_currency` — from an unrelated FX dependency.
 *
 * **`updateAccount({ archived: true })` from the brief does not exist.**
 * `updateAccountInput`'s patch (`packages/core/src/registry/inputs.ts`) has
 * no `archived` field; the real operation is `archive_account`
 * (`archiveAccountInput: { id, version }`), used below. `update_account`
 * itself refuses outright on an archived row (`update-account.executor.ts`:
 * `if (current.archived) throw …`), which is also why the brief's "set the
 * opening balance to 1.12" step on the already-archived account cannot run
 * through that operation — there is no in-place way to shrink an archived
 * account's own stored precision. That inability is exactly the mirror-parity
 * gap this file's third scenario demonstrates instead.
 */

import { accountingDate } from "@waltning/core/date";
import { id as brandId } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { openJourney } from "./harness.ts";
import { ID, seedAccount, seedCurrency } from "./seed.ts";

const XAA = money.currencyCode("XAA");

function setup() {
  const j = openJourney();
  seedCurrency(j, XAA, { isPivot: true, decimals: 8 });
  seedAccount(j, ID.accountPln, "Bank D · XAA", XAA, { openingBalance: "1.12345678" });
  return j;
}

function currencyRow(j: ReturnType<typeof openJourney>) {
  const [row] = j
    .raw()
    .replica.db.select()
    .from(ledgerSchema.currencies)
    .where(eq(ledgerSchema.currencies.code, XAA))
    .all();
  if (!row) throw new Error("XAA missing from the seeded replica");
  return row;
}

function accountRow(j: ReturnType<typeof openJourney>) {
  const [row] = j
    .raw()
    .replica.db.select()
    .from(ledgerSchema.accounts)
    .where(eq(ledgerSchema.accounts.id, ID.accountPln))
    .all();
  if (!row) throw new Error("the seeded account is missing");
  return row;
}

function lineRows(j: ReturnType<typeof openJourney>) {
  return j
    .raw()
    .replica.db.select()
    .from(ledgerSchema.transactionLines)
    .where(eq(ledgerSchema.transactionLines.transactionId, ID.txn1))
    .all();
}

/** Archives the account, then books a live 0.12345678 XAA transaction with one line on it. */
function archiveAndBookLiveTransaction(j: ReturnType<typeof openJourney>) {
  j.session.archiveAccount({ id: ID.accountPln, version: 1 }, j.capture);

  const created = j.session.createTransaction(
    {
      id: ID.txn1,
      date: accountingDate("2026-01-01"),
      type: "expense",
      accountId: ID.accountPln,
      amountOriginal: money.toMoney("0.12345678"),
      currency: XAA,
      payee: "",
      note: "",
      isBusiness: false,
      isCapital: false,
      source: "manual",
    },
    j.capture,
  );

  const line = brandId<"transactionLines">("11111111-2222-4333-8444-555555555555");
  return j.session.setTransactionLines(
    {
      transactionId: ID.txn1,
      version: created.version,
      lines: [{ id: line, description: "Line", amount: money.toMoney("0.12345678") }],
    },
    j.capture,
  );
}

describe("update_currency — SPEC.md §7.2, a decimals shrink checked against live rows", () => {
  it("refuses to shrink decimals while a live transaction still names the currency, naming the count", () => {
    const j = setup();
    try {
      archiveAndBookLiveTransaction(j);

      expect(() =>
        j.session.updateCurrency(
          { code: XAA, version: currencyRow(j).version, patch: { decimals: 2 } },
          j.capture,
        ),
      ).toThrow(/decimals cannot shrink.*live account\(s\)\/transaction\(s\)/);

      expect(currencyRow(j).decimals).toBe(8); // refused — nothing changed
    } finally {
      j.close();
    }
  });

  it("succeeds once the live transaction is deleted, even though the archived account and its orphaned line still hold 8dp values", () => {
    const j = setup();
    try {
      const txn = archiveAndBookLiveTransaction(j);
      j.session.deleteTransaction({ id: ID.txn1, version: txn.version }, j.capture);

      const updated = j.session.updateCurrency(
        { code: XAA, version: currencyRow(j).version, patch: { decimals: 2 } },
        j.capture,
      );
      expect(updated.decimals).toBe(2);
    } finally {
      j.close();
    }
  });

  it.fails("R4 H-r4 — mirror parity: the live-reference check scans only `accounts` and `transactions`, so the archived account's opening balance and its soft-deleted transaction's line survive a decimals shrink at the old, wider scale", () => {
    const j = setup();
    try {
      const txn = archiveAndBookLiveTransaction(j);
      j.session.deleteTransaction({ id: ID.txn1, version: txn.version }, j.capture);

      const decimalsBefore = currencyRow(j).decimals;
      try {
        j.session.updateCurrency(
          { code: XAA, version: currencyRow(j).version, patch: { decimals: 2 } },
          j.capture,
        );
      } catch {
        // A fixed live-reference scan that also covers archived accounts and
        // soft-deleted transactions' lines may refuse the shrink outright —
        // that refusal is a legitimate outcome of a fix. This scenario's
        // invariant is about what decimals ends up stored and what any
        // surviving row carries, not about whether this call must succeed.
      }

      const decimals = currencyRow(j).decimals;
      expect(decimals).toBe(decimalsBefore); // shrink refused: nothing changed
      expect(money.dec(accountRow(j).openingBalance).decimalPlaces()).toBeLessThanOrEqual(decimals);
      for (const line of lineRows(j)) {
        expect(money.dec(line.amount).decimalPlaces()).toBeLessThanOrEqual(decimals);
      }
    } finally {
      j.close();
    }
  });
});
