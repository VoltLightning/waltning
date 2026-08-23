/**
 * Runtime patches whose absence fails only on a device.
 *
 * `better-sqlite3` finalizes one-shot statements itself, so the ledger's real
 * transaction tests cannot reproduce Expo SQLite retaining a writing cursor
 * until `commit`. This pins the narrow upstream workaround at the
 * package-manager boundary: removing or weakening the patch must turn the
 * ordinary test gate red before a phone becomes the first place that exercises
 * it.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const drizzlePatch = join(repoRoot, "patches/drizzle-orm@0.45.2.patch");
const workspace = join(repoRoot, "pnpm-workspace.yaml");

const expoDriverProbe = `
const { ExpoSQLiteSession } = require("drizzle-orm/expo-sqlite/session");
const { SQLiteSyncDialect } = require("drizzle-orm/sqlite-core");
const { sql } = require("drizzle-orm");

let finalizations = 0;
let completions = 0;
let firstReads = 0;
let failNext = false;
const result = {
  changes: 0,
  lastInsertRowId: 0,
  getAllSync() { return []; },
  getFirstSync() { return undefined; },
};

function returningResult() {
  const rows = [{ issued: 1 }, { issued: 2 }];
  const iterator = (function* () {
    for (const row of rows) yield row;
    completions += 1;
  })();
  return Object.assign(iterator, {
    changes: 1,
    lastInsertRowId: 1,
    getAllSync() {
      completions += 1;
      return rows;
    },
    getFirstSync() {
      firstReads += 1;
      return rows[0];
    },
  });
}

const client = {
  prepareSync(source) {
    return {
      executeSync() {
        if (failNext) {
          failNext = false;
          throw new Error("driver failure");
        }
        return source.includes("returning") ? returningResult() : result;
      },
      executeForRawResultSync() { return result; },
      finalizeSync() { finalizations += 1; },
    };
  },
};
const session = new ExpoSQLiteSession(client, new SQLiteSyncDialect(), undefined);

session.run(sql.raw("select 1"));
if (finalizations !== 1) throw new Error("a successful one-shot query was not finalized");

failNext = true;
try {
  session.run(sql.raw("select broken"));
} catch {}
if (finalizations !== 2) throw new Error("a failed one-shot query was not finalized");

const prepared = session.prepareQuery({ sql: "select reusable", params: [] }, undefined, "run", false);
prepared.run();
if (finalizations !== 2) throw new Error("an explicit prepared query was finalized after one use");

const returned = session.get(sql.raw("insert returning"));
if (returned.issued !== 1) throw new Error("a one-shot get did not return its first row");
if (completions !== 1) throw new Error("a one-shot get left its writing cursor in progress");
if (firstReads !== 0) throw new Error("a one-shot get stopped at its first returning row");
if (finalizations !== 3) throw new Error("a completed one-shot get was not finalized");

const reusableGet = session.prepareQuery(
  { sql: "select reusable returning", params: [] },
  undefined,
  "get",
  false,
);
const reusableRow = reusableGet.get();
if (reusableRow.issued !== 1) throw new Error("a reusable get did not return its first row");
if (completions !== 2) throw new Error("a reusable get left its cursor in progress");
if (finalizations !== 3) throw new Error("a reusable get was finalized after one use");
`;

describe("the Expo SQLite Drizzle patch", () => {
  it("completes every get and finalizes only one-shot statements", () => {
    const patch = readFileSync(drizzlePatch, "utf8");
    const workspaceConfig = readFileSync(workspace, "utf8");

    expect(patch).toContain("prepareOneTimeQuery(");
    expect(patch).toContain("isOneTime");
    expect(patch).toContain("finally");
    expect(patch).toContain("this.stmt.finalizeSync()");
    expect(workspaceConfig).toContain("drizzle-orm@0.45.2: patches/drizzle-orm@0.45.2.patch");

    expect(() =>
      execFileSync(process.execPath, ["-e", expoDriverProbe], {
        cwd: dirname(join(repoRoot, "apps/mobile/package.json")),
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
