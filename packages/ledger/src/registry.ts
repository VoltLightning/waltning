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
import { localRegistry } from "./executor.ts";
import { createTransactionExecutor } from "./transactions/create-transaction.executor.ts";

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
]);
