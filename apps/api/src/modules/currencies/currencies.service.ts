/**
 * Currency reads.
 *
 * A service takes plain arguments and a database handle. It never sees a
 * request, a header, or a tRPC context — that is what lets the agent and the
 * UI reach identical behaviour through the registry.
 */

import { currencies, type Database } from "@waltning/db";
import { asc, eq } from "drizzle-orm";

export type CurrencySummary = {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  isPivot: boolean;
  pinned: boolean;
  archived: boolean;
};

export async function listCurrencies(
  db: Database,
  includeArchived: boolean,
): Promise<CurrencySummary[]> {
  const columns = {
    code: currencies.code,
    name: currencies.name,
    symbol: currencies.symbol,
    decimals: currencies.decimals,
    isPivot: currencies.isPivot,
    pinned: currencies.pinned,
    archived: currencies.archived,
  };

  const query = db.select(columns).from(currencies);
  const rows = includeArchived
    ? await query.orderBy(asc(currencies.sort), asc(currencies.code))
    : await query
        .where(eq(currencies.archived, false))
        .orderBy(asc(currencies.sort), asc(currencies.code));

  return rows;
}
