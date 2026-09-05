/**
 * `change_pivot`, on the device — §7.0 *"genuinely rare, and the one heavy
 * operation left"*.
 *
 * **Refused while any live transaction exists** — `deleted_at is null`,
 * `computations.md` §1's T, the same filter every other read in this file
 * uses. Every stamped `fx_rate` in the ledger is pivot-per-unit against the
 * *current* pivot; re-basing them onto a new one is a full re-rating of
 * history, and a phone alone has no series to re-rate against — there is no
 * re-rating on a phone alone. So this is the first-run step (S29a), before
 * the first capture, or nothing.
 *
 * **The rewrite, in one pass per date.** `fx_rates` holds `(base = P, quote
 * = X, rate = r)` meaning `1 P = r X` (§4, units-per-pivot). For a date
 * where a bridging rate to the new pivot `Q` is held — `(base = P, quote =
 * Q, rate = k)`, meaning `1 P = k Q` — every other row on that date
 * re-bases by division: `1 Q = (1/k) P = (r/k) X`, so the new row is `(base
 * = Q, quote = X, rate = r/k)`. The old pivot itself becomes an ordinary
 * quote: `(base = Q, quote = P, rate = 1/k)`.
 *
 * ─── The guarantees this operation makes ──────────────────────────────────
 *
 * **Staleness and provenance are two facts, and `source` carries only the
 * second.** `fx_rates.source` says *who published this* — `nbp`, `manual`,
 * `derived`. How stale a figure is, is measured at read time by `readRate`,
 * which walks `carried_forward` rows back to a real origin and counts the
 * days. Stamping a real quote `carried_forward` to signal staleness broke
 * both readings at once: the row stopped naming its own provenance, and the
 * pair it belonged to became unreadable whenever no real row of the new pair
 * stood behind it. So this operation mints provenance and lets carry-forward
 * do its own work, at read time, from the rows below.
 *
 * 1. **A date is rebased only when its bridge is a real-source row** —
 *    `nbp`, `ecb`, `manual`, and so on, never `carried_forward` and never
 *    `derived`. A carried bridge holds no rate of its own, only a copy of an
 *    earlier day's, and dividing every other quote on the date by that copy
 *    produces figures no reader can date honestly. A carried or missing
 *    bridge therefore **drops the whole date**, counted in `droppedDates`.
 *    `readRate` then carries forward across the gap from whichever earlier
 *    date *did* rebase, with the true age (§7.7's ten-day cap measured from
 *    a real origin, not from the newest stored row).
 * 2. **A rebased cross row is stamped `derived`.** Both legs were published
 *    that day — the bridge is real by (1) and the leg is real by this rule —
 *    so the figure is fresh for its own date and `derived` names exactly
 *    what produced it: the triangulation, not a provider who never quoted
 *    this pair. **A leg whose own row is `carried_forward` is dropped**: it
 *    is a copy of an earlier real quote, and that earlier date has already
 *    produced (or been dropped with) its own `derived` row, which
 *    carry-forward reaches at read time.
 * 3. **The reciprocal `(newPivot, oldPivot)` keeps the bridge's own
 *    source.** `manual` stays `manual` — the person asserted that pair, and
 *    the reciprocal of an assertion is the same assertion, not a
 *    computation. A provider source stays that provider, for the same
 *    reason. Only a *cross* computed through the bridge is `derived`,
 *    including one computed from a `manual` leg.
 * 4. **After writing, the invariant is asserted rather than assumed** — every
 *    `carried_forward`/`derived` row this leaves for the new pivot traces to
 *    a real-source row for its own pair at or before its own date. That is
 *    the same check `pivot-change.journey.test.ts` runs from the outside;
 *    running it here too makes it a guarantee of the operation, and a
 *    violation refuses the whole rewrite rather than committing an orphan.
 *
 * **H2 — a rebased rate outside `money.ts`'s rate bounds drops its date too.**
 * Every parsed rate is bounded at the contract edge (`zUnitsPerPivot`), but
 * this operation *mints* rates by division and parses nothing, so a tiny
 * bridge under a large quote can produce a figure `numeric(24,12)` cannot
 * hold — or one whose reciprocal truncates to zero, which is the throw
 * `create_transaction`'s own `apply` used to hit on a rate this operation had
 * minted. Refused here, before the row exists, and counted like any other
 * dropped date.
 */

import { dec, rateInBounds, type UnitsPerPivot, unitsPerPivot } from "@waltning/core/money";
import { type ChangePivotInput, changePivotInput } from "@waltning/core/registry/inputs";
import { eq, isNull, sql } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalCurrencyRow } from "./add-currency.executor.ts";

const { currencies, fxRates, transactions } = schema;

type ReplicaTx = LocalTx<unknown, typeof schema>;
type LocalFxRateRow = typeof fxRates.$inferSelect;

/** See `read-rate.ts`'s own copy — the server's carried-forward marker. */
const CARRIED_FORWARD = "carried_forward";

/** This operation's own stamp for a triangulated figure (§7.6, `FX_SOURCE`). */
const DERIVED = "derived";

/**
 * M1-r5 — the new pivot's own row, plus how many dates the rewrite could
 * not re-derive at all (§7.0's own "dropped rather than left mis-quoted").
 * `LocalCurrencyRow` alone answered "did it work?" and nothing else; a
 * range that drops every date but one still returns the same shape as one
 * that dropped none, and nothing short of counting `fx_rates` rows before
 * and after told the two apart.
 */
export type ChangePivotResult = LocalCurrencyRow & { droppedDates: number };

export const changePivotExecutor = defineLocalExecutor<
  typeof changePivotInput,
  ChangePivotResult,
  ReplicaTx
>({
  operation: "change_pivot",
  opVersion: 1,
  input: changePivotInput,
  mints: () => [],
  apply: (input, tx) => changePivot(input, tx),
});

/**
 * One row this rewrite intends to write, held until the whole date is known
 * good. Column types come from the table itself rather than being restated as
 * `string`, so a `source` outside `FX_SOURCE` is a compile error here rather
 * than a value SQLite would silently accept.
 */
type PendingRow = {
  quote: LocalFxRateRow["quote"];
  date: LocalFxRateRow["date"];
  rate: UnitsPerPivot;
  source: LocalFxRateRow["source"];
  fetchedAt: LocalFxRateRow["fetchedAt"];
};

function changePivot(input: ChangePivotInput, tx: ReplicaTx): ChangePivotResult {
  const [newPivot] = tx.select().from(currencies).where(eq(currencies.code, input.code)).all();
  if (!newPivot) {
    throw new LocalRefusal(`change_pivot: no currency ${input.code}`, { dependency: true });
  }
  if (newPivot.archived) {
    throw new LocalRefusal(`change_pivot: ${input.code} is archived`);
  }
  if (newPivot.isPivot) {
    throw new LocalRefusal(`change_pivot: ${input.code} is already the pivot`);
  }

  const [oldPivot] = tx.select().from(currencies).where(eq(currencies.isPivot, true)).all();
  if (!oldPivot) {
    throw new LocalRefusal("change_pivot: no pivot currency is set", { dependency: true });
  }

  const [{ n: txnCount } = { n: 0 }] = tx
    .select({ n: sql<number>`count(*)` })
    .from(transactions)
    .where(isNull(transactions.deletedAt))
    .all();
  if (txnCount > 0) {
    throw new LocalRefusal(
      "change_pivot: refused — a phone alone cannot re-rate existing transactions; " +
        "change the pivot before the first capture (S29a)",
    );
  }

  const rows = tx.select().from(fxRates).where(eq(fxRates.base, oldPivot.code)).all();
  const byDate = new Map<string, LocalFxRateRow[]>();
  for (const row of rows) {
    const bucket = byDate.get(row.date) ?? [];
    bucket.push(row);
    byDate.set(row.date, bucket);
  }

  tx.delete(fxRates).where(eq(fxRates.base, oldPivot.code)).run();

  // M1-r5 — one date, counted once. Never a per-row tally, which would report
  // the same dropped date once per currency held that day rather than once.
  let droppedDates = 0;
  const written: PendingRow[] = [];

  for (const dateRows of byDate.values()) {
    // Rule 1 — the bridge decides the whole date, and only a real-source
    // bridge decides it in favour of rebasing. `derived` is excluded
    // alongside `carried_forward` because a bridge is by definition a
    // `(oldPivot, newPivot)` row this ledger *held*, and nothing in a
    // pivot-per-pivot series is ever computed: a `derived` bridge would mean
    // an earlier rewrite left one, which is not a rate a second rewrite may
    // divide by.
    const bridge = dateRows.find((row) => row.quote === newPivot.code);
    if (!bridge || bridge.source === CARRIED_FORWARD || bridge.source === DERIVED) {
      droppedDates += 1;
      continue;
    }

    const k = dec(bridge.rate);
    const pending: PendingRow[] = [
      {
        // Rule 3 — the bridge's own source, not `derived`: the reciprocal of
        // an assertion is the same assertion, and of a provider's quote the
        // same provider's quote. Its `fetched_at` carries forward too — the
        // original quote's own freshness, since no new fetch happened.
        quote: oldPivot.code,
        date: bridge.date,
        rate: unitsPerPivot(dec(1).dividedBy(k)),
        source: bridge.source,
        fetchedAt: bridge.fetchedAt,
      },
    ];

    for (const row of dateRows) {
      if (row.quote === newPivot.code) continue; // consumed into the reciprocal above
      // Rule 2 — a carried leg holds no rate of its own. Its origin's date
      // either produced a `derived` row of its own (which carry-forward
      // reaches at read time, with the true age) or was itself dropped; a
      // copy rebased here would claim, in either case, a freshness the
      // figure does not have.
      if (row.source === CARRIED_FORWARD) continue;
      pending.push({
        quote: row.quote,
        date: row.date,
        rate: unitsPerPivot(dec(row.rate).dividedBy(k)),
        source: DERIVED,
        fetchedAt: row.fetchedAt,
      });
    }

    // H2 — the whole date, or none of it. A rebased figure outside the rate
    // bounds is one `numeric(24,12)` cannot hold, or one whose reciprocal
    // truncates to a stored zero the moment `create_transaction` prices a
    // capture off it. Dropping the date keeps the reciprocal and the crosses
    // it prices consistent with each other, which a per-row drop would not.
    if (!pending.every((row) => rateInBounds(row.rate))) {
      droppedDates += 1;
      continue;
    }

    for (const row of pending) {
      tx.insert(fxRates)
        .values({
          base: newPivot.code,
          quote: row.quote,
          date: row.date,
          rate: row.rate,
          source: row.source,
          fetchedAt: row.fetchedAt,
        })
        .run();
      written.push(row);
    }
  }

  assertEveryDerivedRowTraces(newPivot.code, written);

  tx.update(currencies)
    .set({ isPivot: false, version: sql`${currencies.version} + 1`, updatedAt: new Date() })
    .where(eq(currencies.code, oldPivot.code))
    .run();
  tx.update(currencies)
    .set({ isPivot: true, version: sql`${currencies.version} + 1`, updatedAt: new Date() })
    .where(eq(currencies.code, newPivot.code))
    .run();

  const [updated] = tx.select().from(currencies).where(eq(currencies.code, newPivot.code)).all();
  if (!updated) {
    throw new Error("change_pivot: the new pivot's row vanished mid-write");
  }
  return { ...updated, droppedDates };
}

/**
 * Rule 4 — the guarantee, in code rather than in this file's prose.
 *
 * Every `carried_forward` or `derived` row left for the new pivot must have a
 * non-`carried_forward` row for the *same pair* at or before its own date —
 * exactly what `findOrigin` (`read-rate.ts`) walks back to, and exactly the
 * loop `pivot-change.journey.test.ts` runs from the outside. A violation is a
 * bug in the rules above, not in the data, so this throws and rolls the whole
 * rewrite back rather than committing a row `readRate` would refuse to serve
 * and `readCurrencies.capturable` would disagree with.
 *
 * One pass per pair over a sorted list, never a scan per row (L5): the
 * earliest non-carried row for a pair bounds every carried row after it, so
 * the whole check is a comparison against one date per pair.
 */
function assertEveryDerivedRowTraces(base: string, written: readonly PendingRow[]): void {
  const earliestRealByQuote = new Map<string, string>();
  for (const row of written) {
    if (row.source === CARRIED_FORWARD) continue;
    const seen = earliestRealByQuote.get(row.quote);
    if (seen === undefined || row.date < seen) earliestRealByQuote.set(row.quote, row.date);
  }

  for (const row of written) {
    if (row.source !== CARRIED_FORWARD && row.source !== DERIVED) continue;
    const earliest = earliestRealByQuote.get(row.quote);
    if (earliest !== undefined && earliest <= row.date) continue;
    throw new Error(
      `change_pivot: refused — ${base}/${row.quote} on ${row.date} is ${row.source} with no ` +
        "real-source row for the pair at or before its own date, which no reader can age",
    );
  }
}
