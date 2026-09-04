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
import { and, asc, eq } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { currencies, fxRates } = ledgerSchema;

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
  const quoted = new Set<CurrencyCode>(
    pivot === undefined
      ? []
      : db
          .selectDistinct({ quote: fxRates.quote })
          .from(fxRates)
          .where(and(eq(fxRates.base, pivot.code)))
          .all()
          .map((row) => row.quote),
  );

  return rows.map(({ isPivot, ...currency }) => ({
    ...currency,
    capturable: pivot !== undefined && (isPivot || quoted.has(currency.code)),
    isPivot,
  }));
}
