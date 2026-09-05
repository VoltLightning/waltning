/**
 * A figure past its own currency's declared scale — the local ledger's own
 * version of the guarantee Postgres states through
 * `0012_transaction_scale_and_category_kind.sql`'s `assert_amount_scale` and
 * its siblings (`SPEC.md` §7.2).
 *
 * **SQLite carries no trigger of its own** (`ddl.ts` states every `CHECK`
 * this schema can enforce alone, and a cross-table lookup against
 * `currencies` is not one of them), so an executor that skips this check is
 * the only thing standing between a mis-typed figure and a row past the
 * precision its own currency claims to hold. The phone's own screens already
 * refuse this (`create-phone-ledger.ts`'s own `H2`/`M` checks), but a screen
 * is not the local write path's only caller —
 * `invariants/scale-after-every-op.test.ts` reaches every executor directly,
 * the way a future `set_transaction_lines`-style bulk import or a bug in a
 * screen's own guard would.
 */

import type { CurrencyCode } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import { eq } from "drizzle-orm";
import { ledgerSchema } from "./schema-map.ts";
import type { LocalTx } from "./write.ts";

const { currencies } = ledgerSchema;

/**
 * Throws when `value` carries more decimal places than `currency` declares.
 *
 * Silent when the currency itself is not in the replica — the `FK` the row
 * is about to violate refuses an unknown code separately, and this function
 * has nothing further to add (the same shape `assert_amount_scale`'s own
 * `SELECT ... INTO allowed` gives that case in Postgres).
 */
export function assertMoneyScale(
  tx: LocalTx<unknown, typeof ledgerSchema>,
  value: string,
  currency: CurrencyCode,
  where: string,
): void {
  const [row] = tx
    .select({ decimals: currencies.decimals })
    .from(currencies)
    .where(eq(currencies.code, currency))
    .limit(1)
    .all();
  if (row === undefined) return;
  if (money.dec(value).decimalPlaces() > row.decimals) {
    throw new Error(
      `${where} ${value} holds more decimal places than ${currency} allows (${row.decimals})`,
    );
  }
}
