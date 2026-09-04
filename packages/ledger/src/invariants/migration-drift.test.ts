/**
 * Proves: `packages/db/drizzle` is the schema — and so is the phone's own
 * pair of `drizzle/replica` and `drizzle/outbox` directories.
 * `drizzle.replica.config.ts` and `drizzle.outbox.config.ts` each diff a
 * schema against a snapshot the same way `packages/db/drizzle.config.ts`
 * does; this file makes that diff a test for both, the way
 * `packages/db/src/invariants/migration-drift.test.ts` does for Postgres's
 * half.
 *
 * The replica config's `schema` is a glob
 * (`../schema/src/*.sqlite.ts` plus `./src/local-meta.ts`) — every table
 * `schema-map.ts` maps except `outbox` and `outboxSeq`, which belong to the
 * outbox config's own single-file schema (`./src/outbox.ts`) instead. Each
 * half is checked against its own `meta/*_snapshot.json`.
 *
 * Findings: R2 M1-r4 names this as an open risk rather than a measured one —
 * this file (with `packages/db/src/invariants/migration-drift.test.ts`)
 * measures it.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { accountGroups } from "@waltning/schema/sqlite/account-groups";
import { accounts } from "@waltning/schema/sqlite/accounts";
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
import {
  type DrizzleSQLiteSnapshotJSON,
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from "drizzle-kit/api";
import { describe, expect, it } from "vitest";
import { localMeta } from "../local-meta.ts";
import { outbox, outboxSeq } from "../outbox.ts";

/** The most recently generated snapshot in `dir` — the one `imports` should still produce. */
function highestSnapshot(dir: string): DrizzleSQLiteSnapshotJSON {
  const files = readdirSync(dir)
    .filter((f) => /^\d+_snapshot\.json$/.test(f))
    .sort();
  const name = files[files.length - 1];
  if (!name) throw new Error(`no snapshot found in ${dir}`);
  return JSON.parse(readFileSync(`${dir}/${name}`, "utf8")) as DrizzleSQLiteSnapshotJSON;
}

/** Every table `drizzle.replica.config.ts`'s glob resolves to, plus `local_meta`. */
const REPLICA_IMPORTS = {
  accountGroups,
  accounts,
  categories,
  counterparties,
  counterpartyDistinctPairs,
  counterpartyMerges,
  currencies,
  dashboardLayouts,
  dashboardWidgets,
  fxRates,
  recurringTransactions,
  tags,
  transactionLines,
  transactionTags,
  transactions,
  localMeta,
};

/** `drizzle.outbox.config.ts`'s whole schema — one file, two tables. */
const OUTBOX_IMPORTS = { outbox, outboxSeq };

describe("the phone's two SQLite schemas do not drift", () => {
  it("drizzle/replica generates no statements against the highest snapshot", async () => {
    const dir = fileURLToPath(new URL("../../drizzle/replica/meta", import.meta.url));
    const prev = highestSnapshot(dir);
    const current = await generateSQLiteDrizzleJson(REPLICA_IMPORTS, prev.id);
    const statements = await generateSQLiteMigration(prev, current);
    expect(statements).toEqual([]);
  });

  it("drizzle/outbox generates no statements against the highest snapshot", async () => {
    const dir = fileURLToPath(new URL("../../drizzle/outbox/meta", import.meta.url));
    const prev = highestSnapshot(dir);
    const current = await generateSQLiteDrizzleJson(OUTBOX_IMPORTS, prev.id);
    const statements = await generateSQLiteMigration(prev, current);
    expect(statements).toEqual([]);
  });
});
