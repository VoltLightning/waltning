/**
 * Transactions — the module's public API.
 *
 * Mirrors `apps/api/src/modules/transactions/index.ts`. Nothing here imports
 * `accounts/`: a transaction names an account id, which is a value, not a
 * module dependency.
 */

export {
  createTransactionExecutor,
  type LocalTransactionRow,
} from "./create-transaction.executor.ts";
export { type LocalRecentTransaction, readRecent } from "./read-recent.ts";
