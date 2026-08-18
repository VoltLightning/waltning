/**
 * Client hooks — React, and never React Native.
 *
 * This subpath is where the `react` dependency lives, so a consumer that only
 * needs the transport (`tools/e2e`, a script, a test) imports the package root
 * and pulls in no React at all.
 */

export { type Account, useAccounts } from "./use-accounts.ts";
export { type Currency, useCurrencies } from "./use-currencies.ts";
export { describeProbe, type Probe, useProbe } from "./use-probe.ts";
export { type Query, useQuery } from "./use-query.ts";
export {
  type Transaction,
  type TransactionFeed,
  useTransactions,
} from "./use-transactions.ts";
