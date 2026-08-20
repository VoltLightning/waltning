/**
 * **No dialect barrel, on purpose.**
 *
 * Re-exporting both `./pg.ts` and `./sqlite.ts` from here would put
 * `drizzle-orm/pg-core` on the phone's import graph — Metro does not
 * tree-shake reliably enough to bet a bundle on, and the failure is silent:
 * the app works, it is just carrying a Postgres dialect it can never use.
 *
 * Consumers import their own dialect and nothing else:
 *
 * ```ts
 * import { transactions } from "@waltning/schema/sqlite";  // packages/ledger
 * import { transactions } from "@waltning/schema/pg";      // packages/db
 * ```
 *
 * This module holds only what names no dialect.
 */
export type { SharedTable } from "./shared.ts";
