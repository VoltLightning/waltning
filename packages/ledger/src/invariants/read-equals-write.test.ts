/**
 * Proves: SPEC.md §7.6 (one rate per date, the one in effect), computations.md
 * §1 (a figure is computed once). Findings: R1 H1-r4 — fixed by #119,
 * R1 L5-r5 — fixed by #119.
 *
 * **What "read equals write" means here.** `readRate` (`currencies/read-rate.ts`)
 * is the answer a screen would show for a date; `create_transaction`'s own
 * `provisionalFxRate` (`transactions/create-transaction.executor.ts`) is the
 * answer the local write path actually stamps onto the row. §7.6 states one
 * rate per date, "the one in effect" — so a capture on date `d` must land at
 * exactly the rate `readRate({ date: d })` names, or (past the ten-day cap,
 * or before any rate exists) must be written back with `fxRateEstimated`
 * true rather than a silent `false`.
 *
 * **Why this fails on main, for essentially every date.** `provisionalFxRate`'s
 * `lastKnownRate` helper is explicitly *not* filtered by date (its own
 * comment: "§14.5 mirrors last-known rates only... a `date <= input.date`
 * filter would return nothing for any back-dated capture") — it always reads
 * the single most-recent row in the whole `fx_rates` table, regardless of
 * the transaction's own date. `readRate`, by contrast, is filtered to
 * `date <= d` exactly. Once a table holds more than one date's worth of
 * rows (this file seeds sixty), those two answers coincide only by
 * accident (R1 H1-r4). Separately, `fx_rate_estimated` is never set by the
 * local executor at all — the column's own `false` default stands
 * (R1 L5-r5) — so the "shown is null" branch below also fails whenever a
 * row still lands.
 */

import { addDays } from "@waltning/core/date";
import { id as brandId, type Id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { describe, it } from "vitest";
import { openJourney, transactionRows } from "../journeys/harness.ts";
import { ID, PIVOT, seedAccount, seedCurrency, seedRate } from "../journeys/seed.ts";
import { generateRateTable, RATE_TABLE_START } from "./rate-table.ts";

const USD = money.currencyCode("USD");
const DAYS = 60;
const SEEDS = [1, 2, 3, 4, 5] as const;

/** Storage scale for a rate (`numeric(24,12)`) — the same precision `weekend-capture.journey.test.ts`'s own `asRateMoney` rounds to. */
const asRateMoney = (rate: money.PivotPerUnit | money.UnitsPerPivot): money.Money =>
  money.round(money.toMoney(rate, 12), 12);

function hex(n: number, len: number): string {
  return (n >>> 0).toString(16).padStart(len, "0").slice(-len);
}

/** A distinct, valid-shaped transaction id per (seed, day index) — sixty dates need sixty rows, and `ID.*` carries only two fixed transaction ids. */
function txnId(seed: number, index: number): Id<"transactions"> {
  const a = hex(seed * 2654435761 + index * 40503, 8);
  const b = hex(index, 4);
  const c = hex(seed, 3);
  const d = hex(index * 7 + seed, 3);
  const e = hex(seed * 40503 + index, 8) + hex((seed + index) * 2246822519, 4);
  return brandId<"transactions">(`${a}-${b}-4${c}-8${d}-${e}`);
}

function setup(seed: number) {
  const j = openJourney();
  seedCurrency(j, PIVOT, { isPivot: true });
  seedCurrency(j, USD);
  seedAccount(j, ID.accountUsd, "Bank B · USD", USD);
  for (const row of generateRateTable(seed, DAYS)) {
    seedRate(j, PIVOT, USD, row.date, row.rate, row.source);
  }
  return j;
}

describe("read-equals-write — SPEC.md §7.6, computations.md §1", () => {
  for (const seed of SEEDS) {
    it(`R1 H1-r4 — seed ${seed}: create_transaction's stored rate must equal what readRate answers for the same date`, () => {
      const j = setup(seed);
      try {
        for (let i = 0; i < DAYS; i++) {
          const date = addDays(RATE_TABLE_START, i);
          const shown = j.session.readRate({ base: PIVOT, quote: USD, date });

          const id = txnId(seed, i);
          try {
            j.session.createTransaction(
              {
                id,
                date,
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
          } catch {
            // A refused write is a legitimate outcome of a missing rate —
            // "read equals write" only constrains what a *landed* row says.
          }

          const row = transactionRows(j).find((r) => r.id === id);

          if (shown) {
            const expected = asRateMoney(money.reciprocal(shown.rate));
            if (!row) {
              throw new Error(
                `seed ${seed}, ${date}: readRate answered ${shown.rate} but no row was written`,
              );
            }
            const actual = asRateMoney(row.fxRate);
            if (actual !== expected || row.fxRateEstimated !== false) {
              throw new Error(
                `seed ${seed}, ${date}: readRate answered ${shown.rate} (asOf ${shown.asOf}) — ` +
                  `expected stored fxRate ${expected} with fxRateEstimated=false, got ${actual} ` +
                  `with fxRateEstimated=${row.fxRateEstimated}`,
              );
            }
          } else if (row && row.fxRateEstimated !== true) {
            throw new Error(
              `seed ${seed}, ${date}: readRate found nothing, but the stored row landed with ` +
                `fxRateEstimated=false — a missing rate must be marked estimated, not silently exact`,
            );
          }
        }
      } finally {
        j.close();
      }
    });
  }
});
