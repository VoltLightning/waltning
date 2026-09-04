/**
 * Proves: flows/J07-lend-and-settle.md §3–§5, SPEC.md §6.5 (a row's currency
 * is its account's).
 *
 * Findings: R2 H3, R4 (settle scale mirror).
 *
 * **Scenario (5) from the brief is dropped.** `settleDebtInput`
 * (`packages/core/src/registry/inputs.ts`) carries no field for the balance
 * the caller read — only `amount` and `discharges.{currency,amount}`, both
 * "what actually changed hands", never a residual (the schema's own comment:
 * *"No `residual` field exists here, by design… a residual is computed
 * *from* this write, never supplied *to* it"*). There is nothing for a stale
 * client figure to travel on, so R2 H4 / R2 H4-r3 ("balance moved") have no
 * scenario to write here without inventing an input field, which the
 * controller ruling forbids.
 */
import { accountingDate } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { openJourney, outboxEntries, transactionRows } from "./harness.ts";
import { ID, PIVOT, seedAccount, seedCounterparty, seedCurrency, seedRate } from "./seed.ts";

const USD = money.currencyCode("USD");

function setup() {
  const j = openJourney();
  seedCurrency(j, PIVOT, { isPivot: true });
  seedCurrency(j, USD);
  seedAccount(j, ID.accountPln, "Bank A · PLN", PIVOT);
  seedAccount(j, ID.accountUsd, "Bank B · USD", USD);
  seedCounterparty(j, ID.cpA, "Placeholder");
  // So a USD-denominated settlement resolves a provisional rate instead of
  // throwing "no last-known rate" — isolating scenario 3's actual question
  // (does `settle_debt` check the row's currency against its account's own?
  // SPEC.md §6.5) from an unrelated missing-rate refusal.
  seedRate(j, PIVOT, USD, "2026-03-01", "0.2500");
  return j;
}

/** The 100.00 PLN lend every scenario settles against. */
function lend(j: ReturnType<typeof openJourney>) {
  return j.session.createTransaction(
    {
      id: ID.txn1,
      date: accountingDate("2026-03-01"),
      type: "expense",
      accountId: ID.accountPln,
      amountOriginal: money.toMoney("100.00"),
      currency: PIVOT,
      counterpartyId: ID.cpA,
      counterpartyRole: "debt",
      payee: "Placeholder",
      note: "",
      isBusiness: false,
      isCapital: false,
      source: "manual",
    },
    j.capture,
  );
}

/** What a refusal actually guarantees: no row lands under the attempted id. */
function assertRefused(j: ReturnType<typeof openJourney>, id: string) {
  expect(transactionRows(j).some((r) => r.id === id)).toBe(false);
}

describe("settle_debt — J07 §3–§5, a settlement never implicitly clears a balance", () => {
  it("listCounterpartyBalances shows cpA owing 100.00 PLN after the lend", () => {
    const j = setup();
    try {
      lend(j);
      const rows = j.session.listCounterpartyBalances(accountingDate("2026-03-31"));
      const row = rows.find((r) => r.counterpartyId === ID.cpA && r.currency === PIVOT);
      expect(row).toBeDefined();
      expect(money.round(row?.balance ?? money.ZERO, row?.decimals ?? 2)).toBe("100.00");
    } finally {
      j.close();
    }
  });

  it("settling the full amount in the debt's own currency zeroes the balance and books income", () => {
    const j = setup();
    try {
      lend(j);
      const settled = j.session.settleDebt(
        {
          id: ID.txn2,
          counterpartyId: ID.cpA,
          accountId: ID.accountPln,
          date: accountingDate("2026-04-01"),
          amount: money.toMoney("100.00"),
          currency: PIVOT,
          discharges: { currency: PIVOT, amount: money.toMoney("100.00") },
          note: "",
        },
        j.capture,
      );

      expect(settled.row.type).toBe("income");
      expect(money.isZero(settled.residual)).toBe(true);

      const rows = j.session.listCounterpartyBalances(accountingDate("2026-04-01"));
      const row = rows.find((r) => r.counterpartyId === ID.cpA && r.currency === PIVOT);
      // Present-and-zero or dropped-because-zero both read as "settled" on
      // S14's own screen — this accepts whichever `readCounterpartyBalances`
      // produces rather than assuming one.
      if (row) expect(money.isZero(row.balance)).toBe(true);
    } finally {
      j.close();
    }
  });

  it.fails("R2 H3 — settle_debt never checks that `currency` names the destination account's own currency (SPEC.md §6.5)", () => {
    const j = setup();
    try {
      lend(j);
      expect(() =>
        j.session.settleDebt(
          {
            id: ID.txn2,
            counterpartyId: ID.cpA,
            accountId: ID.accountPln, // a PLN account
            date: accountingDate("2026-04-01"),
            amount: money.toMoney("40.00"),
            currency: USD, // claims dollars landed in a PLN account
            discharges: { currency: PIVOT, amount: money.toMoney("40.00") },
            note: "",
          },
          j.capture,
        ),
      ).toThrow();
      assertRefused(j, ID.txn2);
    } finally {
      j.close();
    }
  });

  it.fails("R4 — settle_debt mirrors no currency-scale check: settleDebtInput accepts more places than the currency's own decimals", () => {
    const j = setup();
    try {
      lend(j);
      const before = outboxEntries(j).length;
      expect(() =>
        j.session.settleDebt(
          {
            id: ID.txn2,
            counterpartyId: ID.cpA,
            accountId: ID.accountPln,
            date: accountingDate("2026-04-01"),
            amount: money.toMoney("100.005"), // three places into a 2dp currency
            currency: PIVOT,
            discharges: { currency: PIVOT, amount: money.toMoney("100.005") },
            note: "",
          },
          j.capture,
        ),
      ).toThrow();
      expect(outboxEntries(j)).toHaveLength(before); // refused before any outbox entry
      assertRefused(j, ID.txn2);
    } finally {
      j.close();
    }
  });
});
