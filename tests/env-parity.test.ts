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
const SKIP_DIRS = new Set(["node_modules", "dist", ".expo", "drizzle"]);

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

/**
 * `.env.example` must not ship a credential that works.
 *
 * compose guards its secrets with `${VAR:?message}`, which fires when a
 * variable is unset **or empty** — and not when it holds a placeholder.
 * `.env.example` shipped `POSTGRES_PASSWORD=change-me`, so `make setup` copied
 * a non-empty value into `.env` and the guard passed. The whole appliance then
 * booted on a password published in a public repository, with every check
 * reporting success: the loudest possible design, defeated by the quietest
 * possible input.
 *
 * Empty is the only value that makes the guard already in `docker-compose.yml`
 * do its job, so the rule is derived from compose rather than listed here — a
 * hand-kept list of secrets is one secret behind the day someone adds one.
 */
describe("no usable credential ships in .env.example", () => {
  /** Every variable compose refuses to start without: `${NAME:?...}` or `${NAME:?}`. */
  function guardedByCompose(): Set<string> {
    const text = readFileSync(join(repoRoot, "docker-compose.yml"), "utf8");
    const names = new Set<string>();
    for (const m of text.matchAll(/\$\{([A-Z0-9_]+):\?/g)) if (m[1]) names.add(m[1]);
    return names;
  }

  /** Declared name → its literal value, comments and blank lines discarded. */
  function declaredValues(): Map<string, string> {
    const text = readFileSync(join(repoRoot, ".env.example"), "utf8");
    const out = new Map<string, string>();
    for (const line of text.split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      // Strip a trailing `# comment`, which several entries carry.
      if (m?.[1]) out.set(m[1], (m[2] ?? "").replace(/\s+#.*$/, "").trim());
    }
    return out;
  }

  /** A connection string is structure, not a secret — the next test owns those. */
  const isConnectionString = (value: string) => /^postgres(?:ql)?:\/\//.test(value);

  it("leaves every compose-guarded secret empty", () => {
    const values = declaredValues();
    const guarded = guardedByCompose();

    // Vacuity guard, first: a regex that stopped matching would turn the
    // assertion below into `expect([]).toEqual([])` — the exact failure
    // `module-boundaries.test.ts` documents as worse than having no test.
    expect(guarded.size, "compose-guarded variables found").toBeGreaterThan(3);
    expect(guarded).toContain("POSTGRES_PASSWORD");

    const shipped = [...guarded]
      .map((name) => [name, values.get(name) ?? ""] as const)
      // A guarded *URL* must still ship — it carries the host, role and
      // database that the person deploying this has no other source for.
      // Emptying it would delete documentation to protect a secret that is
      // not in it. What must not survive is the password inside it, which is
      // a different assertion with a different fix.
      .filter(([, value]) => value !== "" && !isConnectionString(value))
      .map(([name, value]) => `${name}=${value} — compose guards this; a value defeats the guard`);

    expect(shipped, "credentials with a value in .env.example").toEqual([]);
  });

  /**
   * The same secret is also embedded in four connection strings, where emptying
   * the variable does not reach it. Left as a placeholder they invite the
   * repair that reintroduces the bug — setting `POSTGRES_PASSWORD` back to
   * `change-me` so the two agree.
   */
  it("carries no password inside a connection string", () => {
    const withPassword: string[] = [];
    for (const [name, value] of declaredValues()) {
      const m = /^postgres(?:ql)?:\/\/[^:/@]+:([^@]*)@/.exec(value);
      if (m && (m[1] ?? "") !== "") withPassword.push(`${name} carries "${m[1]}"`);
    }
    expect(withPassword, "connection strings with a baked-in password").toEqual([]);
  });
});
