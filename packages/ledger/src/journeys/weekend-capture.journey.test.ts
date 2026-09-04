/**
 * Proves: SPEC.md §7.6 table — "Weekend or holiday → carry forward the last published rate";
 * "Rates stale, offline → use the most recent held rate"; "No rate exists at all → nearest, marked estimated";
 * §7.7 (the preceding business day is what the jurisdiction values at).
 * Findings: R1 H1, R4 H3, R1 H1-r4 (Monday beat Friday), R1 H2-r4 (estimated set on every stale capture).
 */
import { accountingDate } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { openJourney, transactionRows } from "./harness.ts";
import { ID, PIVOT, seedAccount, seedCurrency, seedRate } from "./seed.ts";

const USD = money.currencyCode("USD");

/** Storage scale for a rate (`numeric(24,12)`) — the same precision `read-rate.ts` and the executor round to. */
const asRateMoney = (rate: money.PivotPerUnit | money.UnitsPerPivot): money.Money =>
  money.round(money.toMoney(rate, 12), 12);

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

describe("weekend and holiday capture — SPEC.md §7.6/§7.7's carry-forward table", () => {
  it.fails("R1 H1-r4 — a Sunday capture is valued at Monday's rate, not Friday's carried-forward one", () => {
    const j = setup();
    try {
      seedRate(j, PIVOT, USD, "2026-01-02", "0.2500", "nbp");
      seedRate(j, PIVOT, USD, "2026-01-03", "0.2500", "carried_forward");
      seedRate(j, PIVOT, USD, "2026-01-04", "0.2500", "carried_forward");
      seedRate(j, PIVOT, USD, "2026-01-05", "0.2273", "nbp");

      captureUsd(j, "2026-01-04");

      const readRate = j.session.readRate({
        base: PIVOT,
        quote: USD,
        date: accountingDate("2026-01-04"),
      });
      if (!readRate) throw new Error("expected a carried-forward rate for the Sunday date");
      expect(readRate.source).toBe("nbp");
      expect(readRate.asOf).toBe("2026-01-02");

      const [row] = transactionRows(j);
      if (!row) throw new Error("create_transaction wrote no row");
      expect(asRateMoney(row.fxRate)).toBe(asRateMoney(money.reciprocal(readRate.rate)));
      expect(row.fxRateEstimated).toBe(false);
    } finally {
      j.close();
    }
  });

  it("the next business day carries Monday's rate forward — one day stale, still inside the cap", () => {
    const j = setup();
    try {
      seedRate(j, PIVOT, USD, "2026-01-02", "0.2500", "nbp");
      seedRate(j, PIVOT, USD, "2026-01-03", "0.2500", "carried_forward");
      seedRate(j, PIVOT, USD, "2026-01-04", "0.2500", "carried_forward");
      seedRate(j, PIVOT, USD, "2026-01-05", "0.2273", "nbp");

      captureUsd(j, "2026-01-06");

      const readRate = j.session.readRate({
        base: PIVOT,
        quote: USD,
        date: accountingDate("2026-01-06"),
      });
      if (!readRate) throw new Error("expected Monday's held rate to carry forward");
      expect(readRate.source).toBe("nbp");
      expect(readRate.asOf).toBe("2026-01-05");
      expect(readRate.carriedDays).toBe(1);

      const [row] = transactionRows(j);
      if (!row) throw new Error("create_transaction wrote no row");
      expect(asRateMoney(row.fxRate)).toBe(asRateMoney(money.reciprocal(readRate.rate)));
      expect(row.fxRateEstimated).toBe(false);
    } finally {
      j.close();
    }
  });

  it.fails("R1 H1 — past the ten-day carry cap the row still lands, at the nearest real rate, marked estimated", () => {
    const j = setup();
    try {
      seedRate(j, PIVOT, USD, "2026-01-02", "0.2500", "nbp");
      seedRate(j, PIVOT, USD, "2026-01-03", "0.2500", "carried_forward");
      seedRate(j, PIVOT, USD, "2026-01-04", "0.2500", "carried_forward");
      seedRate(j, PIVOT, USD, "2026-01-05", "0.2273", "nbp");

      captureUsd(j, "2026-01-25");

      // §7.7: past the cap, `readRate` refuses rather than answering with a stale number.
      const readRate = j.session.readRate({
        base: PIVOT,
        quote: USD,
        date: accountingDate("2026-01-25"),
      });
      expect(readRate).toBeNull();

      const [row] = transactionRows(j);
      if (!row)
        throw new Error(
          "create_transaction wrote no row — a missing rate must never cost the capture",
        );
      expect(asRateMoney(row.fxRate)).toBe(
        asRateMoney(money.reciprocal(money.unitsPerPivot("0.2273"))),
      );
      expect(row.fxRateEstimated).toBe(true);
    } finally {
      j.close();
    }
  });

  it.fails("R1 H1 — a capture dated before any rate row lands at the nearest quote, marked estimated", () => {
    const j = setup();
    try {
      // Only a quote three days *after* the capture date exists — no row before it at all.
      seedRate(j, PIVOT, USD, "2026-01-02", "0.2500", "nbp");

      captureUsd(j, "2025-12-30");

      const readRate = j.session.readRate({
        base: PIVOT,
        quote: USD,
        date: accountingDate("2025-12-30"),
      });
      expect(readRate).toBeNull();

      const [row] = transactionRows(j);
      if (!row)
        throw new Error(
          "create_transaction wrote no row — a missing rate must never cost the capture",
        );
      expect(asRateMoney(row.fxRate)).toBe(
        asRateMoney(money.reciprocal(money.unitsPerPivot("0.2500"))),
      );
      expect(row.fxRateEstimated).toBe(true);
    } finally {
      j.close();
    }
  });
});
