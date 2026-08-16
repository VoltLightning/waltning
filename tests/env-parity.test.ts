/**
 * Every environment variable the code reads must be declared in `.env.example`.
 *
 * This exists because the failure it prevents has already happened twice, and
 * both times it was invisible:
 *
 *  - Two connection sites read `DATABASE_URL`, which `.env.example` does not
 *    define — it defines the three-way split that *is* T1. A fresh clone died
 *    on the first db command, and the obvious repair (point it at the
 *    superuser) would have left the tax guarantee unenforceable.
 *  - The API read `API_HOST` while `.env.example` declared `BIND_ADDRESS`. An
 *    operator setting `BIND_ADDRESS` was ignored. It worked only because both
 *    defaulted to loopback — a silent no-op with a security-shaped blast
 *    radius.
 *
 * Neither was caught by types, lint, or review. Both are caught by this.
 *
 * `.env.example` is the deployment contract: if a variable is not in it, the
 * person standing this up on a Pi has no way to know it exists.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const SEARCH_ROOTS = ["apps", "packages", "tools"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".expo", "drizzle", "__checks__"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** `process.env["NAME"]` — bracket access is mandatory (noPropertyAccessFromIndexSignature). */
const READ = /process\.env\[["']([A-Z0-9_]+)["']\]/g;

function declaredKeys(): Set<string> {
  const text = readFileSync(join(repoRoot, ".env.example"), "utf8");
  const keys = new Set<string>();
  for (const line of text.split("\n")) {
    const m = /^([A-Z0-9_]+)=/.exec(line.trim());
    if (m?.[1]) keys.add(m[1]);
  }
  return keys;
}

function reads(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const root of SEARCH_ROOTS) {
    for (const file of sourceFiles(join(repoRoot, root))) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(READ)) {
        const name = m[1];
        if (!name) continue;
        const where = found.get(name) ?? [];
        where.push(relative(repoRoot, file));
        found.set(name, where);
      }
    }
  }
  return found;
}

describe("environment contract", () => {
  it("declares every variable the code reads in .env.example", () => {
    const declared = declaredKeys();
    const undeclared = [...reads().entries()]
      .filter(([name]) => !declared.has(name))
      .map(([name, files]) => `${name} — read in ${[...new Set(files)].join(", ")}`);

    expect(undeclared, "undeclared environment variables").toEqual([]);
  });

  it("finds the reads at all, so a broken scan cannot pass silently", () => {
    // A regex that matches nothing would make the test above vacuously true.
    // These two are load-bearing and will exist for the life of the project.
    const names = new Set(reads().keys());
    expect(names).toContain("APP_DATABASE_URL");
    expect(names).toContain("MIGRATE_DATABASE_URL");
  });
});
