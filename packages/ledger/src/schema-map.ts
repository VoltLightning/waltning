import { accountGroups } from "@waltning/schema/sqlite/account-groups";
import { accounts } from "@waltning/schema/sqlite/accounts";
import { brandAliases } from "@waltning/schema/sqlite/brand-aliases";
import { categories } from "@waltning/schema/sqlite/categories";
import { counterparties } from "@waltning/schema/sqlite/counterparties";
import { counterpartyDistinctPairs } from "@waltning/schema/sqlite/counterparty-distinct-pairs";
import { counterpartyMerges } from "@waltning/schema/sqlite/counterparty-merges";
import { currencies } from "@waltning/schema/sqlite/currencies";
import { dashboardLayouts } from "@waltning/schema/sqlite/dashboard-layouts";
import { dashboardWidgets } from "@waltning/schema/sqlite/dashboard-widgets";
import { fxRates } from "@waltning/schema/sqlite/fx-rates";
import { recurringTransactions } from "@waltning/schema/sqlite/recurring-transactions";
import { tags } from "@waltning/schema/sqlite/tags";
import { transactionLines } from "@waltning/schema/sqlite/transaction-lines";
import { transactionTags } from "@waltning/schema/sqlite/transaction-tags";
import { transactions } from "@waltning/schema/sqlite/transactions";
import { localMeta } from "./local-meta.ts";
import { outbox, outboxSeq } from "./outbox.ts";
import type { LocalTx } from "./write.ts";

/** The exact schema map both injected SQLite drivers receive. */
export const ledgerSchema = {
  accountGroups,
  accounts,
  brandAliases,
  categories,
  counterparties,
  counterpartyDistinctPairs,
  counterpartyMerges,
  currencies,
  dashboardLayouts,
  dashboardWidgets,
  fxRates,
  localMeta,
  outbox,
  outboxSeq,
  recurringTransactions,
  tags,
  transactionLines,
  transactions,
  transactionTags,
};

/**
 * A transaction against the replica, in the one place that says so.
 *
 * **This was `type ReplicaTx = LocalTx<unknown, typeof schema>` in
 * thirty-seven files.** One decision typed out thirty-seven times, each copy
 * spending an `unknown` on the driver's run-result — a type parameter none of
 * those modules touches and every one of them had to name. `write.ts`'s own
 * budget entry already records this shape as the mistake ("one decision typed
 * out three times"); this is the same mistake at ten times the scale.
 *
 * The `unknown` survives here, once, and it is the honest kind: `SQLiteTransaction`
 * is generic in what its driver's `run` returns, the two injected drivers
 * disagree about it, and nothing in this package reads the value.
 */
export type ReplicaTx = LocalTx<unknown, typeof ledgerSchema>;
