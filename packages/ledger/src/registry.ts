import { archiveAccountExecutor } from "./accounts/archive-account.executor.ts";
import { archiveGroupExecutor } from "./accounts/archive-group.executor.ts";
import { createAccountExecutor } from "./accounts/create-account.executor.ts";
import { createGroupExecutor } from "./accounts/create-group.executor.ts";
import { reconcileAccountExecutor } from "./accounts/reconcile-account.executor.ts";
import { reorderAccountsExecutor } from "./accounts/reorder-accounts.executor.ts";
import { reorderGroupsExecutor } from "./accounts/reorder-groups.executor.ts";
import { updateAccountExecutor } from "./accounts/update-account.executor.ts";
import { updateGroupExecutor } from "./accounts/update-group.executor.ts";
import { archiveCategoryExecutor } from "./categories/archive-category.executor.ts";
import { convertLeafGroupExecutor } from "./categories/convert-leaf-group.executor.ts";
import { createCategoryExecutor } from "./categories/create-category.executor.ts";
import { mergeCategoriesExecutor } from "./categories/merge-categories.executor.ts";
import { renameCategoryExecutor } from "./categories/rename-category.executor.ts";
import { reparentCategoryExecutor } from "./categories/reparent-category.executor.ts";
// ── E3 · FX operations — the phone half ────────────────────────────────────
import { addCurrencyExecutor } from "./currencies/add-currency.executor.ts";
import { archiveCurrencyExecutor } from "./currencies/archive-currency.executor.ts";
import { changePivotExecutor } from "./currencies/change-pivot.executor.ts";
import { clearManualRateExecutor } from "./currencies/clear-manual-rate.executor.ts";
import { setManualRateExecutor } from "./currencies/set-manual-rate.executor.ts";
import { setPinnedExecutor } from "./currencies/set-pinned.executor.ts";
import { setRateSourceExecutor } from "./currencies/set-rate-source.executor.ts";
// ── end E3 block ─────────────────────────────────────────────────────────
// ── E2 · counterparties and settlement — its own block, same reason ────────
import { createCounterpartyExecutor } from "./counterparties/create-counterparty.executor.ts";
import { mergeCounterpartiesExecutor } from "./counterparties/merge-counterparties.executor.ts";
import { recordDistinctCounterpartiesExecutor } from "./counterparties/record-distinct-counterparties.executor.ts";
import { settleDebtExecutor } from "./counterparties/settle-debt.executor.ts";
import { unmergeCounterpartiesExecutor } from "./counterparties/unmerge-counterparties.executor.ts";
import { updateCounterpartyExecutor } from "./counterparties/update-counterparty.executor.ts";
// ── end E2 block ─────────────────────────────────────────────────────────
import { localRegistry } from "./executor.ts";
// ── A2 · transaction operations — the phone half ──────────────────────────
import { categorizeBatchExecutor } from "./transactions/categorize-batch.executor.ts";
import { createTransactionExecutor } from "./transactions/create-transaction.executor.ts";
import { deleteTransactionExecutor } from "./transactions/delete-transaction.executor.ts";
import { setTransactionLinesExecutor } from "./transactions/set-transaction-lines.executor.ts";
import { supersedeTransactionExecutor } from "./transactions/supersede-transaction.executor.ts";
import { updateTransactionExecutor } from "./transactions/update-transaction.executor.ts";
// ── end A2 block ───────────────────────────────────────────────────────────

/** Every operation the phone can apply locally, keyed by its registry name. */
export const ledgerRegistry = localRegistry([
  createAccountExecutor,
  createTransactionExecutor,
  // ══ A3 · accounts, groups and categories — its own block for a trivial
  // rebase against A2's own append (update/delete transaction, etc). ══
  updateAccountExecutor,
  archiveAccountExecutor,
  reorderAccountsExecutor,
  createGroupExecutor,
  updateGroupExecutor,
  reorderGroupsExecutor,
  archiveGroupExecutor,
  reconcileAccountExecutor,
  createCategoryExecutor,
  renameCategoryExecutor,
  reparentCategoryExecutor,
  convertLeafGroupExecutor,
  mergeCategoriesExecutor,
  archiveCategoryExecutor,
  // ── E2 · counterparties and settlement ────────────────────────────────────
  createCounterpartyExecutor,
  updateCounterpartyExecutor,
  mergeCounterpartiesExecutor,
  unmergeCounterpartiesExecutor,
  recordDistinctCounterpartiesExecutor,
  settleDebtExecutor,
  // ── end E2 block ───────────────────────────────────────────────────────────
  // ── A2 · transaction operations — the phone half ─────────────────────────
  updateTransactionExecutor,
  deleteTransactionExecutor,
  setTransactionLinesExecutor,
  supersedeTransactionExecutor,
  categorizeBatchExecutor,
  // ── end A2 block ─────────────────────────────────────────────────────────
  // ── E3 · FX operations — the phone half ───────────────────────────────────
  addCurrencyExecutor,
  archiveCurrencyExecutor,
  setRateSourceExecutor,
  setPinnedExecutor,
  changePivotExecutor,
  setManualRateExecutor,
  clearManualRateExecutor,
  // ── end E3 block ─────────────────────────────────────────────────────────
]);
