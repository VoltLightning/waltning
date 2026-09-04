/**
 * `set_manual_rate`, on the device — §7.6 level 2, *"correct a bad or
 * missing provider figure… a range writes one `manual` row per day across
 * it"*.
 *
 * **Every rate input refuses `base !== pivot`.** `fx_rates` is stored one
 * way only, `(base = pivot, quote = X)` (§4) — there is no other shape a
 * hand-entered rate could take, and the pivot is data the input's own Zod
 * schema cannot see (only the replica knows which currency it is).
 *
 * **Checked before anything is written.** `overwriteManual` carries S18 §8's
 * second confirmation as data, and a partial write followed by a refusal
 * would leave some days replaced and others not — indistinguishable from a
 * bug. The whole range is validated first; the loop that follows cannot
 * fail.
 *
 * **C1 — the row a manual write overwrites is preserved, not lost.** Before
 * this, `clear_manual_rate` deleted the `manual` row and left a hole exactly
 * where the provider's own figure used to be — undoing a correction produced
 * a *worse* state than never correcting it. `displaced_rate` /
 * `displaced_source` / `displaced_fetched_at` hold whatever the date held
 * before this write, so clearing restores it instead of guessing. A second
 * manual write over an already-manual row (`overwriteManual`) carries the
 * *existing* displaced trio forward unchanged — it must never copy from
 * another `manual` row, or the original provider figure this correction
 * chain started from would be lost on the second edit.
 *
 * **H3 — a corrected date invalidates every `carried_forward` row that
 * descended from it.** Those rows hold a *copy* of the rate they were
 * carrying forward, taken at the date this write now overwrites; leaving
 * them in place would keep answering reads with a stale figure no provider
 * ever published. Deleted here rather than repaired, because nothing on the
 * phone can re-derive what a synced `carried_forward` row should say next —
 * arc 2's sync (or a later `readCoverage` gap) repopulates it.
 */

import { type AccountingDate, addDays } from "@waltning/core/date";
import type { CurrencyCode } from "@waltning/core/money";
import { type SetManualRateInput, setManualRateInput } from "@waltning/core/registry/inputs";
import { and, desc, eq, gte, lte, ne } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";

const { currencies, fxRates } = schema;

type ReplicaTx = LocalTx<unknown, typeof schema>;
type LocalFxRateRow = typeof fxRates.$inferSelect;

/** See `read-rate.ts`'s own copy — the server's carried-forward marker. */
const CARRIED_FORWARD = "carried_forward";

export type SetManualRateResult = { written: number; replacedManual: number };

export const setManualRateExecutor = defineLocalExecutor<
  typeof setManualRateInput,
  SetManualRateResult,
  ReplicaTx
>({
  operation: "set_manual_rate",
  opVersion: 1,
  input: setManualRateInput,
  mints: () => [],
  apply: (input, tx) => setManualRate(input, tx),
});

/** Every date from `from` to `to`, inclusive. */
function dateRange(from: AccountingDate, to: AccountingDate): AccountingDate[] {
  const dates: AccountingDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  return dates;
}

/**
 * The nearest row `≤ asOf` whose own source is real — the same walk-back
 * `read-rate.ts#findOrigin` does, kept as a separate copy because this one
 * runs against the pre-write state to decide which `carried_forward` rows
 * this write is about to orphan (H3).
 */
function findOrigin(
  tx: ReplicaTx,
  { base, quote, asOf }: { base: CurrencyCode; quote: CurrencyCode; asOf: AccountingDate },
): LocalFxRateRow | undefined {
  const [real] = tx
    .select()
    .from(fxRates)
    .where(
      and(
        eq(fxRates.base, base),
        eq(fxRates.quote, quote),
        lte(fxRates.date, asOf),
        ne(fxRates.source, CARRIED_FORWARD),
      ),
    )
    .orderBy(desc(fxRates.date))
    .limit(1)
    .all();
  return real;
}

function setManualRate(input: SetManualRateInput, tx: ReplicaTx): SetManualRateResult {
  const [pivot] = tx.select().from(currencies).where(eq(currencies.isPivot, true)).all();
  if (!pivot) {
    throw new LocalRefusal("set_manual_rate: no pivot currency is set", { dependency: true });
  }
  if (input.base !== pivot.code) {
    throw new LocalRefusal(
      `set_manual_rate: base must be the pivot (${pivot.code}) — every rate is quoted against it`,
    );
  }

  const dates = dateRange(input.from, input.to);
  const existing = tx
    .select()
    .from(fxRates)
    .where(
      and(
        eq(fxRates.base, input.base),
        eq(fxRates.quote, input.quote),
        gte(fxRates.date, input.from),
        lte(fxRates.date, input.to),
      ),
    )
    .all();
  const existingByDate = new Map(existing.map((row) => [row.date, row]));

  if (!input.overwriteManual) {
    const conflict = dates.find((date) => existingByDate.get(date)?.source === "manual");
    if (conflict) {
      throw new LocalRefusal(
        `set_manual_rate: ${conflict} already has a manual rate — pass overwriteManual to replace it`,
      );
    }
  }

  // H3 — every `carried_forward` row (any date, this pair) whose origin,
  // *before* this write, resolves to one of the dates being corrected. Its
  // own `rate` is a copy taken from that origin, and this write is about to
  // change what the origin says.
  const allCarried = tx
    .select()
    .from(fxRates)
    .where(
      and(
        eq(fxRates.base, input.base),
        eq(fxRates.quote, input.quote),
        eq(fxRates.source, CARRIED_FORWARD),
      ),
    )
    .all();
  const correctedDates = new Set<string>(dates);
  const orphaned = allCarried.filter((row) => {
    const origin = findOrigin(tx, { base: input.base, quote: input.quote, asOf: row.date });
    return origin !== undefined && correctedDates.has(origin.date);
  });
  for (const row of orphaned) {
    tx.delete(fxRates)
      .where(
        and(eq(fxRates.base, row.base), eq(fxRates.quote, row.quote), eq(fxRates.date, row.date)),
      )
      .run();
  }

  let replacedManual = 0;
  for (const date of dates) {
    const priorRow = existingByDate.get(date);
    if (priorRow?.source === "manual") replacedManual += 1;

    // C1 — what this write displaces. A second manual write over an
    // already-manual row carries the *existing* displaced trio forward
    // unchanged (never copies from another `manual` row); anything else
    // preserves the row that was actually there, or nothing when the date
    // was empty.
    const displaced =
      priorRow === undefined
        ? { displacedRate: null, displacedSource: null, displacedFetchedAt: null }
        : priorRow.source === "manual"
          ? {
              displacedRate: priorRow.displacedRate,
              displacedSource: priorRow.displacedSource,
              displacedFetchedAt: priorRow.displacedFetchedAt,
            }
          : {
              displacedRate: priorRow.rate,
              displacedSource: priorRow.source,
              displacedFetchedAt: priorRow.fetchedAt,
            };

    tx.insert(fxRates)
      .values({
        base: input.base,
        quote: input.quote,
        date,
        rate: input.rate,
        source: "manual",
        ...displaced,
      })
      .onConflictDoUpdate({
        target: [fxRates.base, fxRates.quote, fxRates.date],
        set: { rate: input.rate, source: "manual", ...displaced },
      })
      .run();
  }

  return { written: dates.length, replacedManual };
}
