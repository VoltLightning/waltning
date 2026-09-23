/**
 * The taxonomy the app ships with — J01 §2's *"currencies and taxonomy
 * seeded"*, which was half true until this: currencies bootstrapped,
 * categories did not, and a fresh install opened its picker on nothing.
 *
 * **Through a real session, because that is where it happens.**
 * `scratchStores()` runs the migrators alone, and the tree is deliberately
 * not a migration (`bootstrap-taxonomy.ts` on why) — so a test over bare
 * stores would assert against an empty table and pass the day the bootstrap
 * was deleted.
 *
 * **Nothing here is written down twice.** The tree is data in
 * `@waltning/core/taxonomy`, the ids are minted at runtime, and the
 * bootstrap is the loop between them — so this asserts against that same
 * list rather than a copy. What it catches is the loop losing a row,
 * mis-parenting a leaf, or writing the tree a second time.
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { currencies as referenceCurrencies } from "@waltning/core/currencies";
import { expenseTree, incomeTree, topLevelLeaves } from "@waltning/core/taxonomy";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LedgerFs } from "../migrate.ts";
import type { LedgerPaths, SqliteOpener } from "../open.ts";
import { ledgerSchema } from "../schema-map.ts";
import { type BootstrapCurrency, createLocalLedgerSession } from "../session.ts";

const { categories } = ledgerSchema;

type Run = Database.RunResult;

const open: SqliteOpener<Run, typeof ledgerSchema> = (filename) => {
  const sqlite = new Database(filename);
  return { db: drizzle(sqlite, { schema: ledgerSchema }), close: () => sqlite.close() };
};

const fs: LedgerFs = {
  exists: (path) => existsSync(path),
  copy: () => undefined,
  remove: (path) => rmSync(path, { force: true }),
};

const bootstrapCurrencies: readonly BootstrapCurrency[] = referenceCurrencies.map(
  ({ rateSource: _rateSource, ...currency }) => currency,
);

let directory: string;
let paths: LedgerPaths;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "waltning-taxonomy-"));
  paths = { replica: join(directory, "replica.db"), outbox: join(directory, "outbox.db") };
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

/**
 * One launch, and the replica it leaves behind.
 *
 * The rows are read from the file rather than through `listCategories()`,
 * which filters archived nodes and shapes them for a picker — this is about
 * what was written, including the archived row one case deliberately makes.
 */
function launch() {
  const session = createLocalLedgerSession({
    open,
    paths,
    fs,
    removeDatabase: (path: string) => rmSync(path, { force: true }),
    bootstrapCurrencies,
    preJournalStores: "refuse" as const,
  });
  return session;
}

/** Open, do something, close — the shape every case here takes. */
function withSession<T>(use: (session: ReturnType<typeof launch>) => T): T {
  const session = launch();
  try {
    return use(session);
  } finally {
    session.close();
  }
}

function rowsOf() {
  const sqlite = new Database(paths.replica, { readonly: true });
  try {
    return drizzle(sqlite, { schema: ledgerSchema })
      .select()
      .from(categories)
      .orderBy(categories.sort)
      .all();
  } finally {
    sqlite.close();
  }
}

/** Every row the shipped list says should exist, in the order it says. */
function expected() {
  const rows: {
    key: string;
    name: string;
    kind: string;
    parent: string | null;
    isLeaf: boolean;
  }[] = [];
  for (const tree of [incomeTree, expenseTree]) {
    for (const group of tree) {
      rows.push({
        key: group.key,
        name: group.name,
        kind: group.kind,
        parent: null,
        isLeaf: false,
      });
      for (const leaf of group.leaves) {
        rows.push({
          key: leaf.key,
          name: leaf.name,
          kind: group.kind,
          parent: group.key,
          isLeaf: true,
        });
      }
    }
  }
  for (const leaf of topLevelLeaves) {
    rows.push({ key: leaf.key, name: leaf.name, kind: leaf.kind, parent: null, isLeaf: true });
  }
  return rows;
}

describe("the taxonomy ships with the app", () => {
  it("a first launch already holds every category, so the picker is never empty", () => {
    withSession(() => {
      const rows = rowsOf();
      expect(rows).toHaveLength(expected().length);
      // 15 groups and 59 leaves, `Uncategorized` among them — J01 §2's count.
      expect(rows.filter((row) => !row.isLeaf)).toHaveLength(15);
      expect(rows.filter((row) => row.isLeaf)).toHaveLength(59);
    });
  });

  it("matches `@waltning/core/taxonomy` row for row, in its own order", () => {
    withSession(() => {
      const byKey = new Map(rowsOf().map((row) => [row.externalId, row]));

      expected().forEach((want, index) => {
        const row = byKey.get(`seed:${want.key}`);
        expect(row, `no seeded row for ${want.key}`).toBeDefined();
        expect(row?.name).toBe(want.name);
        expect(row?.kind).toBe(want.kind);
        expect(row?.isLeaf).toBe(want.isLeaf);
        expect(row?.sort).toBe(index);
        // A leaf points at its group by the group's own row, resolved from
        // the key: two groups may one day hold a leaf of the same name.
        const parent = want.parent === null ? null : byKey.get(`seed:${want.parent}`)?.id;
        expect(row?.parentId ?? null).toBe(parent ?? null);
      });
    });
  });

  it("carries the earnings flag where the list sets it", () => {
    withSession(() => {
      const rows = rowsOf();
      expect(rows.find((row) => row.externalId === "seed:salary")?.isEarnings).toBe(true);
      // "money you will give back — never earnings", as the list says.
      expect(rows.find((row) => row.externalId === "seed:borrowed")?.isEarnings).toBe(false);
    });
  });

  it("keys every row on `seed:<key>`, the id both engines reconcile on", () => {
    withSession(() => {
      const rows = rowsOf();
      expect(rows.every((row) => row.externalId?.startsWith("seed:"))).toBe(true);
      expect(new Set(rows.map((row) => row.externalId)).size).toBe(rows.length);
      expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    });
  });

  it("writes the list once, however many times the app launches", () => {
    const first = withSession(() => rowsOf().length);
    const second = withSession(() => rowsOf());
    // `onConflictDoNothing` on `seed:<key>` — the reason this is a bootstrap
    // beside the currencies rather than a migration full of literal ids.
    expect(second).toHaveLength(first);
    expect(new Set(second.map((row) => row.externalId)).size).toBe(second.length);
  });

  it("leaves a renamed or archived category exactly as the person left it", () => {
    const before = withSession(() => rowsOf().find((row) => row.externalId === "seed:groceries"));
    // Renamed and archived directly: `rename_category` is an executor test's
    // subject, and this case is only about what the next launch does to a row
    // somebody already changed.
    const sqlite = new Database(paths.replica);
    drizzle(sqlite, { schema: ledgerSchema })
      .update(categories)
      .set({ name: "Food shopping", archived: true })
      .where(eq(categories.externalId, "seed:groceries"))
      .run();
    sqlite.close();

    withSession(() => {
      // After the first launch these are the person's categories, not ours.
      const after = rowsOf().find((row) => row.externalId === "seed:groceries");
      expect(after?.name).toBe("Food shopping");
      expect(after?.archived).toBe(true);
      expect(after?.id).toBe(before?.id);
    });
  });
});
