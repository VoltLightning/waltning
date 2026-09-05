/**
 * The operation registry — every capability in the system, declared once.
 *
 * §11.0's claim that one declaration feeds both the tRPC router and the
 * agent's tools was proved on two operations first, deliberately — the pair
 * chosen to span the axes that differ: one read a phone may run offline, one
 * write that is gated, audited and must not. The reads card added the rest
 * of the "transactions, balances, taxonomy" group (`operations.md`) in the
 * same shape.
 */

import type { Registry } from "@waltning/core/registry/operation";
import { getAccounts } from "../modules/accounts/get-accounts.operation.ts";
import { getBalances } from "../modules/accounts/get-balances.operation.ts";
import { getAuditLog } from "../modules/audit/get-audit-log.operation.ts";
import { getCategoryTree } from "../modules/categories/get-category-tree.operation.ts";
import { createCounterparty } from "../modules/counterparties/create-counterparty.operation.ts";
import { getCurrencies } from "../modules/currencies/get-currencies.operation.ts";
import { getTransaction } from "../modules/transactions/get-transaction.operation.ts";
import { searchTransactionsOperation } from "../modules/transactions/search-transactions.operation.ts";
import type { OperationContext } from "./context.ts";

/**
 * Keys are written out rather than computed from `op.name`. A computed key is
 * typed `string`, which collapses the whole object into an index signature and
 * loses every operation's input type at the call site — the exact type safety
 * §11.0 promises reaches the client. A test asserts each key equals its
 * operation's `name`, so the duplication cannot drift.
 */
export const registry = {
  get_currencies: getCurrencies,
  get_accounts: getAccounts,
  get_balances: getBalances,
  get_category_tree: getCategoryTree,
  get_transaction: getTransaction,
  get_audit_log: getAuditLog,
  search_transactions: searchTransactionsOperation,
  create_counterparty: createCounterparty,
} as const satisfies Registry<OperationContext>;

export type AppRegistry = typeof registry;
