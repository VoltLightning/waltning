/**
 * `update_counterparty`, on the device — `operations.md` counterparties row.
 *
 * **Compare-and-swap on `version`, then patch** — the same shape as
 * `update_account`. **`archived` lives on this patch, not a separate
 * operation**: `operations.md` lists no `archive_counterparty`, so an
 * archiving write is an ordinary field flip this executor gates rather than
 * a structural op of its own.
 *
 * **Gated (S15 §6): archiving is refused while any §7 balance is open** —
 * *"archiving is for settled relationships."* The check runs on the *merged*
 * row, the same reasoning `update_account`'s shared/business refusal gives:
 * `{ archived: true }` alone must be refused against a counterparty who
 * currently holds a balance, which is state on the row rather than on the
 * patch.
 *
 * **The balance fold comes from `open-balances.ts`, not `readCounterpartyBalances`.**
 * `money.counterpartyBalance` (§7's fold, `packages/core/src/money.ts`)
 * exists on this base, but `readCounterpartyBalances` — the ledger-side
 * reader that queries the replica and calls it — is E1's, a parallel PR not
 * on this base. `open-balances.ts` is the query it will replace, shared with
 * `settle_debt`'s own read rather than a second copy of the same fold.
 */

import * as money from "@waltning/core/money";
import {
  type UpdateCounterpartyInput,
  updateCounterpartyInput,
} from "@waltning/core/registry/inputs";
import { and, eq, sql } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalCounterpartyRow } from "./create-counterparty.executor.ts";
import { openBalances } from "./open-balances.ts";

const { counterparties } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export const updateCounterpartyExecutor = defineLocalExecutor<
  typeof updateCounterpartyInput,
  LocalCounterpartyRow,
  ReplicaTx
>({
  operation: "update_counterparty",
  opVersion: 1,
  input: updateCounterpartyInput,
  mints: () => [],
  apply: (input, tx) => patchCounterparty(input, tx),
});

function patchCounterparty(input: UpdateCounterpartyInput, tx: ReplicaTx): LocalCounterpartyRow {
  const [current] = tx.select().from(counterparties).where(eq(counterparties.id, input.id)).all();
  if (!current) {
    throw new Error(`update_counterparty: no counterparty ${input.id}`);
  }
  if (current.version !== input.version) {
    throw new Error(
      `update_counterparty: stale version — read ${input.version}, row is at ${current.version}`,
    );
  }

  const willArchive = input.patch.archived === true && !current.archived;
  if (willArchive) {
    const balances = openBalances(tx, input.id);
    const open = balances.find((row) => !money.isZero(row.balance));
    if (open) {
      throw new Error(
        `update_counterparty: ${input.id} still holds an open balance of ${open.balance} ` +
          `${open.currency} — archiving is for settled relationships (S15 §6)`,
      );
    }
  }

  const [updated] = tx
    .update(counterparties)
    .set({ ...input.patch, version: sql`${counterparties.version} + 1`, updatedAt: new Date() })
    .where(and(eq(counterparties.id, input.id), eq(counterparties.version, input.version)))
    .returning()
    .all();

  if (!updated) {
    throw new Error("update_counterparty: the row changed between read and write");
  }
  return updated;
}
