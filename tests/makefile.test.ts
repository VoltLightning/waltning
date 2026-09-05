/**
 * The Makefile and `package.json` must not drift apart.
 *
 * Two places that both know how to run this project is two places that go
 * stale, and the one nobody is looking at is always the stale one. The rule is
 * that **Make orchestrates and pnpm implements**: every target either drives
 * Docker or calls a pnpm script, and never reimplements one.
 *
 * The failure this prevents is quiet in the worst way. Rename a pnpm script and
 * `make dev` does not break at edit time, or in review, or in the gate — it
 * breaks the next time somebody runs it, reporting a missing script rather than
 * anything about the change that caused it.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const makefile = readFileSync(new URL("../Makefile", import.meta.url), "utf8");

const scripts: Record<string, string> = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).scripts;

/**
 * `pnpm <script>` in a **recipe line** — tab-indented, the only place Make
 * actually runs anything.
 *
 * Scanning the whole file read the prose too: this Makefile's own header says
 * "pnpm implements" and "a pnpm script", and the first version of this check
 * dutifully reported `implements` as a missing script.
 */
const RECIPE_LINE = /^\t.*$/gm;
const PNPM_CALL = /\bpnpm\s+([a-z][a-z0-9:-]*)/g;
const NOT_A_SCRIPT = new Set(["install", "exec", "run", "--version", "add", "dlx"]);

describe("the Makefile calls pnpm scripts that exist", () => {
  it("names no script package.json does not define", () => {
    const recipes = (makefile.match(RECIPE_LINE) ?? []).join("\n");
    const called = [...recipes.matchAll(PNPM_CALL)]
      .map((m) => m[1] ?? "")
      .filter((name) => name && !NOT_A_SCRIPT.has(name));

    const missing = [...new Set(called)].filter((name) => !(name in scripts));
    expect(missing, "pnpm scripts named in the Makefile but not defined").toEqual([]);

    // Non-vacuous: if the regex ever stops matching, this is what says so
    // rather than the check silently passing on an empty list.
    expect(called.length, "pnpm calls found in the Makefile").toBeGreaterThan(5);
  });

  it("lists every target it declares, in `make help` itself", () => {
    // **Runs help rather than re-deriving it.** The first version of this
    // matched `## ` with its own regex and passed while `make help` was
    // silently dropping `e2e` and `appliance-e2e` — help's grep excluded
    // digits. A check that mirrors the thing it checks agrees with it by
    // construction, including when both are wrong.
    const phony = (/^\.PHONY:\s*([\s\S]*?)(?=\n\n|\n[a-zA-Z])/m.exec(makefile)?.[1] ?? "")
      .replace(/\\\n/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    // Colour codes stripped first: help prints `\u001b[36msetup`, and a `\\b`
    // word boundary before `setup` never matches because the character before
    // it is the `m` of the escape sequence. Every target then reads as missing,
    // which looks like a real failure and is not.
    const help = execFileSync("make", ["help"], { cwd: repoRoot, encoding: "utf8" })
      // biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escapes is the point
      .replace(/\u001b\[[0-9;]*m/g, "");

    expect(phony.length, ".PHONY targets found").toBeGreaterThan(5);
    expect(
      phony.filter((t) => !new RegExp(`\\b${t}\\b`).test(help)),
      "targets `make help` does not list, so nobody will find them",
    ).toEqual([]);
  });

  it("keeps `clean` from deleting the ledger", () => {
    // `docker compose down -v` removes the volume the database lives in. A
    // `clean` target that quietly does that is a footgun with a friendly name,
    // and the person who runs it will be someone who wanted a tidy container
    // list.
    const cleanRecipe = /^clean:[\s\S]*$/m.exec(makefile)?.[0] ?? "";
    expect(cleanRecipe, "clean target found").toContain("docker compose down");

    // Only lines that *run* something. The recipe deliberately prints
    // `docker compose down -v` as the manual escape hatch, and reading that
    // string as an executed command is how a correct file fails a check.
    const executed = cleanRecipe
      .split("\n")
      .filter((line) => line.startsWith("\t"))
      .filter((line) => !/^\t@?echo\b/.test(line))
      .join("\n");

    expect(/docker compose down[^\n]*\s-v\b/.test(executed), "`clean` must not run -v").toBe(false);
  });
});

describe("Make does not change what it wraps", () => {
  it("exports no application variable into every target", () => {
    // `export BUILD_SHA` at the top level put it in the environment of
    // *everything*, tests included — and two of them assert `/healthz` reports
    // the `dev` fallback when no image was built. `make verify` failed while
    // `pnpm verify` passed: a wrapper silently changing the behaviour of the
    // thing it wraps, which is the one property a wrapper must not have.
    //
    // Configuration belongs in `.env`. Anything Make needs to set goes on the
    // target that needs it.
    const declared = new Set(
      [
        ...readFileSync(new URL("../.env.example", import.meta.url), "utf8").matchAll(
          /^([A-Z][A-Z0-9_]*)=/gm,
        ),
      ].map((m) => m[1] ?? ""),
    );

    // Global exports only — `up: export FOO := …` is target-scoped and fine.
    const globalExports = [...makefile.matchAll(/^export\s+([A-Z][A-Z0-9_]*)/gm)].map(
      (m) => m[1] ?? "",
    );

    expect(
      globalExports.filter((name) => declared.has(name)),
      "application variables exported to every target, tests included",
    ).toEqual([]);
  });
});

describe("Make orchestrates and pnpm implements — in that direction (L-4)", () => {
  it("`make db` calls pnpm db:ready instead of keeping its own polling loop", () => {
    const recipe = /^db:.*\n(?:\t.*\n?)*/m.exec(makefile)?.[0] ?? "";
    expect(recipe, "the db target").toContain("pnpm db:ready");
    expect(recipe, "the container start belongs to the script now").not.toMatch(
      /docker compose up/,
    );
    expect(recipe, "so does the health poll").not.toMatch(/sleep/);
  });

  it("no pnpm script shells back into make", () => {
    // This is the direction that breaks the rule. `dev:all` used to run
    // `make db`, which made Make a dependency of the *implementation*: the
    // command stops working wherever Make is missing, for a reason nothing
    // about `pnpm dev:all` suggests, and one procedure ends up half in each
    // file. Make may call pnpm; pnpm may not call Make.
    const offenders = Object.entries(scripts)
      .filter(([, body]) => /(?:^|[\s;&|])make(?:$|[\s;&|])/.test(body))
      .map(([name]) => name);
    expect(offenders, "pnpm scripts that shell into make").toEqual([]);
  });

  it("both callers wait for Postgres through that one script", () => {
    expect(scripts["db:ready"], "package.json must define db:ready").toBeDefined();
    expect(scripts["dev:all"]).toContain("pnpm db:ready");
    // `db:up` stays, and stays different: it starts the container and
    // returns. Anything that then talks to the database wants `db:ready`.
    expect(scripts["db:up"]).toContain("docker compose up");
    expect(scripts["db:up"]).not.toContain("db:ready");
  });
});

describe("package.json stays the implementation", () => {
  it("still defines the scripts the docs tell people to run", () => {
    // These names appear in the README, the wiki and the Makefile. Renaming one
    // is a decision, not a refactor, and this is where that gets noticed.
    for (const name of ["dev:api", "dev:web", "dev:ios", "e2e", "verify", "db:reset"]) {
      expect(scripts, `package.json must define ${name}`).toHaveProperty(name);
    }
  });

  it("has no `dev` script pretending to start everything", () => {
    // It used to, and it started the API alone. `make dev` (API + web) and
    // `pnpm dev:all` (API + mobile) are the sanctioned answers to "run more
    // than one surface" — both wait for Postgres first, then run their pair
    // in parallel, Ctrl-C stops both. A bare `pnpm dev` would still be a
    // second, different answer to the same question, so it stays out until
    // an owner decides otherwise.
    expect(scripts).not.toHaveProperty("dev");
    expect(repoRoot).toBeTruthy();
  });
});
