/**
 * Accounts — the module's public API.
 *
 * Mirrors `apps/api/src/modules/accounts/index.ts`, and the mirroring is the
 * point: §14.7's two engines are checkable against each other only while the
 * two trees have the same shape. Nothing here imports `transactions/`.
 */

export { createAccountExecutor, type LocalAccountRow } from "./create-account.executor.ts";
export { type LocalAccountSummary, readAccounts } from "./read-accounts.ts";
