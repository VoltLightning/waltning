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

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const SKIP = new Set(["node_modules", "dist", ".expo", "drizzle"]);

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

/** Which module a path belongs to, or undefined if it is outside them all. */
function moduleOf(path: string, root: string): string | undefined {
  const rel = relative(join(repoRoot, root), path);
  if (rel.startsWith("..")) return undefined;
  const [name] = rel.split("/");
  return name;
}

function crossModuleViolations(root: string): string[] {
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

      // Reaching a sibling module is allowed only through its public API.
      const isPublicApi = /\/index\.tsx?$/.test(target) || target.endsWith(`/${other}`);
      bad.push(
        `${relative(repoRoot, file)} → ${spec}` +
          (isPublicApi ? " (public API, still cross-module)" : " (reaches internals)"),
      );
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
    expect(crossModuleViolations("apps/mobile/src/features"), "cross-feature imports").toEqual([]);
  });

  it("keeps shared/ from importing a feature", () => {
    const reaching: string[] = [];
    for (const file of sourceFiles(join(repoRoot, "apps/mobile/src/shared"))) {
      for (const spec of importsOf(file)) {
        if (spec.includes("/features/")) reaching.push(`${relative(repoRoot, file)} → ${spec}`);
      }
    }
    expect(reaching, "shared importing a feature").toEqual([]);
  });

  /**
   * `packages/ui` and `packages/core` are consumed by both apps, so a domain
   * import there would tie the design system to one app's features.
   */
  it("keeps the shared packages free of app imports", () => {
    const reaching: string[] = [];
    for (const pkg of ["packages/ui/src", "packages/core/src"]) {
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
