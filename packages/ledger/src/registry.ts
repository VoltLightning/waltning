import { createAccountExecutor } from "./accounts/create-account.executor.ts";
import { localRegistry } from "./executor.ts";
import { createTransactionExecutor } from "./transactions/create-transaction.executor.ts";

/** Every operation the phone can apply locally, keyed by its registry name. */
export const ledgerRegistry = localRegistry([createAccountExecutor, createTransactionExecutor]);
