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
 * **The balance fold comes from `read-counterparty-balances.ts`'s
 * `balancesForCounterparty`, shared with `settle_debt`'s own read** rather
 * than a second copy of the same fold — both need `{ currency, balance }[]`
 * for one counterparty, never the full multi-counterparty, ageing-inclusive
 * shape `readCounterpartyBalances` builds for the phone's own screen.
 *
 * **A renamed `patch.name` gets the same folded-name pre-check
 * `create_counterparty` runs**, for the same reason: without it, the raw
 * SQLite `UNIQUE constraint failed: index 'counterparties_name_uq'` would
 * reach the caller instead of a refusal naming the collision. Compares
 * `name_folded` (R2 C1) and excludes archived rows (R2 M3) — see
 * `create-counterparty.executor.ts` for both.
 */

import { fold } from "@waltning/core/capture/names";
import * as money from "@waltning/core/money";
import {
  type UpdateCounterpartyInput,
  updateCounterpartyInput,
} from "@waltning/core/registry/inputs";
import { and, eq, ne, sql } from "drizzle-orm";
import { defineLocalExecutor, LocalRefusal } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalCounterpartyRow } from "./create-counterparty.executor.ts";
import { balancesForCounterparty } from "./read-counterparty-balances.ts";

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
    throw new LocalRefusal(`update_counterparty: no counterparty ${input.id}`);
  }
  if (current.version !== input.version) {
    throw new LocalRefusal(
      `update_counterparty: stale version — read ${input.version}, row is at ${current.version}`,
    );
  }

  let nameFolded: string | undefined;
  if (input.patch.name !== undefined) {
    // `fold()` never trims by itself — see `create-counterparty.executor.ts`.
    nameFolded = fold(input.patch.name.trim());
    const [collision] = tx
      .select({ id: counterparties.id, name: counterparties.name })
      .from(counterparties)
      .where(
        and(
          eq(counterparties.nameFolded, nameFolded),
          eq(counterparties.archived, false),
          ne(counterparties.id, input.id),
        ),
      )
      .all();
    if (collision) {
      throw new LocalRefusal(
        `update_counterparty: "${input.patch.name}" collides with existing counterparty ` +
          `"${collision.name}" (${collision.id}) — counterparties_name_uq`,
      );
    }
  }

  // R2 H1 — `counterparties_name_uq` only covers unarchived rows, so a fresh
  // counterparty may legally have taken this row's name while it sat
  // archived. Un-archiving it (`patch.archived === false`) would then hit the
  // raw SQLite collision instead of a refusal naming the row it collides
  // with — checked here, the same as `unmerge_counterparties`'s own
  // pre-check. Skipped when `nameFolded` is already set above: that check
  // just ran against the same target value a renamed patch would un-archive
  // into, so running it twice would only repeat the same query.
  if (input.patch.archived === false && nameFolded === undefined) {
    const [archiveCollision] = tx
      .select({ id: counterparties.id, name: counterparties.name })
      .from(counterparties)
      .where(
        and(
          eq(counterparties.nameFolded, current.nameFolded),
          eq(counterparties.archived, false),
          ne(counterparties.id, input.id),
        ),
      )
      .all();
    if (archiveCollision) {
      throw new LocalRefusal(
        `update_counterparty: un-archiving "${current.name}" collides with existing ` +
          `counterparty "${archiveCollision.name}" (${archiveCollision.id}) — counterparties_name_uq`,
      );
    }
  }

  const willArchive = input.patch.archived === true && !current.archived;
  if (willArchive) {
    const balances = balancesForCounterparty(tx, input.id);
    const open = balances.find((row) => !money.isZero(row.balance));
    if (open) {
      throw new LocalRefusal(
        `update_counterparty: ${input.id} still holds an open balance of ${open.balance} ` +
          `${open.currency} — archiving is for settled relationships (S15 §6)`,
      );
    }
  }

  const [updated] = tx
    .update(counterparties)
    .set({
      ...input.patch,
      ...(nameFolded !== undefined ? { nameFolded } : {}),
      version: sql`${counterparties.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(counterparties.id, input.id), eq(counterparties.version, input.version)))
    .returning()
    .all();

  if (!updated) {
    throw new LocalRefusal("update_counterparty: the row changed between read and write");
  }
  return updated;
}
