/**
 * Currency reads, against the replica.
 *
 * The local mirror of `apps/api/src/modules/currencies/currencies.service.ts`
 * — same columns, same ordering, same exclusion of archived rows — because
 * §14.7's "two engines, one definition" means a figure derived on the phone and
 * the same figure derived on the server must not be able to disagree.
 *
 * **The table, not the seed list.** `@waltning/core/currencies` is what a
 * database holds before anyone touches it; this is what it holds now. A picker
 * built on the list would keep offering a currency after it was archived, and
 * would miss one that was added.
 *
 * **`capturable` is the one field the server's version does not have**, and it
 * is local by nature: it answers *can this replica value a capture in this
 * currency right now*, which is a fact about what this device has synced. The
 * server can always answer yes.
 */

import type { CurrencyCode } from "@waltning/core/money";
import { and, asc, eq, ne } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { currencies, fxRates } = ledgerSchema;

/** See `read-rate.ts`'s own copy — the server's carried-forward marker. */
const CARRIED_FORWARD = "carried_forward";

export type LocalCurrency = {
  code: CurrencyCode;
  name: string;
  symbol: string;
  decimals: number;
  /**
   * Whether `create_transaction` can value a row in this currency without the
   * caller asserting a rate.
   *
   * **The same three cases `provisionalFxRate` decides, asked in advance.**
   * Every transaction carries a pivot valuation, so a capture needs `1` (this
   * *is* the pivot) or a last-known rate for the pair. Without either, the
   * executor refuses — correctly, because `1` for a cross-currency row is a
   * wrong figure that looks right. Asking here is what lets a screen decline the
   * capture with a reason instead of letting the write throw from inside a
   * transaction.
   *
   * A currency being uncapturable does not make it unusable: an account can be
   * opened in it and its balance renders at its own scale. Holding and capturing
   * are separate capabilities (§14.6).
   *
   * **L1/H2 — a row is not enough; it must be a *real* one, and this now
   * agrees with `readNearestRate` exactly.** `change_pivot` and a corrected
   * date (`set_manual_rate`'s H3) can both leave a `carried_forward` row
   * behind with no real quote for the pair to descend from —
   * `readNearestRate` (`read-rate.ts`) compares only real-source candidates,
   * so a pair with any orphaned carried row is never valued off it, and this
   * must agree or a screen would offer a capture the write then throws on.
   * Both ask the same question — *does the pair hold at least one row whose
   * own source is real* — one date-blind, one nearest a date; a pair counts
   * here only when at least one of its rows has a real source (`nbp`,
   * `ecb`, `manual`, …), never on bare existence.
   */
  capturable: boolean;
  /**
   * §7.0 — the one currency `fx_rates` is quoted against. **The display
   * currency, absent the header toggle §7.0 names and no wave has built
   * yet** — S12/S13's `net in {display}` (`SPEC.md` §6.6) resolves against
   * whichever currency this marks, the same fallback `computations.md` §4.6
   * already gives a display figure that equals the pivot: "the join is
   * skipped".
   */
  isPivot: boolean;
};

export function readCurrencies<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): readonly LocalCurrency[] {
  const rows = db
    .select({
      code: currencies.code,
      name: currencies.name,
      symbol: currencies.symbol,
      decimals: currencies.decimals,
      isPivot: currencies.isPivot,
    })
    .from(currencies)
    .where(eq(currencies.archived, false))
    .orderBy(asc(currencies.sort), asc(currencies.code))
    .all();

  const pivot = rows.find((currency) => currency.isPivot);

  // No pivot means no rate can be resolved for anything, including a currency
  // that has a row — `provisionalFxRate` refuses on that branch first.
  //
  // L1/H2 — `source <> carried_forward`: a pair whose only rows are carried
  // copies has no real quote to descend from, so `readNearestRate` refuses
  // it regardless of how many carried rows exist. Excluding it here is what
  // keeps this flag and that refusal in agreement exactly — `readNearestRate`
  // now compares only real-source candidates on both sides of a date, so
  // there is no longer a case where a pair marked `capturable` here can
  // still be refused there over an orphaned carried row landing nearer the
  // capture's own date.
  const quoted = new Set<CurrencyCode>(
    pivot === undefined
      ? []
      : db
          .selectDistinct({ quote: fxRates.quote })
          .from(fxRates)
          .where(and(eq(fxRates.base, pivot.code), ne(fxRates.source, CARRIED_FORWARD)))
          .all()
          .map((row) => row.quote),
  );

  return rows.map(({ isPivot, ...currency }) => ({
    ...currency,
    capturable: pivot !== undefined && (isPivot || quoted.has(currency.code)),
    isPivot,
  }));
}
