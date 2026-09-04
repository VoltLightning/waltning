/**
 * Counterparties, for a picker and for S12/S13/S15.
 *
 * `#e2` gives the table a write path — `create_counterparty` and the rest —
 * so this reader now needs the fields those screens read: `kind` (S15's
 * segment, and O15's ageing gate), `settlementCurrency` (§6.6, their
 * preference), and `archived` for S16-style toggles that show it anyway.
 *
 * **`contact`, `note` and `version` join the selection at E4** — S15's own
 * editor is the first reader that opens an *existing* row to change it, the
 * same way S16's `AccountEditor` needed `readAccounts` to carry
 * `openingBalance`/`memo`/`version` once it existed. `version` is what
 * `update_counterparty` and `archive`-via-patch both need for the stale-row
 * check (`counterparties.staleVersion`).
 */

import type { Id } from "@waltning/core/id";
import type { CurrencyCode } from "@waltning/core/money";
import type { CounterpartyKind } from "@waltning/core/registry/inputs";
import { asc, eq } from "drizzle-orm";
import type { ReplicaDb } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";

const { counterparties } = ledgerSchema;

export type LocalCounterparty = {
  id: Id<"counterparties">;
  name: string;
  kind: CounterpartyKind;
  settlementCurrency: CurrencyCode | null;
  contact: string | null;
  note: string;
  archived: boolean;
  version: number;
};

export type ReadCounterpartiesOptions = {
  /** Default `false` — matches `readAccounts`'s toggle. */
  includeArchived?: boolean;
};

export function readCounterparties<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
  { includeArchived = false }: ReadCounterpartiesOptions = {},
): readonly LocalCounterparty[] {
  return db
    .select({
      id: counterparties.id,
      name: counterparties.name,
      kind: counterparties.kind,
      settlementCurrency: counterparties.settlementCurrency,
      contact: counterparties.contact,
      note: counterparties.note,
      archived: counterparties.archived,
      version: counterparties.version,
    })
    .from(counterparties)
    .where(includeArchived ? undefined : eq(counterparties.archived, false))
    .orderBy(asc(counterparties.sort), asc(counterparties.name), asc(counterparties.id))
    .all();
}
