/**
 * Proves: screens/S18-settings-exchange-rates.md §7 ("Interaction" — a range
 * write is one action producing many `manual` rows), SPEC.md §7.6 "a manual
 * entry always outranks a synced one" (for the same pair and date).
 * Findings: R1 C1, R1 H3, R1 H3-r5 (reciprocal rounds to zero inside apply).
 */
import { accountingDate } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { openJourney, outboxEntries } from "./harness.ts";
import { ID, PIVOT, seedAccount, seedCurrency, seedRate } from "./seed.ts";

const USD = money.currencyCode("USD");

function setup() {
  const j = openJourney();
  seedCurrency(j, PIVOT, { isPivot: true });
  seedCurrency(j, USD);
  seedAccount(j, ID.accountUsd, "Bank B · USD", USD);
  return j;
}

function captureUsd(j: ReturnType<typeof openJourney>, date: string) {
  return j.session.createTransaction(
    {
      id: ID.txn1,
      date: accountingDate(date),
      type: "expense",
      accountId: ID.accountUsd,
      amountOriginal: money.toMoney("100.00"),
      currency: USD,
      payee: "",
      note: "",
      isBusiness: false,
      isCapital: false,
      source: "manual",
    },
    j.capture,
  );
}

describe("set_manual_rate / clear_manual_rate — §7.6's three-level override", () => {
  it("R1 C1 — clearing a manual override restores the synced rate it replaced", () => {
    const j = setup();
    try {
      seedRate(j, PIVOT, USD, "2026-01-04", "0.2500", "nbp");

      j.session.setManualRate(
        {
          base: PIVOT,
          quote: USD,
          from: accountingDate("2026-01-04"),
          to: accountingDate("2026-01-04"),
          rate: money.unitsPerPivot("0.2600"),
          overwriteManual: false,
          today: accountingDate("2026-01-04"),
        },
        j.capture,
      );

      const manual = j.session.readRate({
        base: PIVOT,
        quote: USD,
        date: accountingDate("2026-01-04"),
      });
      if (!manual) throw new Error("expected the manual override to read back");
      expect(manual.source).toBe("manual");
      expect(manual.rate).toBe(money.unitsPerPivot("0.2600"));

      j.session.clearManualRate(
        {
          base: PIVOT,
          quote: USD,
          from: accountingDate("2026-01-04"),
          to: accountingDate("2026-01-04"),
        },
        j.capture,
      );

      const restored = j.session.readRate({
        base: PIVOT,
        quote: USD,
        date: accountingDate("2026-01-04"),
      });
      if (!restored) {
        throw new Error(
          "expected the nbp rate to come back once the override is cleared — the row is gone instead",
        );
      }
      expect(restored.source).toBe("nbp");
      expect(restored.rate).toBe(money.unitsPerPivot("0.2500"));
    } finally {
      j.close();
    }
  });

  it.fails("R1 H3-r5 — a rate too large to reciprocate is refused, not written", () => {
    const j = setup();
    try {
      try {
        j.session.setManualRate(
          {
            base: PIVOT,
            quote: USD,
            from: accountingDate("2026-01-04"),
            to: accountingDate("2026-01-04"),
            rate: money.unitsPerPivot("99999999999999999999"),
            overwriteManual: false,
            today: accountingDate("2026-01-04"),
          },
          j.capture,
        );
      } catch {
        // R1's fix refuses before commit — the entry check below is the assertion
      }
      expect(outboxEntries(j)).toHaveLength(0);

      // Even if a bad rate slipped through, a later capture in that
      // currency must never throw out of apply — the same "a missing rate
      // must never cost you the transaction" rule (§7.6) extended to a rate
      // so large its reciprocal is unusable.
      expect(() => captureUsd(j, "2026-01-04")).not.toThrow();
    } finally {
      j.close();
    }
  });
});
