/**
 * Counterparties, for a picker and for S12/S13/S15.
 *
 * `#e2` gives the table a write path — `create_counterparty` and the rest —
 * so this reader now needs the fields those screens read: `kind` (S15's
 * segment, and O15's ageing gate), `settlementCurrency` (§6.6, their
 * preference), and `archived` for S16-style toggles that show it anyway.
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
  archived: boolean;
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
      archived: counterparties.archived,
    })
    .from(counterparties)
    .where(includeArchived ? undefined : eq(counterparties.archived, false))
    .orderBy(asc(counterparties.sort), asc(counterparties.name), asc(counterparties.id))
    .all();
}
