/**
 * §8's `find_unsettled`, minus the FIFO half. Class **F** for the balance,
 * class **S** for allocation (`computations.md` §0) — this reuses the
 * per-account balances `readAccountsForNetWorth` already folds for §2/§3,
 * filtered to `kind = 'clearing'`, and asks `money.unsettledClearing` which
 * of them are non-zero. Naming *which* transaction is oldest and unconsumed
 * is largest-remainder territory and stays server-only, arc-full.
 */

import * as money from "@waltning/core/money";
import type { ReplicaDb } from "../open.ts";
import type { ledgerSchema } from "../schema-map.ts";
import { readAccountsForNetWorth } from "./read-accounts.ts";

export function readUnsettledClearing<TRun, TSchema extends typeof ledgerSchema>(
  db: ReplicaDb<TRun, TSchema>,
): readonly money.ClearingAccountRow[] {
  const clearing = readAccountsForNetWorth(db)
    .filter((account) => account.kind === "clearing")
    .map(({ id, name, currency, decimals, balance }) => ({
      accountId: id,
      name,
      currency,
      decimals,
      balance,
    }));
  return money.unsettledClearing(clearing);
}
