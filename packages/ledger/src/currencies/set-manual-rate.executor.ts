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
 * **M1 — `today` comes from the input when given, and from the `Capture`
 * otherwise.** §7.6 refuses a rate set for a date that has not happened yet,
 * and this file is where that refusal lives whenever the day was not supplied
 * — the schema can only check a value it was handed. Deriving it from the
 * capture rather than demanding it is what lets an entry queued by an older
 * build replay at all: a required field would fail `parse` forever, and
 * `recover.ts` halts at the first entry it cannot apply.
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
 *
 * **H1 — the orphan scan runs against the state this write leaves behind,
 * not the one it found.** A date that was itself `carried_forward` before
 * this write can become a real origin *as a result of it* — every downstream
 * carried row whose nearest real predecessor is now one of the dates just
 * written must be deleted too, even when its *pre-write* origin sat outside
 * the corrected range entirely. Scanning before the write misses exactly
 * that row: its old origin looks untouched, so nothing marks it stale, and
 * it goes on answering reads with a rate this write just superseded. So the
 * write happens first, then one bounded scan (candidates dated `>= from` —
 * an origin is never later than its own row, so nothing earlier can be
 * affected) walks every real row for the pair once and every candidate once,
 * rather than one `findOrigin` query per candidate (Pi-scale L).
 */

import { type AccountingDate, addDays } from "@waltning/core/date";
import { type SetManualRateInput, setManualRateInput } from "@waltning/core/registry/inputs";
import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import { type Capture, captureDate, type LocalTx } from "../write.ts";

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
  apply: (input, tx, capture) => setManualRate(input, tx, capture),
});

/** Every date from `from` to `to`, inclusive. */
function dateRange(from: AccountingDate, to: AccountingDate): AccountingDate[] {
  const dates: AccountingDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  return dates;
}

function setManualRate(
  input: SetManualRateInput,
  tx: ReplicaTx,
  capture: Capture,
): SetManualRateResult {
  // M1 — `today` is optional on the input so a payload queued before the
  // field existed still parses and still replays. Absent, it is the day the
  // capture itself happened, read in the capture's own zone — the same value
  // the screen would have passed, derived from the two fields the outbox
  // records beside every entry. The refusal is *here* rather than only in the
  // schema for exactly that reason: an operation whose rule mentions today
  // must still enforce it when today came from the capture.
  const today = input.today ?? captureDate(capture);
  if (input.to > today) {
    throw new Error(
      `set_manual_rate: ${input.to} has not happened yet (today is ${today}) — ` +
        "a rate cannot be set for a future date",
    );
  }

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

  // H1 — the orphan scan runs *after* the write above, against the origins
  // it leaves behind. Bounded to candidates dated `>= from`: an origin is
  // never later than its own row, so a carried row dated before this write's
  // range can never gain an origin inside it. One query for every such
  // candidate, one query for every real (non-`carried_forward`) row this
  // pair holds, then a single ascending merge in memory — never one
  // `findOrigin` per candidate (Pi-scale L).
  const candidates = tx
    .select()
    .from(fxRates)
    .where(
      and(
        eq(fxRates.base, input.base),
        eq(fxRates.quote, input.quote),
        eq(fxRates.source, CARRIED_FORWARD),
        gte(fxRates.date, input.from),
      ),
    )
    .orderBy(asc(fxRates.date))
    .all();

  if (candidates.length > 0) {
    const realRows = tx
      .select({ date: fxRates.date })
      .from(fxRates)
      .where(
        and(
          eq(fxRates.base, input.base),
          eq(fxRates.quote, input.quote),
          ne(fxRates.source, CARRIED_FORWARD),
        ),
      )
      .orderBy(asc(fxRates.date))
      .all();

    let realIdx = 0;
    let originDate: AccountingDate | undefined;
    const orphaned: LocalFxRateRow[] = [];
    for (const row of candidates) {
      // Both lists are sorted ascending, so this pointer only ever advances —
      // the nearest real row `<= row.date` is whichever real row was last
      // consumed before crossing it.
      while (realIdx < realRows.length) {
        const real = realRows[realIdx];
        if (real === undefined || real.date > row.date) break;
        originDate = real.date;
        realIdx += 1;
      }
      if (originDate !== undefined && originDate >= input.from && originDate <= input.to) {
        orphaned.push(row);
      }
    }
    for (const row of orphaned) {
      tx.delete(fxRates)
        .where(
          and(eq(fxRates.base, row.base), eq(fxRates.quote, row.quote), eq(fxRates.date, row.date)),
        )
        .run();
    }
  }

  return { written: dates.length, replacedManual };
}
