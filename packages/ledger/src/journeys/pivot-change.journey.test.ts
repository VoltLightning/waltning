/**
 * Proves: flows/J10-currency-and-rates.md §4 ("Change the pivot"), SPEC.md
 * §7.0 "Change the pivot" (the brief cites §7.6 "pivot change" — that phrase
 * is not a verbatim heading anywhere in SPEC.md; §7.0's pivot/display table
 * and its "Change the pivot" bullet are where the operation is actually
 * specified, and §7.6 covers manual overrides instead), §7.7 (the ten-day
 * carry cap this rewrite must not let a stale bridge dodge).
 * Findings: R1 M4, R1 M1-r4, R1 H1-r5 — fixed by #119 (orphan reciprocal),
 * R1 H2-r5 — fixed by #119 (carry clock reset), R1 M1-r5 — fixed by #119
 * (drops rows silently).
 */
import { accountingDate } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { ledgerSchema } from "../schema-map.ts";
import { openJourney } from "./harness.ts";
import { PIVOT, seedCurrency, seedRate } from "./seed.ts";

const EUR = money.currencyCode("EUR");
const USD = money.currencyCode("USD");

function setup() {
  const j = openJourney();
  seedCurrency(j, PIVOT, { isPivot: true });
  seedCurrency(j, EUR);
  seedCurrency(j, USD);
  return j;
}

/** Every `fx_rates` row on the replica — the rewrite's own table, raw. */
function fxRows(j: ReturnType<typeof openJourney>) {
  return j.raw().replica.db.select().from(ledgerSchema.fxRates).all();
}

describe("change_pivot — SPEC.md §7.0's rewrite, one date at a time", () => {
  it("R1 H1-r5 — a carried-forward row cannot stand in as the new pivot's own bridge", () => {
    const j = setup();
    try {
      // The only "bridge" to EUR on 2026-01-01 is itself a carried-forward
      // copy with no real EUR quote at or before that date — an orphan.
      seedRate(j, PIVOT, EUR, "2026-01-01", "0.90", "carried_forward");
      seedRate(j, PIVOT, USD, "2026-01-01", "0.25", "nbp");
      seedRate(j, PIVOT, USD, "2026-01-02", "0.25", "carried_forward");
      seedRate(j, PIVOT, EUR, "2026-01-02", "0.91", "nbp");

      j.session.changePivot({ code: EUR }, j.capture);

      const rows = fxRows(j);
      const day1 = accountingDate("2026-01-01");
      const day2 = accountingDate("2026-01-02");

      // The orphaned bridge produces nothing derived from it at all — not
      // a rebased quote, not a reciprocal row for the old pivot.
      expect(rows.filter((r) => r.base === EUR && r.date === day1)).toHaveLength(0);

      expect(rows.some((r) => r.base === EUR && r.quote === USD && r.date === day2)).toBe(true);
      expect(rows.some((r) => r.base === EUR && r.quote === PIVOT && r.date === day2)).toBe(true);

      // Every surviving carried-forward (or otherwise non-original) EUR
      // row traces to a real, non-carried quote for the same pair at or
      // before its own date — never to another carried row.
      for (const row of rows.filter((r) => r.base === EUR && r.source === "carried_forward")) {
        const hasRealOrigin = rows.some(
          (other) =>
            other.base === row.base &&
            other.quote === row.quote &&
            other.source !== "carried_forward" &&
            other.date <= row.date,
        );
        expect(hasRealOrigin).toBe(true);
      }
    } finally {
      j.close();
    }
  });

  it("R1 H2-r5 — a rebased row's freshness clock must not reset to the leg's own date", () => {
    const j = setup();
    try {
      // The EUR bridge is 20 days stale by 2026-01-21 (real quote on
      // 2026-01-01, carried onward): the rewrite must not let the USD leg,
      // stamped on 2026-01-11, read as only 10 days old.
      seedRate(j, PIVOT, EUR, "2026-01-01", "0.90", "nbp");
      seedRate(j, PIVOT, EUR, "2026-01-11", "0.90", "carried_forward");
      seedRate(j, PIVOT, USD, "2026-01-11", "0.25", "nbp");

      j.session.changePivot({ code: EUR }, j.capture);

      const readRate = j.session.readRate({
        base: EUR,
        quote: USD,
        date: accountingDate("2026-01-21"),
      });
      expect(readRate).toBeNull();
    } finally {
      j.close();
    }
  });

  it("R1 M1-r5 — a dropped date is reported, not swallowed", () => {
    const j = setup();
    try {
      // 28 daily USD quotes, none bridged to EUR except the last day —
      // every earlier date has nothing to rebase against and is dropped.
      for (let day = 1; day <= 28; day += 1) {
        const date = `2026-01-${String(day).padStart(2, "0")}`;
        seedRate(j, PIVOT, USD, date, "0.25", "nbp");
      }
      seedRate(j, PIVOT, EUR, "2026-01-28", "0.90", "nbp");

      // Main's `LocalCurrencyRow` carries no count of what it dropped — this
      // cast is the one permitted `unknown` in this file (excluded from
      // `tests/unknown-budget.test.ts`'s scan, which skips `.test.` files
      // entirely; verified, no budget entry needed). R1's fix must make
      // `droppedDates` a real field.
      const result = j.session.changePivot({ code: EUR }, j.capture) as unknown as {
        droppedDates?: number;
      };

      const rows = j.session.listFxRates({
        base: EUR,
        quote: USD,
        from: accountingDate("2026-01-01"),
        to: accountingDate("2026-01-28"),
      });
      expect(rows).toHaveLength(1);
      expect(result.droppedDates).toBe(27);
    } finally {
      j.close();
    }
  });
});
