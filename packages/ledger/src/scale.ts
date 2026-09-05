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
import { LocalRefusal } from "./executor.ts";
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
 *
 * **Generic over `TRun`, like every executor's own `ReplicaTx`** — this file
 * has no more an opinion about the driver's run-result than they do, and
 * writing `unknown` here directly (rather than leaving it to be inferred at
 * each call site) would be a second, unbudgeted place naming the same fact
 * `create-account.executor.ts`'s own budget entry already covers once per
 * executor (`tests/unknown-budget.test.ts`).
 */
export function assertMoneyScale<TRun>(
  tx: LocalTx<TRun, typeof ledgerSchema>,
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
    const column = columnOf(where);
    throw new LocalRefusal(
      `${where} ${value} holds more decimal places than ${currency} allows (${row.decimals})`,
      {
        ...(column !== undefined ? { column } : {}),
        params: { currency, decimals: String(row.decimals) },
      },
    );
  }
}

/**
 * The db column a `where` label names, for `LocalRefusal.column` (L4).
 *
 * `where` is always `"<op>: <column-ish path>"` — every call site here
 * follows that shape (`"create_transaction: amount_original"`,
 * `"set_transaction_lines: transaction_lines[id].amount"`). The column is
 * the last dotted segment after the operation's own name, which is also
 * exactly the part a caller like `create-phone-ledger.ts` needs to route a
 * refusal onto the right form field — it was never the part a message-text
 * regex could find, because that part comes *after* the op-name prefix a
 * `^`-anchored pattern already failed to skip.
 */
function columnOf(where: string): string | undefined {
  const afterOp = where.includes(": ") ? where.split(": ").slice(1).join(": ") : where;
  const segments = afterOp.split(".");
  const last = segments[segments.length - 1];
  return last && last.length > 0 ? last : undefined;
}
