/**
 * `architecture/11` — the manifesto, as tests.
 *
 * Every rule in that document is here, and the ones that are not here are not
 * rules. This repository has the evidence for why that matters: `packages/ui`
 * shipped a conformance suite banning hardcoded colours, and the app hardcoded
 * the exact colour the token file names as its motivating defect — because the
 * suite rooted itself at `packages/ui/src` and could not see `apps/`.
 *
 * **A rule whose scope is narrower than the behaviour it governs is not a rule.
 * It is a rule about one directory.** So every check here roots at the
 * repository, and every one carries a non-vacuity guard: a renamed folder must
 * turn a check red, not silently green.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const SKIP = new Set(["node_modules", "dist", ".expo", "drizzle", "coverage"]);

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

/**
 * Comments stripped first, and this is not fastidiousness.
 *
 * The first version of this scanned raw text and reported `node:fs` and a
 * sentence — `from "that was not the server"` — as dependencies of
 * `packages/core`. Prose in this repository quotes code constantly, so a naive
 * import scanner reads the documentation as source. That direction is a false
 * positive and merely annoying; the same sloppiness in the other direction is a
 * check that misses the real thing.
 */
function importsOf(file: string): string[] {
  const code = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  return [...code.matchAll(IMPORT)].map((m) => m[1] ?? "");
}

const rel = (f: string) => relative(repoRoot, f);

/**
 * The apps that exist, read from disk rather than listed.
 *
 * A hardcoded `["apps/mobile", "apps/web"]` contributes nothing for the app
 * that is not there yet — the same silent-empty shape that let two boundary
 * tests scan deleted directories for a whole PR. Reading the filesystem means
 * `apps/web` is covered the day it appears, and nothing pretends to cover it
 * before then.
 */
function appRoots(): string[] {
  return readdirSync(join(repoRoot, "apps"))
    .filter((name) => name !== "api")
    .map((name) => join(repoRoot, "apps", name))
    .filter((dir) => statSync(dir).isDirectory());
}
const isTest = (f: string) => /\.(test|type-test)\.tsx?$/.test(f);
/** `expo-env.d.ts` and friends are generated ambient types, not authored code. */
const isAmbient = (f: string) => f.endsWith(".d.ts");

/* ── §2 · The floor ──────────────────────────────────────────────────────── */

describe("packages/client is React, never React Native", () => {
  /**
   * The single line the whole design rests on. React is platform-neutral and
   * React Native is a renderer — so a hook written against React alone runs
   * unchanged under Expo and under Vite, and every piece of client *behaviour*
   * is shared by construction.
   *
   * One `react-native` import here forks the second app before it exists.
   */
  const FORBIDDEN = /^(react-native|react-dom|expo|expo-.*|@react-navigation\/.*)$/;

  it("imports no renderer and no platform package", () => {
    const files = sourceFiles(join(repoRoot, "packages/client/src"));
    const offenders: string[] = [];
    for (const file of files) {
      for (const spec of importsOf(file)) {
        if (FORBIDDEN.test(spec)) offenders.push(`${rel(file)} → ${spec}`);
      }
    }
    expect(offenders, "packages/client must name no platform").toEqual([]);
    expect(files.length, "client source files found").toBeGreaterThan(5);
  });
});

describe("packages/core runs on a phone", () => {
  /**
   * "No Node APIs" was prose, and provably unenforced: `packages/core` inherits
   * every `@types/*` visible from the root, so a production file importing
   * `node:fs` or `node:crypto` compiles, passes the gate, works on the server
   * and crashes on the phone.
   */
  it("imports no Node builtin outside its tests", () => {
    const files = sourceFiles(join(repoRoot, "packages/core/src")).filter((f) => !isTest(f));
    const offenders: string[] = [];
    for (const file of files) {
      for (const spec of importsOf(file)) {
        if (spec.startsWith("node:")) offenders.push(`${rel(file)} → ${spec}`);
      }
    }
    expect(offenders, "core must run identically on phone and server").toEqual([]);
    expect(files.length, "core production files found").toBeGreaterThan(5);
  });

  it("depends on decimal.js and zod, and nothing else", () => {
    // The floor stated as a set rather than a sentence. A bare specifier that
    // is not relative, not a Node builtin and not on this list is a new
    // dependency for the layer whose whole promise is that it has almost none.
    const allowed = new Set(["decimal.js", "zod"]);
    const files = sourceFiles(join(repoRoot, "packages/core/src")).filter((f) => !isTest(f));
    const offenders: string[] = [];
    for (const file of files) {
      for (const spec of importsOf(file)) {
        if (spec.startsWith(".") || spec.startsWith("node:")) continue;
        if (!allowed.has(spec)) offenders.push(`${rel(file)} → ${spec}`);
      }
    }
    expect(offenders, "core's dependency floor").toEqual([]);
  });
});

describe("the database never reaches a client", () => {
  /**
   * "`mobile` never imports `db`" was enforced for one specifier in one
   * directory. It was defeated two ways: a relative reach into
   * `../../packages/db/src`, and transitively — nothing stopped `packages/ui`
   * or `packages/core` importing it, and mobile depends on both. One line would
   * have put the Postgres driver in a phone bundle with a green suite.
   */
  const CLIENT_ROOTS = [
    "apps/mobile",
    "packages/client",
    "packages/core",
    /**
     * The phone's own ledger, and the one that would be worst to miss: it
     * legitimately imports a database library, so a stray `@waltning/db` would
     * look like it belonged. §14.7's whole bound is that the two engines meet
     * through `packages/schema` and nowhere else.
     */
    "packages/ledger",
    "packages/ui",
  ];

  it("no client package or app names @waltning/db, by any path", () => {
    const offenders: string[] = [];
    for (const root of CLIENT_ROOTS) {
      for (const file of sourceFiles(join(repoRoot, root))) {
        for (const spec of importsOf(file)) {
          const reachesDb =
            spec === "@waltning/db" ||
            spec.startsWith("@waltning/db/") ||
            /packages\/db\//.test(spec);
          if (reachesDb) offenders.push(`${rel(file)} → ${spec}`);
        }
      }
    }
    expect(offenders, "the Postgres driver must not reach a client bundle").toEqual([]);
  });
});

/* ── §1 · The seam ───────────────────────────────────────────────────────── */

describe("apps hold only what names a platform", () => {
  /**
   * The seam: *does this file name a platform?* Of 22 client files, three did.
   * The other nineteen were duplication waiting for a second app — two of them
   * carrying docstrings explaining they were written platform-free on purpose.
   *
   * A file "names a platform" if it imports a renderer, a router or an SDK, or
   * reads a build-time global that only one bundler defines.
   *
   * **Scoped Expo packages count, and were missing.** `@expo-google-fonts/*`
   * ships `.ttf` files behind `require()` calls that only Metro resolves — an
   * import of one dies under Node — which is as platform-bound as a line gets.
   * The pattern matched bare `expo-*` and not the scoped form, so the first
   * file to import one was reported as shareable code that belongs in a
   * package. It does not: moving it would put a Metro-only asset require inside
   * `packages/ui`, which every other surface would then have to resolve.
   */
  const NAMES_PLATFORM =
    /from\s+["'](react-native|expo|expo-.*|@expo(-[\w-]+)?\/.*|@react-navigation\/.*)["']|Platform\.OS|__DEV__|EXPO_PUBLIC_|import\.meta\.env/;

  it("every app source file is platform-bound, a test, or a route", () => {
    const offenders: string[] = [];
    const roots = appRoots();
    expect(roots.length, "client apps found").toBeGreaterThan(0);
    for (const app of roots) {
      for (const file of sourceFiles(app)) {
        if (isTest(file) || isAmbient(file)) continue;
        // `app/` is the route tree — composition is its job by definition.
        if (/^apps\/[^/]+\/app\//.test(rel(file))) continue;
        if (!NAMES_PLATFORM.test(readFileSync(file, "utf8"))) offenders.push(rel(file));
      }
    }
    expect(
      offenders,
      "shareable code in an app — move it to packages/client or packages/ui",
    ).toEqual([]);
  });

  it("a route composes and does not define hooks", () => {
    // A hook in a route file is invisible to the runner (`app/` is a sibling of
    // `src/`, not a child) and closes over a singleton instead of taking a
    // client, so no test can point it at a stub. Both are properties of where
    // it was written.
    const offenders: string[] = [];
    const routeDirs = appRoots().map((a) => join(a, "app"));
    expect(
      routeDirs.some((d) => statSync(d).isDirectory()),
      "route trees found",
    ).toBe(true);
    for (const file of routeDirs.flatMap((d) => sourceFiles(d))) {
      const text = readFileSync(file, "utf8");
      if (/\bfunction\s+use[A-Z]/.test(text) || /\bconst\s+use[A-Z]\w*\s*=/.test(text)) {
        offenders.push(rel(file));
      }
    }
    expect(offenders, "hooks belong in packages/client, not in a route").toEqual([]);
  });

  it("route declarations stay universal and resolve platform modules outside app", () => {
    // Expo Router requires an unsuffixed route for deep links and generated
    // Href types. Keeping platform variants beside that route still puts both
    // route modules in Metro's context; the web dashboard then appears in a
    // native bundle. The route stays universal and re-exports an extensionless
    // module outside `app/`, where Metro resolves exactly one platform file.
    const platformRoute = /\.(native|android|ios|web)(?=\.tsx?$)/;
    const routeDirs = appRoots().map((app) => join(app, "app"));
    const routeFiles = routeDirs.flatMap((dir) => sourceFiles(dir));
    const offenders = routeFiles.filter((file) => platformRoute.test(file)).map(rel);

    expect(routeFiles.length, "route files found").toBeGreaterThan(2);
    expect(
      offenders,
      "move platform variants outside app/ and re-export them from one universal route",
    ).toEqual([]);
  });
});

/* ── §6 · Design conformance, at repository scope ────────────────────────── */

describe("design conformance covers every ui folder", () => {
  /**
   * The rule that failed. `packages/ui/src/conformance.test.ts` banned
   * hardcoded colours and rooted at `packages/ui/src`, so when the app wrote
   * `#b3261e` — the very colour `tokens.ts` names as the defect that motivated
   * it — nothing saw. Scope is the whole point of this check.
   */
  function componentFiles(): string[] {
    const roots = [join(repoRoot, "packages/ui/src"), ...appRoots()];
    return roots.flatMap((r) => sourceFiles(r)).filter((f) => /\.tsx$/.test(f) && !isTest(f));
  }

  it("no component anywhere hardcodes a colour", () => {
    const offenders: string[] = [];
    for (const file of componentFiles()) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (/^\s*(\*|\/\/)/.test(line)) continue;
        if (/#[0-9a-fA-F]{3,8}\b/.test(line)) offenders.push(`${rel(file)}: ${line.trim()}`);
      }
    }
    expect(offenders, "use a token from packages/ui/src/tokens.ts").toEqual([]);
    expect(componentFiles().length, "component files found").toBeGreaterThan(10);
  });

  it("no component outside the design system formats money", () => {
    // `money.toMoney` outside `packages/ui` is a figure with no guarantee of
    // tabular numerals — §2.2's "most common omission" — and a second
    // implementation of the sign rules in `computations.md` §1.
    const offenders = componentFiles()
      .filter((f) => !rel(f).startsWith("packages/ui/"))
      .filter((f) => /money\.(toMoney|cmp|sum)\(/.test(readFileSync(f, "utf8")))
      .map(rel);
    expect(offenders, "render figures through <Amount>, not by hand").toEqual([]);
  });
});

/* ── §4 · Import specifiers ──────────────────────────────────────────────── */

describe("platform-variant files are imported extension-less", () => {
  /**
   * `architecture/10`, verified by spike: an explicit extension defeats platform
   * resolution **silently** — `./Button.tsx` keeps the native implementation in
   * the web bundle and nothing errors. The doc calls it "the worst shape a build
   * problem can have"; nothing checked it, and it was already broken.
   */
  it("no relative import of a component carries .tsx", () => {
    const roots = ["packages/ui/src", "apps/mobile"];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of sourceFiles(join(repoRoot, root))) {
        for (const spec of importsOf(file)) {
          if (spec.startsWith(".") && spec.endsWith(".tsx")) {
            offenders.push(`${rel(file)} → ${spec}`);
          }
        }
      }
    }
    expect(offenders, "drop the .tsx — a .web.tsx override would be ignored").toEqual([]);
  });
});

/* ── §3 · Structure: modules first, layers inside them ───────────────────── */

describe("every src/ is organised by domain, not by layer", () => {
  /**
   * **The axis nothing checked.** Every other rule in this file governs what may
   * *import* what; none governed layout — and the philosophy rests on layout.
   *
   * `packages/ui` was `atoms/`, `molecules/`, `organisms/`: the three global
   * folders the rule bans, six lines below the line that specified them. The FX
   * concept spanned all three tiers and five files, and one file held
   * `TransactionRow` and `BalanceRow` together because they are the same *shape*
   * while belonging to different domains.
   *
   * An **allowlist**, not a blocklist of forbidden names. A blocklist is always
   * one novel name behind — ban `utils/` and `helpers/` arrives, ban that and
   * `handlers/` does. Set equality means adding a folder is a decision someone
   * makes here, in the open, rather than a drift nobody sees.
   */
  const ALLOWED: Record<string, readonly string[]> = {
    "apps/api/src": [
      "common",
      "config",
      "http",
      "infra",
      "middleware",
      "modules",
      "registry",
      "trpc",
    ],
    "packages/core/src": ["registry"],
    // Foundation (`transport`, `query`) plus one folder per domain.
    "packages/client/src": [
      "accounts",
      "appearance",
      "connectivity",
      "currencies",
      "ledger",
      "query",
      "transactions",
      "transport",
    ],
    // Foundation (`primitives`, `fx`) plus one folder per domain. The full
    // target is thirteen; six exist because six have components.
    "packages/ui/src": [
      "accounts",
      "fx",
      "primitives",
      "review",
      "shell",
      "states",
      "theme",
      "transactions",
    ],
    "packages/db/src": ["fx", "seed", "test"],
    /**
     * The phone's ledger: **a flat foundation, plus one folder per domain.**
     *
     * The flat half is unchanged and the original reasoning still holds — the
     * SQLite schema, the outbox, the write path, the migrator and the launch
     * reconciler are one concern, §14.7 names them together, and a folder
     * around any of them would be a claim that they are separable.
     *
     * The folders are the local **executors**, and they are separable in
     * exactly the way the foundation is not: `accounts` and `transactions` are
     * different domains, and §14.7's "two engines, one definition" means each
     * one mirrors a module in `apps/api/src/modules/`. Filing them flat would
     * put forty-four operations beside six foundation files and lose the
     * correspondence that makes the two engines checkable against each other.
     */
    "packages/ledger/src": ["accounts", "test", "transactions"],
    /**
     * **Flat, and that is the decision.** The two dialects are file suffixes —
     * `currencies.pg.ts` beside `currencies.sqlite.ts` — not `pg/` and
     * `sqlite/` folders. Folders here would file by *engine*, which puts one
     * table in two places and is the same mistake as filing by tier: the thing
     * you reason about is the table, and its two halves must be adjacent or
     * they drift. `architecture/10` makes the same call for the api's layers.
     */
    "packages/schema/src": [],
  };

  it("has exactly the folders it declares", () => {
    for (const [root, allowed] of Object.entries(ALLOWED)) {
      const full = join(repoRoot, root);
      expect(existsSync(full), `${root} must exist — a scan over a missing root is vacuous`).toBe(
        true,
      );
      const actual = readdirSync(full)
        .filter((e) => statSync(join(full, e)).isDirectory())
        .sort();
      expect(actual, `unexpected folder in ${root} — add it here or move the code`).toEqual([
        ...allowed,
      ]);
    }
  });

  /**
   * **The allowlist is opt-in per root, which made it silently incomplete.**
   *
   * `ALLOWED` is a map keyed by root, and the assertion above iterates *its*
   * entries — so a package with no entry is not checked, it is skipped. Adding
   * `packages/schema` demonstrated it: a whole new package took its place in
   * the workspace with no folder discipline applied and a green suite, which is
   * the failure this file exists to make impossible.
   *
   * The fix is the inversion: the workspace decides what must be covered, and
   * the allowlist has to keep up.
   */
  it("declares an allowlist for every package that has a src/", () => {
    const packages = readdirSync(join(repoRoot, "packages"))
      .filter((e) => statSync(join(repoRoot, "packages", e)).isDirectory())
      .filter((e) => existsSync(join(repoRoot, "packages", e, "src")))
      .map((e) => `packages/${e}/src`)
      .sort();

    // Vacuity guard: an empty scan would make the comparison below trivially
    // true, which is precisely the shape of the hole being closed.
    expect(packages.length, "packages with a src/ found").toBeGreaterThan(3);

    const declared = Object.keys(ALLOWED).filter((r) => r.startsWith("packages/"));
    expect(
      packages.filter((p) => !declared.includes(p)),
      "package with no allowlist entry — it is skipped, not checked",
    ).toEqual([]);
  });

  it("uses no tier name as a folder, anywhere", () => {
    /**
     * "Atomic tiers are a scale *inside* a UI module, never three global
     * folders." A tier may appear at `<domain>/<tier>/` when one domain grows
     * enough to need the scale — never as a direct child of `src/`, which is
     * the form that files by size across the whole system.
     */
    const TIERS = new Set(["atoms", "molecules", "organisms"]);
    const LAYERS = new Set(["hooks", "components", "utils", "helpers", "services", "containers"]);

    const offenders: string[] = [];
    function walk(dir: string, depth: number) {
      for (const entry of readdirSync(dir)) {
        if (SKIP.has(entry)) continue;
        const full = join(dir, entry);
        if (!statSync(full).isDirectory()) continue;
        // Directly under a `src/` root is where filing-by-layer does its damage.
        if (depth === 0 && (TIERS.has(entry) || LAYERS.has(entry))) offenders.push(rel(full));
        walk(full, depth + 1);
      }
    }
    for (const root of Object.keys(ALLOWED)) walk(join(repoRoot, root), 0);

    expect(offenders, "a layer name as a top-level folder — organise by domain").toEqual([]);
  });

  it("keeps api modules flat — layers are file suffixes, not folders", () => {
    // `.operation.ts` and `.service.ts` inside one slice. A `modules/accounts/
    // services/` folder is the same mistake one level down.
    const modules = join(repoRoot, "apps/api/src/modules");
    const nested: string[] = [];
    for (const mod of readdirSync(modules)) {
      const dir = join(modules, mod);
      if (!statSync(dir).isDirectory()) continue;
      for (const entry of readdirSync(dir)) {
        if (statSync(join(dir, entry)).isDirectory()) nested.push(`${mod}/${entry}`);
      }
    }
    expect(nested, "a module must be one flat slice").toEqual([]);
    expect(readdirSync(modules).length, "api modules found").toBeGreaterThan(2);
  });
});

/* ── §4 · globals the phone does not have ────────────────────────────────── */

describe("platform-neutral packages use only globals the phone has", () => {
  /**
   * **The gap `crypto.randomUUID()` walked through.**
   *
   * `packages/schema` and `packages/ledger` called it directly, in code that
   * only ever runs on the device — and neither React Native nor Expo defines a
   * `crypto` global, so every local write that omitted an id would have thrown
   * at the first insert.
   *
   * It typechecked because `tsc` walks up to the workspace root's
   * `node_modules/@types` and finds `@types/node`, which declares a global Node
   * has and the phone does not. The editor, resolving from the package, was
   * right to complain where the CLI was not.
   *
   * `types: []` was tried as the fix and is the wrong tool: `packages/core`
   * legitimately uses `fetch` and `Response` for Rule 0, and adding the DOM lib
   * to satisfy those puts `crypto` back as a declared global while React Native
   * still lacks it. There is no lib that describes the phone's runtime, so the
   * list is stated here instead.
   */
  const NEUTRAL = [
    "packages/core",
    "packages/schema",
    "packages/ui",
    "packages/client",
    "packages/ledger",
  ];

  /** Globals that exist in Node, or a browser, or both — and not in React Native. */
  const ABSENT_ON_DEVICE: Record<string, string> = {
    crypto: "React Native has no crypto global; apps/mobile polyfills it, core guards it",
    process: "Metro replaces `process.env` at build time and defines nothing else",
    Buffer: "Node only",
    __dirname: "Node only",
    __filename: "Node only",
    localStorage: "browser only — the phone uses expo-secure-store (§5.7)",
    document: "browser only",
    window: "browser only",
  };

  /**
   * `random.ts` is the sanctioned reader, and the only one: it exists precisely
   * to check for the global and throw something a person can act on.
   */
  const GUARDED = ["packages/core/src/random.ts"];

  it("no neutral package reaches for a global the device lacks", () => {
    const offenders: string[] = [];

    for (const root of NEUTRAL) {
      for (const file of sourceFiles(join(repoRoot, root))) {
        const relative = rel(file);
        if (isTest(file) || GUARDED.includes(relative)) continue;

        // Comments discuss these globals constantly — `money.ts` explains what
        // a `Decimal.set` does "for the whole process". Strip them first.
        const code = readFileSync(file, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");

        for (const [name, why] of Object.entries(ABSENT_ON_DEVICE)) {
          if (new RegExp(`\\b${name}\\s*[.[]`).test(code)) {
            offenders.push(`${relative} uses \`${name}\` — ${why}`);
          }
        }
      }
    }

    expect(offenders, "a global the phone does not have").toEqual([]);
    // Non-vacuous: if the walk stops finding files this passes over nothing.
    expect(NEUTRAL.flatMap((r) => sourceFiles(join(repoRoot, r))).length).toBeGreaterThan(30);
  });
});

/* ── §5 · nothing escapes the typechecker ────────────────────────────────── */

describe("every TypeScript file is typechecked by something", () => {
  /**
   * **Twelve files were checked by nothing.**
   *
   * `pnpm -r typecheck` walks workspace *packages*, and `tests/` is not one — so
   * the eleven guards that enforce every architectural rule in this repository,
   * plus `vitest.config.ts`, were transpiled by vitest and typechecked by
   * nowhere. Vitest strips types without checking them, so the failure mode is
   * not a red build: it is a check that passes while asserting something its
   * author did not mean. Adding `tests/tsconfig.json` found a real error in the
   * first file it read.
   *
   * **This asks a cheap question deliberately.** Two accurate versions were
   * tried and both are too slow to live in a pre-commit hook: `--listFilesOnly`
   * per project costs ~14s, and `--showConfig` — which ought to be cheaper,
   * since it never loads the type system — costs 60s once `npx` resolves the
   * binary eleven times. A guard that adds a minute to every commit is a guard
   * somebody deletes.
   *
   * So: does an ancestor directory own a `tsconfig.json`? That is the mistake
   * actually made — a whole directory nobody claimed — and it costs
   * milliseconds. It would not catch a file *inside* a project that the
   * project's own `include` excludes, which is a narrower and much rarer hole.
   */
  it("every tracked .ts file has a tsconfig above it", () => {
    const tracked = execFileSync("git", ["ls-files", "*.ts", "*.tsx"], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);

    expect(tracked.length, "tracked TypeScript files").toBeGreaterThan(100);

    /**
     * Claimed by a project that does not sit above it.
     *
     * `vitest.config.ts` is at the repository root, where there is no
     * `tsconfig.json` — deliberately, because a root project would invite an
     * editor to treat the whole workspace as one program. `tests/tsconfig.json`
     * names it in `include` instead, so it *is* checked; the ancestor walk
     * below simply cannot see that.
     *
     * One entry, and it should stay that way: anything else appearing here is a
     * file that needs a home, not another exception.
     */
    const CLAIMED_ELSEWHERE = new Set(["vitest.config.ts"]);

    const orphans = tracked.filter((file) => {
      if (CLAIMED_ELSEWHERE.has(file)) return false;
      let dir = join(repoRoot, file, "..");
      while (dir.startsWith(repoRoot)) {
        if (existsSync(join(dir, "tsconfig.json"))) return false;
        const parent = join(dir, "..");
        if (parent === dir) break;
        dir = parent;
      }
      return true;
    });

    expect(orphans, "TypeScript in a directory no tsconfig owns").toEqual([]);
  });
});
