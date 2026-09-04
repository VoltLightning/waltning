/**
 * Module boundaries, enforced.
 *
 * The structure is only worth having if it holds. Every codebase that
 * reorganised into feature modules and then let one reach into another ended up
 * with the same tangle it started with, plus more folders — and it happens one
 * reasonable-looking import at a time, never as a decision.
 *
 * Biome's `noRestrictedImports` matches package names, not relative paths, so
 * this is a test rather than a lint rule. It runs in the suite the pre-commit
 * hook gates on.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const SKIP = new Set(["node_modules", "dist", ".expo", "drizzle"]);

/**
 * **Every root must exist.** This helper used to swallow a missing directory and
 * return `[]`, which turned the assertion into `expect([]).toEqual([])`.
 *
 * That is not hypothetical: `apps/mobile/src/features` and
 * `apps/mobile/src/shared` were moved into packages, and two tests in this file
 * went on passing over nothing for a whole PR — the one that introduced the
 * principle that a renamed folder must turn a check red. A green test over a
 * missing directory is worse than no test, because it reads as coverage.
 */
function requireDir(dir: string): void {
  if (!existsSync(dir)) {
    throw new Error(
      `${relative(repoRoot, dir)} does not exist — this scan would pass vacuously. ` +
        "Point the check at the new location or delete it; do not leave it green.",
    );
  }
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const IMPORT = /(?:from|import)\s+["']([^"']+)["']/g;

function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(IMPORT)].map((m) => m[1] ?? "").filter(Boolean);
}

/**
 * The domain-free foundation of each package — not modules, and depended on by
 * every module by design.
 *
 * `primitives/` is domain-free by *property*, not by tier, which is exactly why
 * `fx/` may import it and it may not import `fx/`. The reverse direction is the
 * one the next test guards.
 */
const FOUNDATION = new Set([
  "primitives", // ui — domain-free shapes
  /**
   * `theme` — the roles a colour can play, and the hook that resolves them.
   *
   * Domain-free by the same property `primitives/` is: *surface*, *danger* and
   * *focus ring* mean the same thing in a ledger or a chat client. It sits
   * below `primitives/` rather than beside it — a `Button` names a role, and no
   * role has ever needed a button.
   */
  "theme",
  "transport", // client — reaching the server
  "query", // client — the async-read primitive
  /**
   * **`fx` is foundational, and that is a claim about this product.**
   *
   * Money is the cross-cutting vocabulary of a finance app: `design-system/04`
   * requires *every* figure to render through `<Amount>`/`<FxAmount>`, so every
   * domain that shows a number depends on this one. That is a floor, not a
   * tangle — `fx/` imports `primitives/` and `tokens.ts` and nothing else, so
   * the dependency runs one way. If anything in `fx/` ever imports a domain,
   * the next test fails and this line stops being true.
   */
  "fx",
  /**
   * **`i18n` is foundational for the same reason `fx` is.**
   *
   * A language is not a domain. Every module that shows a word depends on this
   * one, and `tests/architecture.test.ts` makes that mandatory — no component
   * anywhere may hold a user-visible literal. The direction stays one-way:
   * `i18n/` imports nothing but itself, so the catalogue cannot come to depend
   * on the screens that read it.
   */
  "i18n",
  /**
   * **`shell` and `states` are chrome, not domains — the same property that
   * makes `fx` and `i18n` foundational.** `Shell`, `Card`, `TabBar`,
   * `BottomSheet` (`shell/`) and `EmptyState`, `ErrorState`, `Toast`,
   * `MatchWarning` (`states/`) mean the same thing in every domain that has a
   * screen or a sheet; nothing about them names an account, a transaction or a
   * category. D4a's `CategorySheet` is the first module to compose one of
   * these — the wave-3 shared plan says explicitly to build "over
   * `BottomSheet`" and to compose `EmptyState` rather than reinvent it — and
   * hit this test unpromoted, which is the gap this closes.
   *
   * The direction still runs one way: neither folder imports a domain (verified
   * below, same as `fx`), so a domain depending on either is a floor, not a
   * tangle.
   */
  "shell",
  "states",
  /**
   * **`device` is foundational for the same property as `shell`/`states`.**
   * `createDevicePreference` knows nothing about what it stores — its own
   * docstring says so — so *appearance*, *display currency*, a floating
   * button's position all mean the same thing to it: a codec, a store, and
   * `useSyncExternalStore`'s shape. E3's `currencies/display-currency.ts` is
   * the first module to compose it rather than reimplement its hydration by
   * hand (`appearance/create-appearance.ts` predates it and did exactly
   * that), and hit this test unpromoted — the same gap `shell`/`states`
   * closed for D4a. The direction still runs one way: `device/` imports
   * nothing but itself and React, so a domain depending on it is a floor,
   * not a tangle. D4b's last-captured account (`transactions/last-capture.ts`)
   * is the first *domain* module to compose it.
   */
  "device",
]);

/** Which module a path belongs to, or undefined if it is outside them all. */
function moduleOf(path: string, root: string): string | undefined {
  const rel = relative(join(repoRoot, root), path);
  if (rel.startsWith("..")) return undefined;
  const parts = rel.split("/");
  // A file sitting directly in `src/` is not in a module — `tokens.ts` is the
  // package's own floor, below every domain including the foundation.
  if (parts.length < 2) return undefined;
  const [name] = parts;
  return name && FOUNDATION.has(name) ? undefined : name;
}

function crossModuleViolations(root: string): string[] {
  requireDir(join(repoRoot, root));
  const files = sourceFiles(join(repoRoot, root));
  const bad: string[] = [];

  for (const file of files) {
    const owner = moduleOf(file, root);
    if (!owner) continue;

    for (const spec of importsOf(file)) {
      if (!spec.startsWith(".")) continue;
      const target = join(file, "..", spec);
      const other = moduleOf(target, root);
      if (!other || other === owner) continue;

      bad.push(`${relative(repoRoot, file)} → ${spec} (cross-module import)`);
    }
  }
  return bad;
}

describe("api modules", () => {
  it("has no module importing another module", () => {
    // Composition happens at the registry, which is not itself a module. Two
    // modules that need each other are usually one module, or want a third
    // that both depend on.
    expect(crossModuleViolations("apps/api/src/modules"), "cross-module imports").toEqual([]);
  });

  it("keeps the shared layers free of domain knowledge", () => {
    const shared = ["apps/api/src/common", "apps/api/src/infra", "apps/api/src/middleware"];
    const reaching: string[] = [];
    for (const dir of shared) {
      requireDir(join(repoRoot, dir));
      for (const file of sourceFiles(join(repoRoot, dir))) {
        for (const spec of importsOf(file)) {
          if (spec.includes("/modules/")) reaching.push(`${relative(repoRoot, file)} → ${spec}`);
        }
      }
    }
    expect(reaching, "shared code importing a module").toEqual([]);
  });
});

describe("mobile features", () => {
  it("has no feature importing another feature", () => {
    // Repointed. The features moved into `packages/client` and this scan was
    // left aimed at a deleted directory, passing over nothing for a whole PR.
    expect(crossModuleViolations("packages/client/src"), "cross-domain imports").toEqual([]);
    expect(crossModuleViolations("packages/ui/src"), "cross-domain imports").toEqual([]);
  });

  it("keeps the domain-free foundation from importing a domain", () => {
    /**
     * The direction that matters. `primitives/`, `transport/` and `query/` are
     * domain-free by *property* — one of them reaching into `accounts/` or
     * `fx/` makes that false, and the folder keeps its innocent name.
     *
     * This used to scan `apps/mobile/src/shared`, which no longer exists; the
     * check passed over an empty list rather than saying so.
     */
    const foundations = [
      "packages/ui/src/primitives",
      "packages/ui/src/fx",
      "packages/client/src/transport",
      "packages/client/src/query",
      "packages/client/src/device",
    ];
    const domains =
      /\/(accounts|transactions|currencies|connectivity|review|shell|dashboard|counterparties|recurring|calendar|reports|tax)\//;

    const reaching: string[] = [];
    for (const dir of foundations) {
      requireDir(join(repoRoot, dir));
      for (const file of sourceFiles(join(repoRoot, dir))) {
        for (const spec of importsOf(file)) {
          if (spec.startsWith(".") && domains.test(spec)) {
            reaching.push(`${relative(repoRoot, file)} → ${spec}`);
          }
        }
      }
    }
    expect(reaching, "a domain-free folder importing a domain").toEqual([]);
  });

  /**
   * The client knows the server's *types* and none of its code.
   *
   * §11.0 promises an operation's input and output types reach the client, so
   * The client package imports `AppRouter` from `@waltning/api` — an edge the
   * dependency floor does not have. It is safe only while it stays type-only:
   * a value import would compile, run in dev, and pull Hono, Drizzle and the
   * Postgres driver into a phone bundle.
   *
   * Verified once against real builds — no server symbol appears in either the
   * web bundle or the Hermes bytecode — but a build is far too slow to gate on,
   * and this catches the regression at its source. `@waltning/db` is not
   * type-only-allowed at all: the client has no business naming the schema.
   */
  it("imports the server for types and never for code", () => {
    const TYPE_ONLY = /^\s*import\s+type\s/;
    const violations: string[] = [];

    const clientRoots = [join(repoRoot, "apps/mobile"), join(repoRoot, "packages/client")];
    for (const file of clientRoots.flatMap((root) => sourceFiles(root))) {
      const text = readFileSync(file, "utf8");
      for (const line of text.split("\n")) {
        const server = /["'](@waltning\/(?:api|db))(?:\/[^"']*)?["']/.exec(line);
        if (!server) continue;
        if (server[1] === "@waltning/db") {
          violations.push(`${relative(repoRoot, file)} imports @waltning/db at all`);
        } else if (!TYPE_ONLY.test(line)) {
          violations.push(`${relative(repoRoot, file)}: ${line.trim().slice(0, 70)}`);
        }
      }
    }

    expect(violations, "client code must import the server as types only").toEqual([]);
  });

  /**
   * `packages/ui` and `packages/core` are consumed by both apps, so a domain
   * import there would tie the design system to one app's features.
   */
  it("keeps the shared packages free of app imports", () => {
    const reaching: string[] = [];
    for (const pkg of ["packages/ui/src", "packages/core/src"]) {
      requireDir(join(repoRoot, pkg));
      for (const file of sourceFiles(join(repoRoot, pkg))) {
        for (const spec of importsOf(file)) {
          if (spec.includes("features/") || spec.includes("modules/") || spec.includes("apps/")) {
            reaching.push(`${relative(repoRoot, file)} → ${spec}`);
          }
        }
      }
    }
    expect(reaching, "shared package importing app code").toEqual([]);
  });
});
