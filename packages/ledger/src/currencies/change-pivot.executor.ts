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
 * **A real quote with no bridge on its own date cannot be re-derived at all**
 * and is dropped rather than left mis-quoted against a pivot that no longer
 * holds — arc 2's sync repopulates it against the new pivot once it exists.
 * A **carried-forward** row is the exception (L3): it holds no rate of its
 * own, only a copy of the nearest earlier real quote, so it rebases by *that
 * quote's own date's* bridge even when its own date has none — dropped only
 * when the origin itself has no bridge to trace to (C2).
 *
 * **M1/M2 — the bridge row itself is not exempt from that guard, and the
 * guard is one rule for the whole date, not the reciprocal alone.** The
 * reciprocal `(newPivot, oldPivot)` row this writes once per date descends
 * from the *bridge* row (`base = P, quote = Q`) the same way every other
 * rebased row descends from its own — so when the bridge is itself
 * `carried_forward` with no traceable real origin, **the whole date is
 * skipped**: no reciprocal, and no rebased row for any other quote on that
 * date either, since every one of them divides by the same untraceable
 * bridge rate. An orphaned bridge used to gate only the reciprocal, so a
 * real quote sharing its date still rebased and landed stamped `derived` —
 * a source every reader (`capturable`, `readRate`'s `carriedDays: 0`) counts
 * as real, off a bridge that traces to nothing. A bridge that *is*
 * `carried_forward` but traces to a real origin is not an orphan: it prices
 * both the reciprocal and every other row on its date, exactly like a real
 * bridge would, and the reciprocal it produces is itself a traceable
 * `carried_forward` row, never the one `readNearestRate` (H2) and
 * `readCurrencies.capturable` refuse to serve.
 */

import { dec, type UnitsPerPivot, unitsPerPivot } from "@waltning/core/money";
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

export const changePivotExecutor = defineLocalExecutor<
  typeof changePivotInput,
  LocalCurrencyRow,
  ReplicaTx
>({
  operation: "change_pivot",
  opVersion: 1,
  input: changePivotInput,
  mints: () => [],
  apply: (input, tx) => changePivot(input, tx),
});

function changePivot(input: ChangePivotInput, tx: ReplicaTx): LocalCurrencyRow {
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

  // A carried-forward row's own date rarely matches its origin's — it holds
  // a copy of the nearest earlier real quote. Traced here, per quote, oldest
  // first, the same walk-back `findOrigin` (`read-rate.ts`) does at read
  // time — needed below to tell an orphaned carried row from one whose
  // origin survives the rewrite (C2).
  const realByQuote = new Map<string, LocalFxRateRow[]>();
  for (const row of rows) {
    if (row.source === CARRIED_FORWARD) continue;
    const bucket = realByQuote.get(row.quote) ?? [];
    bucket.push(row);
    realByQuote.set(row.quote, bucket);
  }
  for (const bucket of realByQuote.values()) bucket.sort((a, b) => (a.date < b.date ? -1 : 1));

  function originDateOf(quote: string, date: string): string | undefined {
    let found: string | undefined;
    for (const row of realByQuote.get(quote) ?? []) {
      if (row.date > date) break;
      found = row.date;
    }
    return found;
  }

  // Dates a bridge rate to the new pivot survives on — computed before the
  // delete below so a carried row's origin can be checked against it.
  const bridgeDates = new Set<string>();
  for (const [date, dateRows] of byDate) {
    if (dateRows.some((row) => row.quote === newPivot.code)) bridgeDates.add(date);
  }

  // M1/M2 — a date's own bridge is usable only when it prices something:
  // absent (handled by the caller as "no bridge"), real, or `carried_forward`
  // with a traceable real origin. An orphaned carried bridge (no real origin
  // anywhere before it) is not a rate (§7.6) and must not be divided into —
  // not for the reciprocal, and not for any other real row sharing its date,
  // which used to trust the raw carried snapshot as if it were real.
  const newPivotCode = newPivot.code;
  function usableBridgeRate(bridge: LocalFxRateRow | undefined) {
    if (!bridge) return undefined;
    if (bridge.source !== CARRIED_FORWARD) return dec(bridge.rate);
    const origin = originDateOf(newPivotCode, bridge.date);
    return origin !== undefined && bridgeDates.has(origin) ? dec(bridge.rate) : undefined;
  }

  tx.delete(fxRates).where(eq(fxRates.base, oldPivot.code)).run();

  for (const dateRows of byDate.values()) {
    // L3 — this date's *own* bridge, when it has one. Never the reason to
    // skip the whole bucket: a carried row here can still trace to an
    // *origin's* bridge on an earlier date (M8, below), and `continue`ing
    // the date wholesale dropped that row along with every real, unbridged
    // one — even though M8's own per-row rebase would have kept it.
    const bridge = dateRows.find((row) => row.quote === newPivot.code);
    // M1/M2 — `undefined` here means "nothing to rebase real rows against on
    // this date", whether that is because there is no bridge at all or
    // because the one present is an orphaned carried copy; either way a real
    // row sharing this date falls through to the same "no usable bridge"
    // branch below, and the reciprocal (past the per-row loop) is skipped
    // the same way.
    const k = usableBridgeRate(bridge);

    for (const row of dateRows) {
      if (row.quote === newPivot.code) continue; // consumed into the reciprocal row below
      // M8 — a carried-forward row rebases by its *origin's* own bridge, not
      // the bridge on the date it happens to be carried onto (if any). §7.6:
      // a carried row is a copy of the nearest earlier real quote, and two
      // different bridge rates on two different dates would rebase the same
      // stored rate into two different answers — the copy stops being one.
      let bridgeRate = k;
      if (row.source === CARRIED_FORWARD) {
        const origin = originDateOf(row.quote, row.date);
        // An orphaned carried-forward child (C2) — its origin's own date had
        // no bridge and was dropped above, so this row's rate would now
        // trace to nothing. §7.6: the table never holds an invented figure.
        if (origin === undefined || !bridgeDates.has(origin)) continue;
        const originBridge = byDate.get(origin)?.find((r) => r.quote === newPivot.code);
        // `bridgeDates.has(origin)` already guarantees this row exists —
        // never trust the same lookup twice without a fallback.
        if (!originBridge) continue;
        bridgeRate = dec(originBridge.rate);
      }
      // A real (non-carried) row with no bridge on its own date, and no
      // origin to trace to, cannot be re-derived at all — dropped rather
      // than left mis-quoted against a pivot that no longer holds (§4).
      if (bridgeRate === undefined) continue;
      const rebased: UnitsPerPivot = unitsPerPivot(dec(row.rate).dividedBy(bridgeRate));
      // M4 — a real row (`nbp`, `manual`, …) is stamped `derived`, never its
      // own source: claiming `nbp` published this exact new-pivot-relative
      // figure would be false, and `derived` names what actually produced
      // it, the triangulation above. A `carried_forward` row keeps that
      // source — it is still a copy standing in for a missing real quote,
      // not a fresh figure, and `findOrigin`'s own walk-back (`read-rate.ts`)
      // relies on that source to know this row is not an origin. Either way
      // `fetchedAt` carries forward — the original quote's own freshness,
      // not "now", since no new fetch happened.
      tx.insert(fxRates)
        .values({
          base: newPivot.code,
          quote: row.quote,
          date: row.date,
          rate: rebased,
          source: row.source === CARRIED_FORWARD ? CARRIED_FORWARD : "derived",
          fetchedAt: row.fetchedAt,
        })
        .run();
    }

    // M1/M2 — `k` is already the one gate: `undefined` for no bridge at all
    // *and* for an orphaned carried bridge, so this is the same "no usable
    // bridge on this date" refusal the per-row loop just applied above, not
    // a second, narrower check applied to the reciprocal alone.
    if (!bridge || k === undefined) continue;
    const reciprocal: UnitsPerPivot = unitsPerPivot(dec(1).dividedBy(k));
    // M4 — same reasoning as the per-row rebase above, and the bridge
    // quote's own `fetchedAt` carried forward rather than dropped.
    tx.insert(fxRates)
      .values({
        base: newPivot.code,
        quote: oldPivot.code,
        date: bridge.date,
        rate: reciprocal,
        source: bridge.source === CARRIED_FORWARD ? CARRIED_FORWARD : "derived",
        fetchedAt: bridge.fetchedAt,
      })
      .run();
  }

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
  return updated;
}
