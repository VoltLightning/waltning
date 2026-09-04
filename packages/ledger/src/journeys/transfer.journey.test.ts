/**
 * Proves: flows/J16-move-money.md §2–§4, computations.md §4a "FX margin on a
 * transfer" (a fee is a stated cost, in the source currency, ≥ 0 — distinct
 * from the rate margin), SPEC.md §7.5 (a transfer stores both legs; the
 * destination amount is copied from the input and never derived).
 *
 * Findings: R5 H1, R5 H3, R4 M2-r4 (fee sign), R4 H3-r4 (line scale),
 * R4 H1-r4 (malformed fee).
 *
 * **R5 H3 and R4 M2-r4 are already fixed on main.** `createTransactionInput`'s
 * own `superRefine` (`packages/core/src/registry/inputs.ts`) carries two
 * comments reading "H3 — `<= 0`, not `< 0`" against exactly `toAmount` and
 * `fee` — both scenarios below pass as plain `it`s, not `it.fails`, and are
 * reported as such rather than marked against a live finding.
 */

import { accountingDate } from "@waltning/core/date";
import { id as brandId } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { openJourney, outboxEntries, transactionRows } from "./harness.ts";
import { ID, PIVOT, seedAccount, seedCurrency, seedRate } from "./seed.ts";

const EUR = money.currencyCode("EUR");

function setup() {
  const j = openJourney();
  seedCurrency(j, PIVOT, { isPivot: true });
  seedCurrency(j, EUR);
  seedAccount(j, ID.accountPln, "Bank A · PLN", PIVOT);
  seedAccount(j, ID.accountEur, "Bank C · EUR", EUR);
  seedRate(j, PIVOT, EUR, "2026-03-12", "0.2300", "nbp");
  return j;
}

/** What a refusal actually guarantees: no row lands under the attempted id. */
function assertRefused(j: ReturnType<typeof openJourney>, id: string) {
  expect(transactionRows(j).some((r) => r.id === id)).toBe(false);
}

describe("create_transaction (transfer) — J16 §2–§4, computations.md §12.2", () => {
  it("a PLN → EUR transfer lands both legs as entered, valued at the row's own date", () => {
    const j = setup();
    try {
      const rate = j.session.readRate({
        base: PIVOT,
        quote: EUR,
        date: accountingDate("2026-03-12"),
      });
      expect(rate).toBeDefined();
      if (!rate) throw new Error("unreachable — asserted above");
      expect(rate.rate).toBe(money.unitsPerPivot("0.2300"));

      const created = j.session.createTransaction(
        {
          id: ID.txn1,
          date: accountingDate("2026-03-12"),
          type: "transfer",
          accountId: ID.accountPln,
          amountOriginal: money.toMoney("100.00"),
          currency: PIVOT,
          toAccountId: ID.accountEur,
          toAmount: money.toMoney("23.00"),
          toCurrency: EUR,
          payee: "",
          note: "",
          isBusiness: false,
          isCapital: false,
          source: "manual",
        },
        j.capture,
      );

      expect(created.currency).toBe(PIVOT);
      expect(created.toCurrency).toBe(EUR);
      // `to_amount` is copied from the input, never derived (§7.5) — and it
      // happens to be exactly what the row's own date's rate would produce,
      // which is the "valued at the row's date" the flow's screen shows.
      expect(money.eq(created.toAmount ?? money.ZERO, money.toMoney("23.00"))).toBe(true);
      expect(
        money.eq(
          money.fromPivot(created.amountOriginal, rate.rate),
          created.toAmount ?? money.ZERO,
        ),
      ).toBe(true);
      // PLN is the pivot, so the source leg's own provisional rate is exactly 1.
      expect(created.fxRate).toBe(money.pivotPerUnit("1"));
    } finally {
      j.close();
    }
  });

  it("a zero destination amount is refused before any outbox entry (transactions_to_amount_positive)", () => {
    const j = setup();
    try {
      const before = outboxEntries(j).length;
      expect(() =>
        j.session.createTransaction(
          {
            id: ID.txn1,
            date: accountingDate("2026-03-12"),
            type: "transfer",
            accountId: ID.accountPln,
            amountOriginal: money.toMoney("100.00"),
            currency: PIVOT,
            toAccountId: ID.accountEur,
            toAmount: money.toMoney("0.00"),
            toCurrency: EUR,
            payee: "",
            note: "",
            isBusiness: false,
            isCapital: false,
            source: "manual",
          },
          j.capture,
        ),
      ).toThrow();
      expect(outboxEntries(j)).toHaveLength(before);
      assertRefused(j, ID.txn1);
    } finally {
      j.close();
    }
  });

  it("a negative fee is refused before any outbox entry (transactions_fee_positive)", () => {
    const j = setup();
    try {
      const before = outboxEntries(j).length;
      expect(() =>
        j.session.createTransaction(
          {
            id: ID.txn1,
            date: accountingDate("2026-03-12"),
            type: "transfer",
            accountId: ID.accountPln,
            amountOriginal: money.toMoney("100.00"),
            currency: PIVOT,
            toAccountId: ID.accountEur,
            toAmount: money.toMoney("23.00"),
            toCurrency: EUR,
            fee: money.toMoney("-5.00"),
            payee: "",
            note: "",
            isBusiness: false,
            isCapital: false,
            source: "manual",
          },
          j.capture,
        ),
      ).toThrow();
      expect(outboxEntries(j)).toHaveLength(before);
      assertRefused(j, ID.txn1);
    } finally {
      j.close();
    }
  });

  it.fails("R4 H1-r4 — a malformed fee (more places than the source account's own currency) is not refused", () => {
    const j = setup();
    try {
      const before = outboxEntries(j).length;
      expect(() =>
        j.session.createTransaction(
          {
            id: ID.txn1,
            date: accountingDate("2026-03-12"),
            type: "transfer",
            accountId: ID.accountPln, // 2dp
            amountOriginal: money.toMoney("100.00"),
            currency: PIVOT,
            toAccountId: ID.accountEur,
            toAmount: money.toMoney("23.00"),
            toCurrency: EUR,
            fee: money.toMoney("1.005"), // 3dp into a 2dp source currency
            payee: "",
            note: "",
            isBusiness: false,
            isCapital: false,
            source: "manual",
          },
          j.capture,
        ),
      ).toThrow();
      expect(outboxEntries(j)).toHaveLength(before);
      assertRefused(j, ID.txn1);
    } finally {
      j.close();
    }
  });

  it.fails("R4 H3-r4 — set_transaction_lines checks only the lines' sum, never an individual line's own scale", () => {
    const j = setup();
    try {
      const created = j.session.createTransaction(
        {
          id: ID.txn1,
          date: accountingDate("2026-03-12"),
          type: "expense",
          accountId: ID.accountPln, // 2dp
          amountOriginal: money.toMoney("10.00"),
          currency: PIVOT,
          payee: "",
          note: "",
          isBusiness: false,
          isCapital: false,
          source: "manual",
        },
        j.capture,
      );

      const line1 = brandId<"transactionLines">("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
      const line2 = brandId<"transactionLines">("ffffffff-ffff-4fff-8fff-ffffffffffff");

      expect(() =>
        j.session.setTransactionLines(
          {
            transactionId: ID.txn1,
            version: created.version,
            lines: [
              { id: line1, description: "Part A", amount: money.toMoney("4.905") },
              { id: line2, description: "Part B", amount: money.toMoney("5.095") },
            ],
          },
          j.capture,
        ),
      ).toThrow();
    } finally {
      j.close();
    }
  });
});
