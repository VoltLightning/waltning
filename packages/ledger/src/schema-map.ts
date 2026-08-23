import { accountGroups } from "@waltning/schema/sqlite/account-groups";
import { accounts } from "@waltning/schema/sqlite/accounts";
import { categories } from "@waltning/schema/sqlite/categories";
import { counterparties } from "@waltning/schema/sqlite/counterparties";
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

/** The exact schema map both injected SQLite drivers receive. */
export const ledgerSchema = {
  accountGroups,
  accounts,
  categories,
  counterparties,
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
