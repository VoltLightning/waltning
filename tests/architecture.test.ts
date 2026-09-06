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
import { dirname, join, relative } from "node:path";
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

// A static `from "…"` or bare `import "…"`, or a call form — `import(…)`
// (no required whitespace before the paren) and `require(…)` — either of
// which can carry the same harmful explicit extension the static forms can.
const IMPORT = /(?:\bfrom\s+|\bimport\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

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

/**
 * Every screen file, across every app that has one — read from disk rather
 * than hardcoded to `apps/mobile`, the same reasoning `appRoots()` states for
 * itself: `apps/web` is covered the day a screen appears there too.
 */
function screenFiles(): string[] {
  return appRoots().flatMap((app) => {
    const dir = join(app, "src");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => /-screen\.tsx$/.test(name))
      .map((name) => join(dir, name));
  });
}

/** A named import of `name` from `specifier` — spans a multi-line brace list. */
function importsNamed(text: string, name: string, specifier: string): boolean {
  const escaped = specifier.replace(/[/.]/g, "\\$&");
  return new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*["']${escaped}["']`).test(
    text,
  );
}

/** A named import of `name`, from any specifier — spans a multi-line brace list. */
function importsIdentifier(text: string, name: string): boolean {
  return new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*["'][^"']+["']`).test(text);
}

/**
 * Every name a `packages/ui/src` component exports, from a file that itself
 * imports `FlatList` or `SectionList` from `react-native` — a screen reaching
 * one of these (`RateTable`, say) owns a virtualized list exactly as much as
 * a screen importing `FlatList` itself, one layer removed. Built from disk
 * rather than named, so a new list-backed component is covered the day it
 * exists rather than the day someone remembers to add it here.
 */
function virtualizedListBearingNames(): Set<string> {
  const files = sourceFiles(join(repoRoot, "packages/ui/src")).filter(
    (file) => /\.tsx$/.test(file) && !isTest(file) && !/\.stories\.tsx$/.test(file),
  );
  const names = new Set<string>();
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const bearsList =
      importsNamed(text, "FlatList", "react-native") ||
      importsNamed(text, "SectionList", "react-native");
    if (!bearsList) continue;
    for (const match of text.matchAll(/export\s+(?:function|const|class)\s+([A-Z]\w*)/g)) {
      const name = match[1];
      if (name !== undefined) names.add(name);
    }
  }
  return names;
}

/* ── Public modules ─────────────────────────────────────────────────────── */

describe("public modules resolve directly to their owners", () => {
  it("contains no value or type re-exports", () => {
    const roots = ["apps", "packages", "tools", "tests"].map((root) => join(repoRoot, root));
    const files = roots.flatMap((root) => sourceFiles(root)).filter((file) => !isAmbient(file));
    const reExport = /\bexport\s+(?:type\s+)?(?:\*\s+as\s+\w+|\*|\{[^}]*\})\s+from\s+["']/g;
    const offenders: string[] = [];

    for (const file of files) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      if (reExport.test(code)) offenders.push(rel(file));
      reExport.lastIndex = 0;
    }

    expect(offenders, "import from the concrete owner instead of forwarding its exports").toEqual(
      [],
    );
    expect(files.length, "authored TypeScript files found").toBeGreaterThan(200);
  });
});

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

/**
 * **Why a *table's* sort lives in `packages/core`** (DESK3 round 2, ruling on
 * the core file). `packages/client` and `packages/ui` are siblings on the
 * floor — neither may import the other, which the rule above enforces from
 * `client`'s side and `design conformance` from `ui`'s — so a function both
 * of them need has exactly one legal home, and it is the package they both
 * already depend on. `packages/core/src/ledger-table.ts` is that case:
 * `useLedgerTableSort`/`useLedgerTableSelection` (client) and
 * `<LedgerTable>`'s own stories (ui) were otherwise two copies of one sort,
 * and the copy in the stories was what two visual snapshots certified while
 * looking like proof of the shipped one.
 *
 * The placement is only legal because the *vocabulary* was cut down to fit
 * `core`'s charter: rows, a field key, a direction. A column — which has a
 * header, a width and a label — stayed in `packages/ui`, and `ui` owns the
 * one-line map from its columns to those keys. Had the column type moved
 * down too, `core` would have grown an opinion about what a ledger table
 * looks like, which is the shape "no abstraction before the third use" is
 * actually warning about. The two tests below are what keep the file honest:
 * no Node builtin, and nothing but decimal.js and zod.
 */
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
   *
   * **`react-native-*` community modules count too**, and were missing for the
   * same reason: the alternation matched `react-native` exactly. A package under
   * that prefix ships a native module by convention —
   * `react-native-safe-area-context` measures the window through the platform's
   * own insets API — so it is as platform-bound as the renderer itself, and the
   * bridge that reads it belongs in an app. The rule reported that bridge as
   * shareable code; it is the opposite, and moving it to `packages/ui` would put
   * a native module in the package that must never name one.
   */
  const NAMES_PLATFORM =
    /from\s+["'](react-native(-[\w-]+)?|expo|expo-.*|@expo(-[\w-]+)?\/.*|@react-navigation\/.*)["']|Platform\.OS|__DEV__|EXPO_PUBLIC_|import\.meta\.env/;

  it("every app source file is platform-bound, a test, or a route", () => {
    const offenders: string[] = [];
    const roots = appRoots();
    expect(roots.length, "client apps found").toBeGreaterThan(0);
    for (const app of roots) {
      for (const file of sourceFiles(app)) {
        if (isTest(file) || isAmbient(file)) continue;
        // `app/` is the route tree — composition is its job by definition.
        if (/^apps\/[^/]+\/app\//.test(rel(file))) continue;
        // `src/journeys/` composes the same platform-bound screens a route
        // does (D5's `journey-harness.tsx`) — a stub router standing in for
        // `app/`'s, not a second `app/` — so it earns the same exemption
        // without needing to name a platform on its own.
        if (/^apps\/[^/]+\/src\/journeys\//.test(rel(file))) continue;
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
    //
    // **`makeStyles` is not that hook, and the exception is narrow on purpose.**
    // Both objections are about *behaviour* reaching for a dependency it did
    // not take: there is nothing in a stylesheet to point at a stub, and it
    // reads the theme from context rather than a singleton — which is the
    // property `theme/styles.ts` exists to give it. Banning it here would leave
    // a route with exactly one way to paint itself, an inline style object,
    // which is the thing §5 refuses.
    const STYLESHEET = /\bconst\s+use[A-Z]\w*\s*=\s*makeStyles\(/;
    const offenders: string[] = [];
    const routeDirs = appRoots().map((a) => join(a, "app"));
    expect(
      routeDirs.some((d) => statSync(d).isDirectory()),
      "route trees found",
    ).toBe(true);
    for (const file of routeDirs.flatMap((d) => sourceFiles(d))) {
      const text = readFileSync(file, "utf8").replace(STYLESHEET, "const styles_ = makeStyles(");
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
      "move platform variants outside app/ and import them from one universal route",
    ).toEqual([]);
  });
});

describe("GroundPanel is the page scroller", () => {
  it("screens do not import ScrollView — GroundPanel is the page scroller", () => {
    const files = screenFiles();
    expect(files.length, "screen files found").toBeGreaterThan(5);
    const offenders = files
      .filter((file) => importsNamed(readFileSync(file, "utf8"), "ScrollView", "react-native"))
      .map(rel);
    expect(
      offenders,
      'GroundPanel scrolls by default (scroll="page") — remove the screen\'s own ScrollView',
    ).toEqual([]);
  });

  it("a screen that renders a virtualized list, directly or through a component that owns one, opts GroundPanel out", () => {
    const files = screenFiles();
    expect(files.length, "screen files found").toBeGreaterThan(5);
    const bearingNames = virtualizedListBearingNames();
    expect(bearingNames.size, "components that own a FlatList/SectionList found").toBeGreaterThan(
      0,
    );
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const rendersListDirectly =
        importsNamed(text, "FlatList", "react-native") ||
        importsNamed(text, "SectionList", "react-native");
      const rendersListIndirectly = [...bearingNames].some((name) => importsIdentifier(text, name));
      const rendersList = rendersListDirectly || rendersListIndirectly;
      const optsOut = /scroll="own"/.test(text);
      if (rendersList && !optsOut) {
        offenders.push(
          `${rel(file)}: renders a virtualized list (directly or through a component) without scroll="own"`,
        );
      }
      if (optsOut && !rendersList) {
        offenders.push(`${rel(file)}: passes scroll="own" without owning a FlatList/SectionList`);
      }
    }
    expect(
      offenders,
      'a screen that owns a virtualized list — directly or through a component it renders — must pass scroll="own", and nothing else may',
    ).toEqual([]);
  });
});

describe("a card groups rows or holds a figure — never a whole screen", () => {
  /**
   * `docs/specification/design-system/05-composites.md`'s `Card` row, verbatim:
   *
   * > A card groups related rows or holds one hero figure. Titles, single
   * > fields, chip rows, hints and buttons sit on the ground. Never a whole
   * > screen, never a single control.
   *
   * A `<GroundPanel>` whose only *real* content is a single `<Card>` is a
   * screen wrapped in one big card — exactly the shape the Hearth audit found
   * on `account-editor-screen.tsx`, `counterparty-editor-screen.tsx`, the desk
   * branch of `quick-add-screen.tsx`, and `settings-currencies-screen.tsx`
   * (its pivot block, still inside the currency-list card).
   *
   * **"Only content" is read through the wrappers, not around them.** A
   * `<View>` or a fragment holding one `<Card>` renders exactly what the bare
   * `<Card>` renders, and `{loading ? <Card/> : <Card/>}` is two screens each
   * of which is one card — so the check unwraps single `View`/fragment
   * wrappers and looks inside `{cond ? … : …}` / `{cond && …}` expressions,
   * checking every branch. Without that, wrapping the offending card in a
   * `<View>` was a one-line way past the rule.
   *
   * **A screen's panel is not always in the screen's own file.** The fourth
   * evasion is not a trick at all — it is how `today-screen.tsx` is written:
   * the `<GroundPanel>` belongs to `TodayFrame` in `packages/ui`, and the
   * screen hands its content in through a prop. Reading only the screens'
   * own `<GroundPanel>` tags, the rule simply never looked at Today.
   *
   * So it is read through the frame. Every `packages/ui` component whose own
   * render is a `GroundPanel` around a `children`/`body` prop is found from
   * disk (`panelFrames()`), and the JSX a screen passes to that prop *is*
   * that panel's content — including the common shape of hoisting it as
   * `const body = (…)` and passing `body={body}`, which is followed to the
   * declaration. `today-screen.tsx` falls under the rule that way, and a
   * frame added tomorrow is covered the day it exists rather than the day
   * someone remembers it here.
   *
   * **Two evasions remain accepted, and stated rather than hidden.** This is
   * a text scan, not a type-aware parser, so a `Card` it cannot see in the
   * screen's own JSX is a `Card` it does not judge:
   *
   * 1. **A helper component that returns a `Card`** — `<AccountPanel />` in
   *    the panel, `function AccountPanel() { return <Card>…</Card>; }` below
   *    it. The panel's sole child reads as `AccountPanel`, not `Card`.
   * 2. **`React.createElement(Card, …)`** — no JSX tag exists to match.
   *
   * (The third — a hoisted `const card = <Card>…</Card>` rendered as
   * `{card}` — is gone: the same declaration-following the frame prop needed
   * closes it, so a lone `{identifier}` inside a panel is now resolved. The
   * resolved declaration re-enters as an expression, so a hoisted
   * `const body = cond ? <Card/> : <Card/>` is split into its branches and
   * each one judged, rather than read as two siblings and judged as neither.)
   *
   * **And one limitation of that resolution, in the same spirit.**
   * `jsxOfIdentifier` takes the **first** `const NAME =` in the file, with no
   * notion of scope: two declarations of the same name in different functions
   * resolve to whichever is written first, and the check then judges JSX the
   * panel never rendered — or misses JSX it did. No screen in this repository
   * declares one name twice today, and a file that starts to is the signal to
   * grow this into a scope-aware lookup rather than to trust the first hit.
   * It is the same hand-rolled-scanner trade-off `importsOf` above declares,
   * with one difference worth stating: the two evasions above are loud, and
   * this one would be quiet.
   *
   * Each is a deliberate act, not a slip: writing one of these means moving
   * the card out of the shape the rule reads in order to keep it. The
   * alternative — a real parser, or a render-time assertion in every screen
   * test — buys coverage of shapes no screen in this repository uses, at a
   * cost the same trade-off `importsOf` above already declined to pay. If a
   * screen ever legitimately reaches for one of these shapes, this list is
   * where the check has to grow.
   */
  function groundPanelBodies(text: string): string[] {
    const bodies: string[] = [];
    const re = /<GroundPanel\b[^>]*>([\s\S]*?)<\/GroundPanel>/g;
    for (const m of text.matchAll(re)) bodies.push(m[1] ?? "");
    return bodies;
  }

  /** Strip JS/JSX comments so a commented-out sibling doesn't count as one. */
  function stripComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  }

  type Child = { name: string; raw: string };

  /** The text between a non-self-closing element's own tags. */
  function innerOf(child: Child): string {
    if (child.name === FRAGMENT)
      return child.raw.slice("<>".length, child.raw.length - "</>".length);
    const open = /^<[A-Za-z][\w.]*\b[^>]*?>/.exec(child.raw);
    if (!open) return "";
    return child.raw.slice(open[0].length, child.raw.length - `</${child.name}>`.length);
  }

  const FRAGMENT = "<>";
  const EXPRESSION = "{expr}";

  /**
   * Splits `jsx` into its top-level children — a `{…}` expression (brace-depth
   * aware, so a prop's own `{}` inside it doesn't end it early), a fragment, or
   * a tag, whose matching close is found by depth-counting further tags of the
   * *same* name (a self-closing tag never nests). Not a real JSX parser — good
   * enough for the shapes this repository's screens actually use, the same
   * trade-off `importsOf` above makes for imports.
   */
  function topLevelChildren(jsx: string): Child[] {
    const src = stripComments(jsx);
    const children: Child[] = [];
    let i = 0;
    const n = src.length;
    while (i < n) {
      if (/\s/.test(src[i] ?? "")) {
        i++;
        continue;
      }
      if (src[i] === "{") {
        let depth = 1;
        let j = i + 1;
        while (j < n && depth > 0) {
          if (src[j] === "{") depth++;
          else if (src[j] === "}") depth--;
          j++;
        }
        children.push({ name: EXPRESSION, raw: src.slice(i, j) });
        i = j;
        continue;
      }
      if (src[i] === "<" && src[i + 1] === ">") {
        let depth = 1;
        let j = i + 2;
        while (j < n && depth > 0) {
          if (src.startsWith("</>", j)) {
            depth--;
            j += 3;
          } else if (src.startsWith("<>", j)) {
            depth++;
            j += 2;
          } else j++;
        }
        children.push({ name: FRAGMENT, raw: src.slice(i, j) });
        i = j;
        continue;
      }
      if (src[i] === "<") {
        const open = /^<([A-Za-z][\w.]*)\b[^>]*?(\/?)>/.exec(src.slice(i));
        if (!open) {
          i++;
          continue;
        }
        const name = open[1] ?? "";
        if (open[2] === "/") {
          children.push({ name, raw: open[0] });
          i += open[0].length;
          continue;
        }
        let depth = 1;
        const tag = new RegExp(`<\\/?${name}\\b[^>]*?(\\/?)>`, "g");
        tag.lastIndex = i + open[0].length;
        let end = -1;
        for (let m = tag.exec(src); m !== null; m = tag.exec(src)) {
          if (m[0].startsWith("</")) depth--;
          else if (m[1] !== "/") depth++;
          if (depth === 0) {
            end = tag.lastIndex;
            break;
          }
        }
        if (end < 0) end = n; // unbalanced — consume the rest rather than loop forever
        children.push({ name, raw: src.slice(i, end) });
        i = end;
        continue;
      }
      i++; // a stray text node
    }
    return children;
  }

  /** `Sheet`/`Picker`/`Dialog` suffixed components, and `Toast` — overlays, not page content. */
  const isOverlayName = (name: string) => /(?:Sheet|Picker|Dialog)$/.test(name) || name === "Toast";

  /** Every component name mentioned anywhere inside a chunk of JSX. */
  const namesIn = (raw: string) =>
    [...stripComments(raw).matchAll(/<([A-Za-z][\w.]*)/g)].map((m) => m[1] ?? "");

  /**
   * An inert `{…}` expression — an empty brace pair (all that survives a
   * stripped `{/* JSX comment *\/}`), or a `{cond ? <Toast/> : null}`-shaped
   * one referencing only overlay components.
   */
  function isOverlayExpr(raw: string): boolean {
    const inner = stripComments(raw.slice(1, -1)).trim();
    if (inner.length === 0) return true;
    const names = namesIn(inner);
    return names.length > 0 && names.every(isOverlayName);
  }

  /** Real page content — an overlay sibling (bare or conditionally rendered) doesn't count. */
  function isRealContent(child: Child): boolean {
    if (child.name === EXPRESSION) return !isOverlayExpr(child.raw);
    return !isOverlayName(child.name);
  }

  /** A bare identifier, and nothing else — `{body}`, not `{body.rows}`. */
  const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

  /**
   * The JSX a `const NAME = …;` in this file holds, so `{body}` and
   * `body={body}` are followed to what they actually render. Read to the
   * first `;` outside every bracket, which is where the declaration ends —
   * the initializer's own `(`/`{`/`[` are counted rather than searched past.
   */
  function jsxOfIdentifier(source: string, name: string): string | undefined {
    const src = stripComments(source);
    const decl = new RegExp(`\\bconst\\s+${name}\\s*=\\s*`).exec(src);
    if (!decl) return undefined;
    const from = decl.index + decl[0].length;
    let depth = 0;
    for (let i = from; i < src.length; i++) {
      const c = src[i];
      if (c === "(" || c === "{" || c === "[") depth++;
      else if (c === ")" || c === "}" || c === "]") depth--;
      else if (c === ";" && depth === 0) return src.slice(from, i);
    }
    return undefined;
  }

  /**
   * What a panel (or a wrapper inside one) can actually render, one entry per
   * branch. A `View`/fragment around exactly one thing renders that thing, a
   * conditional renders one of its branches, and a lone `{identifier}` renders
   * whatever that identifier was declared as — all three are followed through
   * rather than counted as content of their own. Anything with two or more
   * real children is a screen with siblings and yields nothing: the rule is
   * only about a panel that *is* one card.
   *
   * `source` is the file the JSX came from, and it is only ever read to
   * resolve an identifier. `seen` stops `const a = <>{a}</>` from looping.
   */
  function soleContents(
    jsx: string,
    source: string,
    seen: ReadonlySet<string> = new Set(),
  ): Child[] {
    const content = topLevelChildren(jsx).filter(isRealContent);
    const only = content.length === 1 ? content[0] : undefined;
    if (!only) return [];
    if (only.name === EXPRESSION) {
      const inner = only.raw.slice(1, -1);
      // Each JSX element at the top level of the expression is one branch of
      // a ternary or a `&&`; `{rows.map(…)}` yields its row element, which is
      // not a `Card` and so is simply not an offender.
      const branches = topLevelChildren(inner);
      if (branches.length > 0) {
        return branches.flatMap((branch) =>
          branch.name === EXPRESSION ? [] : resolve(branch, source, seen),
        );
      }
      const name = stripComments(inner).trim();
      if (!IDENTIFIER.test(name) || seen.has(name)) return [];
      const declared = jsxOfIdentifier(source, name);
      // Re-entered as an *expression*, not as a child list. A hoisted
      // `const body = cond ? <Card/> : <Card/>` is two branches of one
      // screen; read as children it is two siblings, and a panel with two
      // siblings is not an offender — so the whole chain would go unjudged
      // for the price of hoisting it. Wrapping in `{…}` sends it back
      // through the same ternary/`&&` splitter a written-out conditional
      // takes, and every branch is judged to its leaves.
      return declared === undefined
        ? []
        : soleContents(`{${declared}}`, source, new Set([...seen, name]));
    }
    return resolve(only, source, seen);
  }

  /**
   * **One hop into `packages/ui`, because a screen composes names.** A
   * `View` or a fragment around one thing renders that thing, and so does a
   * component whose own render *is* one card — `<SettingsMenu/>` is a
   * `<Card>` with another name on it, and a rule that matched the literal
   * tag stopped seeing the very screen it was written about the day that
   * name was given. `panelFrames` already performs the same hop for a
   * component that is a `GroundPanel`; this is its other half.
   *
   * `seen` carries the component name too, so a card component that renders
   * itself cannot loop.
   */
  function resolve(child: Child, source: string, seen: ReadonlySet<string>): Child[] {
    if (child.name === "View" || child.name === FRAGMENT)
      return soleContents(innerOf(child), source, seen);
    if (!seen.has(child.name)) {
      const found = uiCards().get(child.name);
      if (found !== undefined) return [found.card];
    }
    return [child];
  }

  /**
   * A loading placeholder — **every** leaf inside the card is a `Skeleton`,
   * nested only inside `View`s, including the leaves inside `{…}` expressions
   * (a `{loading ? <Skeleton/> : <Row/>}` inside the card is not a skeleton
   * mirror, and reading only the plain children would have called it one).
   * `counterparty-detail-screen.tsx`'s loading state mirrors the card its
   * populated state resolves to; the mirror is not a second design decision.
   */
  function isSkeletonCard(card: Child): boolean {
    const names = namesIn(innerOf(card));
    return (
      names.length > 0 &&
      names.includes("Skeleton") &&
      names.every((name) => name === "Skeleton" || name === "View")
    );
  }

  const sourceOf = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : "");

  /**
   * The screens a tab route renders — read from `app/(tabs)/*.tsx`, not
   * listed, so a sixth tab is covered the day it is written.
   *
   * **A tab root is not exempt from anything by being one.** It is one half
   * of the menu-card exemption (`isMenuList` below is the other), and the
   * half that says *which* screens the question is even asked about: a stack
   * screen pushed from somewhere is never a menu, whatever it renders.
   */
  function tabRootScreens(): Set<string> {
    const roots = new Set<string>();
    for (const app of appRoots()) {
      const dir = join(app, "app", "(tabs)");
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir)) {
        if (!/\.tsx$/.test(name) || name === "_layout.tsx") continue;
        for (const spec of importsOf(join(dir, name))) {
          if (!spec.startsWith(".")) continue;
          const target = join(dir, `${spec}.tsx`);
          if (existsSync(target)) roots.add(target);
        }
      }
    }
    return roots;
  }

  /**
   * The end of the tag opening at `at` — brace- and string-aware, so an
   * element nested inside a prop (`appearanceAction={<Controls … />}`) does
   * not end it at the first `>` it contains.
   */
  function openTagEnd(src: string, at: number): { end: number; selfClosing: boolean } | undefined {
    let depth = 0;
    for (let i = at + 1; i < src.length; i++) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === '"' || c === "'" || c === "`") {
        const close = src.indexOf(c, i + 1);
        if (close < 0) return undefined;
        i = close;
      } else if (c === ">" && depth === 0) {
        return { end: i + 1, selfClosing: src[i - 1] === "/" };
      }
    }
    return undefined;
  }

  /** The `{…}` a named prop is given, brace-matched rather than line-matched. */
  function propValue(tag: string, prop: string): string | undefined {
    const m = new RegExp(`\\b${prop}\\s*=\\s*\\{`).exec(tag);
    if (!m) return undefined;
    const from = m.index + m[0].length;
    let depth = 1;
    for (let i = from; i < tag.length; i++) {
      if (tag[i] === "{") depth++;
      else if (tag[i] === "}") depth--;
      if (depth === 0) return tag.slice(from, i);
    }
    return undefined;
  }

  /**
   * The prop a `GroundPanel` renders, unwrapped through `View`s and
   * fragments — `TodayFrame`'s panel holds `<View style={styles.body}>{body}
   * </View>`, so the prop is `body`. A panel holding anything else (fixed
   * content, two children) is not a frame and yields nothing.
   */
  function panelPropName(body: string): string | undefined {
    let jsx = body;
    // Bounded: each turn strips one wrapper, and no screen nests ten.
    for (let step = 0; step < 10; step++) {
      const content = topLevelChildren(jsx).filter(isRealContent);
      const only = content.length === 1 ? content[0] : undefined;
      if (!only) return undefined;
      if (only.name === EXPRESSION) {
        const name = stripComments(only.raw.slice(1, -1)).trim();
        return IDENTIFIER.test(name) ? name : undefined;
      }
      if (only.name !== "View" && only.name !== FRAGMENT) return undefined;
      jsx = innerOf(only);
    }
    return undefined;
  }

  /** The nearest `function Name(` declared above `at` — the component this JSX belongs to. */
  function enclosingComponent(source: string, at: number): string | undefined {
    let name: string | undefined;
    for (const m of source.slice(0, at).matchAll(/\bfunction\s+([A-Z][\w]*)\s*\(/g)) name = m[1];
    return name;
  }

  /**
   * Every `packages/ui` component whose own render is a `GroundPanel` around
   * a prop — the component's name to the prop that becomes the panel's
   * content. Read from disk, so a second frame is covered the day it is
   * written. Stories and tests are excluded: a story's panel is a fixture,
   * not a screen's.
   */
  function panelFrames(): Map<string, string> {
    const frames = new Map<string, string>();
    const files = sourceFiles(join(repoRoot, "packages/ui/src")).filter(
      (f) => /\.tsx$/.test(f) && !isTest(f) && !/\.stories\.tsx$/.test(f),
    );
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const body of groundPanelBodies(source)) {
        const prop = panelPropName(body);
        if (prop === undefined) continue;
        const component = enclosingComponent(source, source.indexOf(body));
        if (component !== undefined) frames.set(component, prop);
      }
    }
    return frames;
  }

  /**
   * The JSX a screen hands a frame's panel — the frame element's own
   * children when the frame renders `{children}`, otherwise the value of the
   * named prop. This is the screen's content in the frame's panel, so it is
   * read exactly as if the screen had written the `<GroundPanel>` itself.
   */
  function framedPanelBodies(source: string, frames: ReadonlyMap<string, string>): string[] {
    const src = stripComments(source);
    const bodies: string[] = [];
    for (const [component, prop] of frames) {
      const open = new RegExp(`<${component}\\b`, "g");
      for (let m = open.exec(src); m !== null; m = open.exec(src)) {
        const tag = openTagEnd(src, m.index);
        if (!tag) continue;
        if (prop === "children") {
          const close = src.indexOf(`</${component}>`, tag.end);
          if (tag.selfClosing || close < 0) continue;
          bodies.push(src.slice(tag.end, close));
          continue;
        }
        const value = propValue(src.slice(m.index, tag.end), prop);
        if (value !== undefined) bodies.push(`{${value}}`);
      }
    }
    return bodies;
  }

  /** An optional type-parameter list — `<Id extends string>`, never nested. */
  const GENERICS = "(?:<[^<>]*>)?";

  /**
   * Every `packages/ui` component that *is* a card, listed. Two components
   * is not a fact worth asserting on its own; a component *leaving* this map
   * is, because the rule then stops seeing every screen made of it — which
   * is the failure C1 was.
   */
  const UI_CARD_COMPONENTS = ["SettingsMenu", "SharedGroup"];

  /** The text inside the bracket that opens at `at`, brackets counted. */
  function balanced(src: string, at: number): string | undefined {
    const close = { "(": ")", "{": "}", "[": "]" }[src[at] ?? ""];
    if (close === undefined) return undefined;
    let depth = 0;
    for (let i = at; i < src.length; i++) {
      const c = src[i];
      if (c === "(" || c === "{" || c === "[") depth++;
      else if (c === ")" || c === "}" || c === "]") {
        depth--;
        if (depth === 0) return src.slice(at + 1, i);
      }
    }
    return undefined;
  }

  /**
   * A component's own body — **however it is declared.**
   *
   * `function Name(…) { … }`, `const Name = (…) => { … }` and
   * `const Name = (…) => (…)` are three spellings of one thing, and a scanner
   * that knew only the first decided an architecture rule by declaration
   * style. `block` says which kind of body came back: a `{…}` body holds
   * `return` statements, a concise one *is* the return.
   */
  function componentBody(
    source: string,
    component: string,
  ): { body: string; block: boolean } | undefined {
    const src = stripComments(source);
    const declared = new RegExp(
      `\\b(?:function\\s+${component}\\s*${GENERICS}\\s*\\(|const\\s+${component}\\b[^=]*=\\s*${GENERICS}\\s*\\()`,
    ).exec(src);
    if (!declared) return undefined;
    // Past the parameter list, whichever form opened it.
    const params = src.indexOf("(", declared.index + declared[0].length - 1);
    const afterParams = params < 0 ? -1 : params + (balanced(src, params)?.length ?? 0) + 2;
    if (afterParams < 0) return undefined;
    const rest = src.slice(afterParams);
    const opens = /^\s*(?::[^={]*)?(?:=>)?\s*[({]/.exec(rest);
    if (!opens) return undefined;
    const at = afterParams + opens[0].length - 1;
    const body = balanced(src, at);
    if (body === undefined) return undefined;
    return { body, block: src[at] === "{" };
  }

  /**
   * Every value a component can return, `null` included.
   *
   * **Braces opened by an arrow are skipped**, so a `return` inside a
   * `useCallback` or a `.map` callback is that callback's, not the
   * component's. Reading them all was how a scanner came to depend on
   * whether a branch happened to wrap its JSX in parentheses.
   */
  function componentReturns(body: string): string[] {
    const returns: string[] = [];
    const stack: boolean[] = [];
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (c === "{") stack.push(/=>\s*$/.test(body.slice(Math.max(0, i - 40), i)));
      else if (c === "}") stack.pop();
      else if (body.startsWith("return", i) && !/[\w$]/.test(body[i - 1] ?? " ")) {
        if (stack.some(Boolean)) continue;
        const from = i + "return".length;
        let depth = 0;
        let end = body.length;
        for (let j = from; j < body.length; j++) {
          const d = body[j];
          if (d === "(" || d === "{" || d === "[") depth++;
          else if (d === ")" || d === "}" || d === "]") {
            if (depth === 0) {
              end = j;
              break;
            }
            depth--;
          } else if (
            (d === ";" || d === "\n") &&
            depth === 0 &&
            body.slice(from, j).trim() !== ""
          ) {
            end = j;
            break;
          }
        }
        returns.push(body.slice(from, end).trim());
        i = end;
      }
    }
    return returns;
  }

  /**
   * The `Card` a `packages/ui` component's own render *is*, if it is one.
   *
   * **Every branch that renders anything, and `null` does not count against
   * it.** A component that renders one card and otherwise nothing —
   * `SharedGroup`'s `if (accounts.length === 0) return null` — is a card; one
   * that renders a card on one path and a `View` on another is not, because a
   * screen made of it is not always one card. The old version read only
   * `return (`, so the same early branch was disqualifying or invisible
   * depending on whether it used parentheses.
   */
  function rootCard(source: string, component: string): Child | undefined {
    const found = componentBody(source, component);
    if (found === undefined) return undefined;
    const returns = found.block ? componentReturns(found.body) : [found.body];
    let card: Child | undefined;
    for (const expression of returns) {
      if (expression === "null" || expression === "undefined" || expression === "") continue;
      const only = soleContents(`{${expression}}`, source);
      if (only.length !== 1 || only[0]?.name !== "Card") return undefined;
      card = only[0];
    }
    return card;
  }

  /** A `packages/ui` component, before anything has been resolved about it. */
  type CardCandidate = { name: string; source: string };

  /**
   * A component that *is* a card, and the file it was written in — the
   * second half matters because the rows it maps are declared there, and
   * whether they navigate is the question the exemption turns on.
   */
  type CardComponent = { card: Child; source: string };

  /** Every exported component in `packages/ui`, in no meaningful order. */
  function cardCandidates(): CardCandidate[] {
    const candidates: CardCandidate[] = [];
    const files = sourceFiles(join(repoRoot, "packages/ui/src")).filter(
      (f) => /\.tsx$/.test(f) && !isTest(f) && !/\.stories\.tsx$/.test(f),
    );
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const declarations = stripComments(source).matchAll(
        new RegExp(
          `\\bexport\\s+(?:function\\s+([A-Z][\\w]*)|const\\s+([A-Z][\\w]*)\\b[^=\\n]*=\\s*${GENERICS}\\s*\\()`,
          "g",
        ),
      );
      for (const m of declarations) {
        const name = m[1] ?? m[2];
        if (name !== undefined) candidates.push({ name, source });
      }
    }
    return candidates;
  }

  /**
   * The components that *are* a card, resolved to a **fixed point**.
   *
   * A card component may be written in terms of another one, so the answer
   * for one depends on the answer for the next — and a single pass gave a
   * different answer depending on which file `readdirSync` happened to list
   * first. Renaming a file is not a behavioural change and must not flip an
   * architecture rule, so the map is grown until it stops growing: every
   * candidate is retried against everything learned in the previous round,
   * and the result is the same whatever order the disk hands them over in.
   */
  function cardMapOf(candidates: readonly CardCandidate[]): Map<string, CardComponent> {
    const cards = new Map<string, CardComponent>();
    const previous = UI_CARDS;
    UI_CARDS = cards;
    try {
      for (let round = 0; round <= candidates.length; round++) {
        const before = cards.size;
        for (const { name, source } of candidates) {
          if (cards.has(name)) continue;
          const card = rootCard(source, name);
          if (card !== undefined) cards.set(name, { card, source });
        }
        if (cards.size === before) break;
      }
    } finally {
      UI_CARDS = previous;
    }
    return cards;
  }

  /**
   * The card components, built **whole** before anyone looks one up — the
   * map `resolve` consults while it is being built is the previous round's,
   * never a half-filled one.
   */
  let UI_CARDS: Map<string, CardComponent> | undefined;
  let UI_CARDS_BUILT: Map<string, CardComponent> | undefined;

  function uiCards(): Map<string, CardComponent> {
    if (UI_CARDS !== undefined) return UI_CARDS;
    UI_CARDS_BUILT ??= cardMapOf(cardCandidates());
    return UI_CARDS_BUILT;
  }

  /** A `const NAME = …`, type annotation and all, up to the `;` that ends it. */
  function declarationOf(source: string, name: string): string | undefined {
    const src = stripComments(source);
    const decl = new RegExp(`\\bconst\\s+${name}\\b\\s*(?::[^=]*)?=\\s*`).exec(src);
    if (!decl) return undefined;
    const from = decl.index + decl[0].length;
    let depth = 0;
    for (let i = from; i < src.length; i++) {
      const c = src[i];
      if (c === "(" || c === "{" || c === "[") depth++;
      else if (c === ")" || c === "}" || c === "]") depth--;
      else if (c === ";" && depth === 0) return src.slice(from, i);
    }
    return src.slice(from);
  }

  /**
   * How many entries a named collection holds, followed to the array literal
   * that declares them — through one `.map()` if the name is a projection of
   * another list, which is how a screen turns its own table of destinations
   * into the rows a menu renders.
   *
   * `undefined` where it cannot be answered. A count nobody can read is not
   * a count of two, and the exemption below is granted on the answer, never
   * on the absence of one.
   */
  function listLength(
    source: string,
    name: string,
    seen: ReadonlySet<string> = new Set(),
  ): number | undefined {
    if (seen.has(name)) return undefined;
    const decl = declarationOf(source, name);
    if (decl === undefined) return undefined;
    const open = decl.indexOf("[");
    if (open >= 0 && !/[({[]/.test(decl.slice(0, open))) {
      const inner = balanced(decl, open);
      if (inner === undefined) return undefined;
      return topLevelCommas(inner) + (inner.trim() === "" ? 0 : 1);
    }
    const mapped = /\b([A-Za-z_$][\w$]*)\s*\.map\s*\(/.exec(decl);
    return mapped ? listLength(source, mapped[1] ?? "", new Set([...seen, name])) : undefined;
  }

  /** Commas at bracket depth zero — how many separators an array literal has. */
  function topLevelCommas(inner: string): number {
    let depth = 0;
    let count = 0;
    for (const c of inner) {
      if (c === "(" || c === "{" || c === "[") depth++;
      else if (c === ")" || c === "}" || c === "]") depth--;
      else if (c === "," && depth === 0) count++;
    }
    return count;
  }

  /** The opening tag of the first `<Component …>` in `source`. */
  function tagOf(source: string, component: string): string | undefined {
    const src = stripComments(source);
    const m = new RegExp(`<${component}\\b`).exec(src);
    if (!m) return undefined;
    const end = openTagEnd(src, m.index);
    return end === undefined ? undefined : src.slice(m.index, end.end);
  }

  /**
   * How many rows a card holds as a **menu list**, or `undefined` where it is
   * not one.
   *
   * Two shapes are a menu: sibling rows written out, and one collection
   * mapped to a row apiece. The second is the one a named component uses, and
   * the collection is the *screen's* — the component maps a prop — so the
   * count is resolved in the screen's own source, where the destinations are
   * declared. Anything else in the card, or a title on it, is not a menu.
   */
  function menuRowCount(screenSource: string, card: Child): number | undefined {
    const open = openTagEnd(card.raw, 0);
    // Brace-aware, so an element inside a prop (`action={<Controls/>}`) does
    // not end the tag early and hide a `title` written after it.
    if (/\b(?:title|tag|action)\s*=/.test(card.raw.slice(0, open?.end ?? 0))) return undefined;

    const children = topLevelChildren(unwrap(innerOf(card))).filter(isRealContent);
    // Written out: every child is a control that goes somewhere.
    if (children.length > 1 && children.every((child) => navigates(screenSource, child)))
      return children.length;

    const only = children.length === 1 ? children[0] : undefined;
    if (only === undefined || only.name !== EXPRESSION) return undefined;
    const mapped = /\b([A-Za-z_$][\w$]*)\s*\.map\s*\(/.exec(stripComments(only.raw));
    if (!mapped) return undefined;

    const component = [...uiCards()].find(([, c]) => c.card.raw === card.raw)?.[0];
    const owner = component === undefined ? screenSource : (uiCards().get(component)?.source ?? "");
    // **What the collection is mapped *to*.** Seven `Text`s in a card are
    // seven rows and no destinations, and §5.1 grants the exemption to a
    // list of destinations — so the row itself has to be something that
    // navigates, resolved in the file that writes it.
    const row = topLevelChildren(only.raw.slice(1, -1)).find((child) => child.name !== EXPRESSION);
    if (row === undefined || !navigates(owner, row)) return undefined;

    // The rows are written here and counted there: the mapped name is the
    // component's own prop, and its value is whatever the screen passed.
    if (component === undefined) return listLength(screenSource, mapped[1] ?? "");
    const value = propValue(tagOf(screenSource, component) ?? "", mapped[1] ?? "");
    return value === undefined ? undefined : listLength(screenSource, value.trim());
  }

  /**
   * Whether an element is a row that goes somewhere — a control with a press
   * handler, or a component whose own render is one.
   *
   * This is the clause that keeps the exemption to the sentence
   * `design-system/05` §5.1 actually grants: *a list of destinations*. A
   * mapped `<Text>` is a list of words, and a whole tab root made of one
   * used to take the exemption and pass.
   */
  function navigates(source: string, element: Child): boolean {
    if (element.name === "Button" || element.name === "Pressable")
      return /\bonPress\s*=/.test(element.raw);
    const found = componentBody(source, element.name);
    if (found === undefined) return false;
    return /<(?:Button|Pressable|IconButton)\b[^>]*\bonPress\s*=/.test(found.body);
  }

  /** Views and fragments around a card's contents are not contents. */
  function unwrap(jsx: string): string {
    let inner = jsx;
    for (let step = 0; step < 10; step++) {
      const content = topLevelChildren(inner).filter(isRealContent);
      const only = content.length === 1 ? content[0] : undefined;
      if (!only || (only.name !== "View" && only.name !== FRAGMENT)) return inner;
      inner = innerOf(only);
    }
    return inner;
  }

  /**
   * **§5.1's one exemption, re-keyed to what actually earns it.** A card
   * groups rows, and a tab root's menu is rows: four destinations, a label
   * and a chevron each, is the thing a card is for. Two or more of them,
   * because one row in a card is a single control, which is the shape the
   * rule refuses everywhere else.
   *
   * It used to be keyed to the tab group having no navigation header, on the
   * grounds that the card's title was then the only place the screen's name
   * could render. The shell draws that name, so the premise was gone and the
   * key with it — and a card that holds a title is now the shape that spends
   * the exemption rather than the one that earns it.
   */
  function isMenuList(screenSource: string, card: Child): boolean {
    return (menuRowCount(screenSource, card) ?? 0) >= 2;
  }

  it("no screen's GroundPanel wraps the whole screen in one Card", () => {
    const files = screenFiles();
    expect(files.length, "screen files found").toBeGreaterThan(5);
    const tabRoots = tabRootScreens();
    const frames = panelFrames();
    expect(frames.size, "packages/ui frames that hold a screen's panel found").toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const body of [...groundPanelBodies(text), ...framedPanelBodies(text, frames)]) {
        const only = soleContents(body, text).find(
          (child) =>
            child.name === "Card" &&
            !isSkeletonCard(child) &&
            !(tabRoots.has(file) && isMenuList(text, child)),
        );
        if (only) {
          offenders.push(rel(file));
          break;
        }
      }
    }
    expect(
      offenders,
      "A card groups related rows or holds one hero figure. Titles, single fields, chip rows, hints and buttons sit on the ground. Never a whole screen, never a single control. (`design-system/05` §5.1 — drop the wrapping Card and render its content on the ground.)",
    ).toEqual([]);
  });

  /**
   * **Broken once, on both evasions of the first version.** That check counted
   * a `GroundPanel`'s immediate children, so a `<View>` around the offending
   * card, or a ternary choosing between two of them, passed while rendering
   * exactly the banned screen. Each shape below is the real
   * `account-editor-screen.tsx` offender, wrapped.
   */
  it("catches a Card hidden behind a View wrapper and behind a conditional", () => {
    const wrapped = `<GroundPanel>
      <View style={styles.root}>
        <Card title="Account"><AccountEditor /></Card>
      </View>
    </GroundPanel>`;
    const ternary = `<GroundPanel>
      {loaded ? <Card><AccountEditor /></Card> : <Card><Skeleton shape="row" label="" /><Row /></Card>}
    </GroundPanel>`;
    const fine = `<GroundPanel>
      <View style={styles.root}>
        <Card title="Recent"><Rows /></Card>
        <Button label="Show all" onPress={handleShowAll} />
      </View>
    </GroundPanel>`;
    const skeletonMirror = `<GroundPanel>
      <Card><View><Skeleton shape="row" label="" /></View>{rows.map(() => <Skeleton shape="row" label="" />)}</Card>
    </GroundPanel>`;

    const soleCards = (source: string) =>
      groundPanelBodies(source)
        .flatMap((body) => soleContents(body, source))
        .filter((child) => child.name === "Card" && !isSkeletonCard(child));

    expect(soleCards(wrapped)).toHaveLength(1);
    expect(soleCards(ternary)).toHaveLength(2);
    expect(soleCards(fine)).toHaveLength(0);
    expect(soleCards(skeletonMirror)).toHaveLength(0);
  });

  /**
   * **Broken once on the fourth evasion**, which is not a trick but the way
   * `today-screen.tsx` is built: the panel is `TodayFrame`'s, in
   * `packages/ui`, and the screen hands it a hoisted `const body`. Before
   * this, the screen had no `<GroundPanel>` of its own and so was never
   * looked at — the same offending shape, invisible for the price of a
   * frame. The frame below is `TodayFrame`'s own render, so the discovery is
   * exercised rather than assumed.
   */
  it("reads a screen's panel through a packages/ui frame, and through the const it hoists", () => {
    const frame = `export function TodayFrame({ total, body }: TodayFrameProps) {
      return (
        <View style={styles.root}>
          <Shell hero={total} />
          <GroundPanel>
            <View style={styles.body}>{body}</View>
          </GroundPanel>
        </View>
      );
    }`;
    const frames = new Map(
      groundPanelBodies(frame).flatMap((panel) => {
        const prop = panelPropName(panel);
        const component = enclosingComponent(frame, frame.indexOf(panel));
        return prop !== undefined && component !== undefined ? [[component, prop] as const] : [];
      }),
    );
    expect([...frames]).toEqual([["TodayFrame", "body"]]);

    const offending = `const body = (
      <Card title="Recent"><Rows /></Card>
    );
    return <TodayFrame total={hero} body={body} />;`;
    const fine = `const body = (
      <>
        <Card title="Recent"><Rows /></Card>
        <Button label="Show all" onPress={handleShowAll} />
      </>
    );
    return <TodayFrame total={hero} body={body} />;`;

    const soleCards = (screen: string) =>
      framedPanelBodies(screen, frames)
        .flatMap((panel) => soleContents(panel, screen))
        .filter((child) => child.name === "Card" && !isSkeletonCard(child));

    // **Broken once on the hoisted conditional.** `today-screen.tsx`'s own
    // `ledgerBody` is a chain of them, and reading the declaration as a child
    // list made it two siblings — a shape the rule ignores — so the whole
    // chain went unjudged. Each branch is now followed to its leaves: two
    // cards, two offences; a branch with a sibling, none.
    const hoistedTernary = `const body = loaded ? (
      <Card title="Recent"><Rows /></Card>
    ) : (
      <Card title="Recent"><Placeholder /></Card>
    );
    return <TodayFrame total={hero} body={body} />;`;
    const hoistedChain = `const body = failed ? (
      <ErrorState />
    ) : loaded ? (
      <Card title="Recent"><Rows /></Card>
    ) : (
      <>
        <Card title="Recent"><Rows /></Card>
        <Button label="Show all" onPress={handleShowAll} />
      </>
    );
    return <TodayFrame total={hero} body={body} />;`;

    expect(soleCards(offending)).toHaveLength(1);
    expect(soleCards(fine)).toHaveLength(0);
    expect(soleCards(hoistedTernary)).toHaveLength(2);
    expect(soleCards(hoistedChain)).toHaveLength(1);
    // A frame whose panel holds fixed content is not a frame — `StartupFailed`
    // renders its own `ErrorState`, and nothing of a screen's goes through it.
    expect(panelPropName("<View style={styles.center}><ErrorState /></View>")).toBeUndefined();
  });

  /**
   * **The exemption, exercised against the screen that has it.** The old
   * version of this test read a layout file's `headerShown` option and three
   * synthetic strings, and by the end it protected a shape that existed
   * nowhere: the premise was "a tab root has no header to carry its name",
   * the shell grew one, and the rows stopped being `Button`s. So this reads
   * the real `settings-screen.tsx`, resolves its panel to the card that is
   * actually rendered — through `SettingsMenu`, which is where the card now
   * lives — and breaks it once in each of the three ways the exemption can
   * be lost.
   */
  it("grants the menu exemption to the real Settings screen, and to nothing else it renders", () => {
    const screen = appRoots()
      .map((app) => join(app, "src", "settings-screen.tsx"))
      .find((file) => existsSync(file));
    expect(screen, "a Settings screen exists").toBeDefined();
    if (screen === undefined) return;
    const text = readFileSync(screen, "utf8");
    expect(tabRootScreens().has(screen), "the Settings screen is a tab root").toBe(true);

    // The hop C1 is about: the panel's sole content is `<SettingsMenu/>`,
    // and what it renders is a `Card`. Before `resolve` followed a named
    // component into `packages/ui`, this was zero — the rule looking
    // straight at its own subject and seeing nothing.
    const cards = groundPanelBodies(text)
      .flatMap((body) => soleContents(body, text))
      .filter((child) => child.name === "Card");
    expect(cards, "the Settings tab's panel resolves to exactly one Card").toHaveLength(1);
    const card = cards[0];
    if (card === undefined) return;

    // Four destinations, counted where they are declared — in the screen,
    // not in the component that renders them.
    expect(menuRowCount(text, card)).toBeGreaterThanOrEqual(2);

    /**
     * The rule's own expression, not a paraphrase of it — the same three
     * clauses the offender loop above composes. Every break below is checked
     * through this, so what is proven is that the *rule* fires, not that a
     * predicate flipped.
     */
    const flagged = (source: string, candidate: Child) =>
      candidate.name === "Card" && !isSkeletonCard(candidate) && !isMenuList(source, candidate);
    expect(flagged(text, card), "the real screen keeps its exemption").toBe(false);

    // 1 — one destination left. A card holding a single control is the shape
    // the rule refuses everywhere else, and a menu of one is that.
    const oneRow = text.replace(/(ORDER[^=]*=\s*\[)[\s\S]*?\]/, '$1"accounts"]');
    expect(oneRow, "the cut rewrote the list").not.toBe(text);
    expect(menuRowCount(oneRow, card)).toBe(1);
    expect(flagged(oneRow, card), "a menu of one is an ordinary sole card").toBe(true);

    // 2 — the card grows a title. The tab shell draws the screen's name, so
    // a title here is that name twice, and the exemption is spent.
    const menu = join(repoRoot, "packages/ui/src/settings/settings-menu.tsx");
    const menuText = sourceOf(menu);
    expect(menuText, "the menu component exists").not.toBe("");
    const titled = rootCard(menuText.replace("<Card>", "<Card title={title}>"), "SettingsMenu");
    expect(titled, "the mutation still renders a card").toBeDefined();
    if (titled !== undefined) expect(flagged(text, titled)).toBe(true);

    // 3 — the rows stop being a list. One written-out control in the card is
    // not a menu, whatever the screen still passes it.
    const single = rootCard(
      menuText.replace(/<View style={styles.list}>[\s\S]*?<\/View>/, "<Button label={label} />"),
      "SettingsMenu",
    );
    expect(single, "the mutation still renders a card").toBeDefined();
    if (single !== undefined) expect(flagged(text, single)).toBe(true);

    /**
     * 4 — **rows that go nowhere.** §5.1 grants the exemption to *a list of
     * destinations*, and a mapped collection is not one by being mapped: a
     * tab root whose whole content is a card of seven `Text`s is the shape
     * the rule was written to refuse, and an earlier version of this
     * exemption let exactly that through — any of the five tab roots could
     * have become a card of arbitrary mapped content with the suite green.
     */
    const textRows = `const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
      export default function CalendarStub() {
        const t = useT();
        return (
          <GroundPanel>
            <Card>
              {DAYS.map((day) => (
                <Text key={day}>{t("routes.calendar")}</Text>
              ))}
            </Card>
          </GroundPanel>
        );
      }`;
    const textCard = groundPanelBodies(textRows)
      .flatMap((body) => soleContents(body, textRows))
      .filter((child) => child.name === "Card")[0];
    expect(textCard, "the probe renders one card").toBeDefined();
    if (textCard !== undefined) {
      expect(menuRowCount(textRows, textCard)).toBeUndefined();
      expect(flagged(textRows, textCard), "seven words are not seven destinations").toBe(true);
    }

    // And the shape that *is* a list of destinations written out, rather
    // than mapped, keeps it — the exemption's original wording.
    const buttons = `export default function Menu() {
        return (
          <GroundPanel>
            <Card>
              <Button label="Accounts" onPress={handleAccounts} />
              <Button label="Categories" onPress={handleCategories} />
            </Card>
          </GroundPanel>
        );
      }`;
    const buttonCard = groundPanelBodies(buttons)
      .flatMap((body) => soleContents(body, buttons))
      .filter((child) => child.name === "Card")[0];
    expect(buttonCard).toBeDefined();
    if (buttonCard !== undefined) expect(flagged(buttons, buttonCard)).toBe(false);
  });

  /**
   * **The scanner's four blind spots, each broken once.** Every one of them
   * decided the card rule's verdict on something that is not a behavioural
   * difference — how a branch spelled its return, which keyword declared the
   * component, what else the file exported, and what the file was called.
   */
  it("reads a card component whatever its shape, and whatever the disk's order", () => {
    const card = (source: string, name: string) => rootCard(source, name)?.name;

    // 1 — the spelling of a return. `SharedGroup`'s own `return null` is the
    // real instance: a component that renders one card and otherwise nothing
    // is a card, and the parentheses around the other branch are not a fact
    // about it.
    expect(
      card(`export function A() { if (x) return null; return (<Card><Row /></Card>); }`, "A"),
    ).toBe("Card");
    expect(card(`export function A() { return <Card><Row /></Card>; }`, "A")).toBe("Card");
    expect(
      card(
        `export function A() { if (x) { return (<View />); } return (<Card><Row /></Card>); }`,
        "A",
      ),
      "a branch that renders something else is not a card",
    ).toBeUndefined();
    expect(
      card(`export function A() { if (x) return <View />; return <Card><Row /></Card>; }`, "A"),
      "and the same branch without parentheses is still not a card",
    ).toBeUndefined();
    // A `return` inside a callback is the callback's, not the component's.
    expect(
      card(
        `export function A() { const f = useCallback(() => { return 1; }, []); return (<Card><Row /></Card>); }`,
        "A",
      ),
    ).toBe("Card");
    // The one this test exists to keep honest: the repo's own early-return card.
    expect(
      rootCard(
        sourceOf(join(repoRoot, "packages/ui/src/accounts/shared-group.tsx")),
        "SharedGroup",
      ),
    ).toBeDefined();

    // 2 — the declaration keyword.
    expect(card(`export const A = () => (<Card><Row /></Card>);`, "A")).toBe("Card");
    expect(card(`export const A = () => { return (<Card><Row /></Card>); };`, "A")).toBe("Card");

    // 3 — what else the file exports. The body ends at its own brace, not at
    // the next `function` keyword, so a second component's return is not read
    // as one of the first's.
    expect(
      card(
        `export function A() { return (<Card><Row /></Card>); }
         export function B() { return (<Text />); }`,
        "A",
      ),
    ).toBe("Card");

    // 4 — the order the disk lists the files in. A card component written in
    // terms of another one resolves the same either way; renaming a file is
    // not a behavioural change.
    const inner = {
      name: "Inner",
      source: `export function Inner() { return (<Card><Row /></Card>); }`,
    };
    const outer = { name: "Outer", source: `export function Outer() { return (<Inner />); }` };
    expect([...cardMapOf([inner, outer]).keys()].sort()).toEqual(["Inner", "Outer"]);
    expect([...cardMapOf([outer, inner]).keys()].sort()).toEqual(["Inner", "Outer"]);

    // 5 — and the map is asserted whole, so a component dropping out of it
    // is a red test rather than a rule quietly seeing less.
    expect([...uiCards().keys()].sort()).toEqual(UI_CARD_COMPONENTS);
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

  /**
   * Widened past `.tsx`, to the exact condition that makes an extension
   * harmful: a relative specifier whose extension-stripped target has a
   * `.native.*` or `.web.*` sibling on disk. `phone-ledger.native.ts` and
   * `phone-ledger.web.ts` both imported `"./platform.ts"` — an explicit `.ts`
   * this time, not `.tsx` — which Metro resolves to the *universal*
   * `platform.ts` rather than the platform file, so the ledger wired
   * `setLivePivotReader` into a second module instance the layout never
   * reads from (§C's brief). Proven to fire first: breaking it against
   * `"./platform.ts"` turned this test red before the import was fixed.
   */
  it("no relative import carries an extension when its target has a platform sibling", () => {
    // Every app, read from disk (`appRoots()`, above) rather than
    // `apps/mobile` alone — `apps/web` is covered the day it exists, with
    // nothing here to update — plus `packages/ui/src`, the one package that
    // ships platform variants.
    const roots = [...appRoots(), join(repoRoot, "packages/ui/src")];
    const PLATFORM_SUFFIXES = [".native.ts", ".native.tsx", ".web.ts", ".web.tsx"];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of sourceFiles(root)) {
        const dir = dirname(file);
        for (const spec of importsOf(file)) {
          if (!spec.startsWith(".")) continue;
          const match = /\.(ts|tsx)$/.exec(spec);
          if (!match) continue;
          const target = join(dir, spec.slice(0, -match[0].length));
          const hasPlatformSibling = PLATFORM_SUFFIXES.some((suffix) =>
            existsSync(`${target}${suffix}`),
          );
          if (hasPlatformSibling) offenders.push(`${rel(file)} → ${spec}`);
        }
      }
    }
    expect(
      offenders,
      "an explicit extension resolves the universal file, not the platform one — Metro then wires two module instances",
    ).toEqual([]);
  });

  // `default`/`async`/`abstract`/`declare` are all optional modifiers on
  // the same handful of declaration kinds, `enum` is one more kind.
  const EXPORT_DECL =
    /^export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(?:const|let|var|function|class|type|interface|enum)\s+([A-Za-z0-9_]+)/gm;
  // A bare `export default …` (anonymous function/class, or an expression)
  // has no declared name for `EXPORT_DECL` to capture, but the *presence*
  // of a default export is exactly the property that has to match between a
  // variant and its universal file — so it contributes a fixed token rather
  // than nothing. No `g`: this is used with `.test()`, and a global regex's
  // `lastIndex` survives across calls on the *same* instance — which this
  // is, called once per file, many files per run. With `g` a variant's
  // `export default` sitting after wherever the previous file's scan ended
  // reads as absent, and reversed a real gap between two files can read as
  // present; the "guards the guard" test below pins exactly that failure
  // mode.
  const EXPORT_DEFAULT = /^export\s+default\b/m;
  // `type` is optional before the brace list, so `export type { A }` is a
  // list export like any other, not a declaration `EXPORT_DECL` would see.
  // `\s*` before the brace, not `\s+`: `export{ A }` needs no space either.
  const EXPORT_LIST = /^export\s*(?:type\s+)?\{([^}]*)\}/gm;
  const EXPORT_STAR = /^export\s*\*\s*from\s/m;

  function namesFromText(rawText: string): { names: Set<string>; barrel: boolean } {
    const text = rawText.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const names = new Set<string>();
    for (const m of text.matchAll(EXPORT_DECL)) {
      if (m[1]) names.add(m[1]);
    }
    if (EXPORT_DEFAULT.test(text)) names.add("default");
    for (const m of text.matchAll(EXPORT_LIST)) {
      for (const entry of (m[1] ?? "").split(",")) {
        const name = entry
          .trim()
          .split(/\s+as\s+/)
          .pop()
          ?.trim();
        if (name) names.add(name);
      }
    }
    return { names, barrel: EXPORT_STAR.test(text) };
  }

  function exportedNamesOf(path: string): { names: Set<string>; barrel: boolean } {
    return namesFromText(readFileSync(path, "utf8"));
  }

  /**
   * Guards the guard, the same shape `docs-consistency.test.ts` uses for its
   * own citation parser: a detector that only ever ran against one file per
   * process could hide a `lastIndex` leak forever. A `g`-flagged regex used
   * with `.test()` resumes its *next* call from wherever the *previous* one
   * matched — so a long source with `export default` far in reads first,
   * pushing `lastIndex` well past the end of a short source scanned right
   * after, whose own `export default` sits at offset zero. With `g` the
   * second call finds nothing (`lastIndex` starts beyond the whole string) —
   * exactly the false "no default export" this test would otherwise hide
   * forever, on the very `EXPORT_DEFAULT` instance the real test below
   * shares across every file it scans.
   */
  it("the default-export detector does not leak state across files", () => {
    const longWithDefaultFarIn = `${"const line = 1;\n".repeat(40)}export default function Foo() {}\n`;
    const shortWithDefaultAtStart = "export default function Bar() {}\n";

    expect(namesFromText(longWithDefaultFarIn).names.has("default")).toBe(true);
    expect(namesFromText(shortWithDefaultAtStart).names.has("default")).toBe(true);
  });

  /**
   * The test that would have caught #109: `platform.native.ts` was missing
   * `setLivePivotReader`, `setLivePivotSubscriber` and `displayCurrency` —
   * `platform.ts` had all three, and nothing compared the two files' exports.
   */
  it("every platform variant exports the same names as its universal file", () => {
    // Every app plus `packages/ui/src` — the same roots the platform-sibling
    // rule above uses, for the same reason: `apps/web` is covered the day it
    // exists, with nothing here to update.
    const roots = [...appRoots(), join(repoRoot, "packages/ui/src")];
    const problems: string[] = [];
    let pairsChecked = 0;
    for (const root of roots) {
      for (const file of sourceFiles(root)) {
        const match = /^(.*)\.(?:native|web)\.(ts|tsx)$/.exec(file);
        if (!match) continue;
        const [, base, ext] = match;
        const universal = `${base}.${ext}`;
        if (!existsSync(universal)) continue;
        pairsChecked += 1;

        const variant = exportedNamesOf(file);
        const head = exportedNamesOf(universal);
        // A `*` re-export cannot be resolved into names at all, and it is
        // already banned repo-wide ("public modules resolve directly to
        // their owners", above) — its presence in a platform-variant pair is
        // flagged outright rather than left to fall out of a name diff that
        // could not see it either way.
        if (variant.barrel) problems.push(`${rel(file)}: "export * from" — barrels are forbidden`);
        if (head.barrel)
          problems.push(`${rel(universal)}: "export * from" — barrels are forbidden`);

        const missing = [...head.names].filter((name) => !variant.names.has(name));
        const extra = [...variant.names].filter((name) => !head.names.has(name));
        if (missing.length > 0 || extra.length > 0) {
          problems.push(
            `${rel(file)} vs ${rel(universal)}: missing [${missing.join(", ")}], extra [${extra.join(", ")}]`,
          );
        }
      }
    }

    expect(pairsChecked, "at least one platform-variant pair found").toBeGreaterThan(0);
    expect(problems, "a platform variant's exports must match its universal file's").toEqual([]);
  });
});

/* ── §4b · Motion and gestures ───────────────────────────────────────────── */

describe("motion is Reanimated and gestures are gesture-handler", () => {
  /**
   * `architecture/11`: React Native's own `Animated` and `PanResponder` run on
   * the JS thread, so a list rendering makes a drag lag the finger and a
   * press feel late. Reanimated's shared values and gesture-handler's
   * worklets run on the UI thread, and the decision is that *everything*
   * that moves uses them — two animation vocabularies in one package is how
   * the second one arrives one file at a time. `Easing` is in the list
   * because it is `Animated`'s, and Reanimated has its own.
   */
  it("nothing imports Animated, PanResponder or Easing from react-native", () => {
    const BANNED = new Set(["Animated", "PanResponder", "Easing"]);
    const roots = ["packages/ui/src", "packages/client/src", "apps/mobile"];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of sourceFiles(join(repoRoot, root))) {
        const text = readFileSync(file, "utf8");
        for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"react-native"/g)) {
          const names = (m[1] ?? "").split(",").map((n) => n.trim().split(/\s+as\s+/)[0] ?? "");
          for (const name of names) {
            if (BANNED.has(name)) offenders.push(`${rel(file)} imports ${name} from react-native`);
          }
        }
      }
    }
    expect(offenders, "use react-native-reanimated / react-native-gesture-handler").toEqual([]);
  });

  /**
   * `architecture/11` §8b: `setInterval` is not motion — nothing tweens, no
   * frame is interpolated, a string just steps to its next value on a beat.
   * `ThinkingIndicator`'s dot is the one place this repository decided a
   * timer earns its keep over a Reanimated clock, precisely because the thing
   * being driven is discrete text, not a rendered position or opacity. An
   * allowlist by path, not a ban, so a second `setInterval` is a decision
   * made here — in the open — rather than a precedent that spread because the
   * first one compiled.
   */
  it("setInterval appears in packages/ui/src only in thinking-indicator.tsx", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(repoRoot, "packages/ui/src"))) {
      if (file.endsWith(join("states", "thinking-indicator.tsx"))) continue;
      if (/\bsetInterval\s*\(/.test(readFileSync(file, "utf8"))) {
        offenders.push(rel(file));
      }
    }
    expect(
      offenders,
      "setInterval is reserved for thinking-indicator.tsx — use Reanimated",
    ).toEqual([]);
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
    /**
     * `journeys` — D5's acceptance tests, which cross screens (`Today`,
     * `Quick add`) and belong to none of them, the same reason this file
     * itself does not fold into any single `describe`.
     */
    "apps/mobile/src": ["journeys"],
    "packages/core/src": ["brands", "capture", "registry"],
    // Foundation (`transport`, `query`) plus one folder per domain.
    "packages/client/src": [
      "accounts",
      "appearance",
      "connectivity",
      "counterparties",
      "currencies",
      "device",
      "ledger",
      "query",
      "transactions",
      "transport",
    ],
    // Foundation (`primitives`, `fx`, `theme`, `i18n`) plus one folder per
    // domain that has components — a folder arrives with the first component
    // that belongs to it and never before, which is why this list is shorter
    // than the screen catalogue. `counterparties` arrived with `SettleSheet`
    // (S14); `settings` with `SettingsMenu`, the tab root's own list of
    // destinations, which is furniture for a surface rather than a concept
    // in the ledger and files under the surface it belongs to. `i18n` is
    // foundation by the same property as `fx`: a language is not a domain,
    // and every domain needs one.
    "packages/ui/src": [
      "accounts",
      "categories",
      "counterparties",
      "dashboard",
      "fx",
      "i18n",
      "primitives",
      "review",
      "settings",
      "shell",
      "states",
      "theme",
      "transactions",
    ],
    "packages/db/src": ["figures", "fx", "invariants", "seed", "test"],
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
    "packages/ledger/src": [
      "accounts",
      "categories",
      "counterparties",
      "currencies",
      "dashboard",
      "invariants",
      "journeys",
      "test",
      "transactions",
    ],
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

  /**
   * Storybook's own configuration, which runs in a browser by definition and is
   * never bundled into an app.
   *
   * The exemption is by **directory**, not by file, and that is the narrow part:
   * `.storybook/` is the one place in a neutral package whose code has a single
   * known host. Everything under `src/` — stories included — stays subject to
   * the rule, because a story is imported by `stories.test.tsx` and lives
   * alongside the component it renders. If a story ever needs `document`, that
   * is a component reaching for a browser, and the failure is the point.
   */
  const isDevTooling = (relative: string) =>
    relative.includes("/.storybook/") ||
    relative.includes("/visual/") ||
    relative.endsWith("playwright.config.ts");

  it("no neutral package reaches for a global the device lacks", () => {
    const offenders: string[] = [];

    for (const root of NEUTRAL) {
      for (const file of sourceFiles(join(repoRoot, root))) {
        const relative = rel(file);
        if (isTest(file) || GUARDED.includes(relative) || isDevTooling(relative)) continue;

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

/* ── §4 · Language: every word a person reads comes from a catalogue ─────── */

describe("no user-visible string is written into a component", () => {
  /**
   * **The rule that stops the retrofit from being needed twice.**
   *
   * Localising six screens cost an afternoon. Localising forty would not, and
   * forty is what the board holds — so the moment to make a literal fail is
   * before they are written, not after. Nothing about a hardcoded label *looks*
   * wrong: it renders, it is legible, and it is only wrong to a reader who
   * never sees this repository.
   *
   * Two shapes, because there are two ways a word reaches a screen: as a prop
   * on a component that renders it, and as the text child of a `<Text>`.
   *
   * **`=` or `:`, because a label is not always a prop.** The appearance
   * switch held its three words in a module-scope array of
   * `{ value, label }` — outside any component, so outside `useT`, and
   * invisible to a check that only read JSX. Both had to become hooks;
   * `System` `Light` `Dark` were three of the four strings this half of the
   * pattern caught.
   *
   * **Anything without a letter is fine.** `label="+"` is a symbol and means
   * the same in every language; so do `variant="primary"` and every other
   * enumerated prop, which is why the check names the props that carry prose
   * rather than scanning all of them.
   */
  const PROSE_PROPS =
    /\b(?:label|placeholder|title|accessibilityLabel|accessibilityHint)\s*[=:]\s*"([^"]*)"/g;
  const TEXT_CHILD = /<Text(?:\s[^>]*)?>\s*([^<>{}]*[A-Za-z][^<>{}]*?)\s*<\/Text>/g;

  const ROOTS = ["packages/ui/src", "apps/mobile/app", "apps/mobile/src"];

  const screens = ROOTS.flatMap((root) => sourceFiles(join(repoRoot, root)))
    .filter((f) => f.endsWith(".tsx"))
    .filter((f) => !/\.(test|stories)\.tsx$/.test(f));

  it("scans a tree that exists", () => {
    // Non-vacuity: a renamed folder must turn this red, not silently green.
    expect(screens.length).toBeGreaterThan(10);
  });

  it("imports the translator from the module that initialises it", () => {
    /**
     * `react-i18next`'s own `useTranslation` reaches an i18next that nothing
     * registered unless `i18n/provider` happens to have been imported — and it
     * usually has not. The result is not an error: every component renders its
     * own keys, so `Save` reads `common.save` in 22 tests and every story.
     * Importing `useT` from the provider makes initialisation a consequence of
     * use rather than a thing to remember.
     */
    const offenders = screens
      .concat(sourceFiles(join(repoRoot, "packages/client/src")))
      .filter((f) => !f.endsWith(join("i18n", "provider.tsx")))
      .filter((f) => importsOf(f).includes("react-i18next"))
      .map(rel);

    expect(offenders, "import { useT } from the i18n provider").toEqual([]);
  });

  it("passes prose props through a catalogue, never a literal", () => {
    const offenders: string[] = [];

    for (const file of screens) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

      for (const [, value] of code.matchAll(PROSE_PROPS)) {
        if (value && /[A-Za-z]/.test(value)) offenders.push(`${rel(file)} — "${value}"`);
      }
    }

    expect(offenders, 'use t("section.key") — packages/ui/src/i18n/en.ts').toEqual([]);
  });

  it("renders no bare text child", () => {
    const offenders: string[] = [];

    for (const file of screens) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

      for (const [, value] of code.matchAll(TEXT_CHILD)) {
        offenders.push(`${rel(file)} — "${value}"`);
      }
    }

    expect(offenders, 'use t("section.key") — packages/ui/src/i18n/en.ts').toEqual([]);
  });
});

/* ── §5 · Styling: one way to build a stylesheet ─────────────────────────── */

describe("every component builds its styles the same way", () => {
  /**
   * **`makeStyles`, everywhere, and nothing else.**
   *
   * `packages/ui` reached this on its own — all twenty components there use it.
   * The apps did not, and the gap was not visible from inside the package:
   * `conformance.test.ts` roots at `packages/ui/src`, so the web dashboard
   * carried `fontSize: 28`, `fontSize: 13` and `opacity: 0.7` while the rule
   * banning exactly those passed green one directory over. That is the defect
   * `conformance.test.ts`'s own header describes, recurring at the app
   * boundary — which is why these checks live here, rooted at the repository.
   *
   * `opacity` is checked **only where it is standing in for ink** — a style
   * that sets a colour or a type step and then fades it. That is the case the
   * dashboard had, and it looks like a muted colour without being one: opacity
   * fades the glyph *and* the ground beneath it, so one value reads differently
   * on `ground` than on `surface`, and in dark it moves text toward the
   * background instead of away from it. `theme.textMuted` is a colour the theme
   * answers for; `opacity: 0.7` is a guess that happened to look right in the
   * theme it was written in.
   *
   * Fading a **whole control** is a different thing and stays legal: `opacity:
   * 0.45` is how four primitives render disabled, and `0.5` is the scrim. Those
   * dim a shape, not a word.
   */
  const ROOTS = ["packages/ui/src", "packages/ui/.storybook", "apps/mobile/app", "apps/mobile/src"];

  const rendering = ROOTS.flatMap((root) => sourceFiles(join(repoRoot, root)))
    .filter((f) => f.endsWith(".tsx"))
    .filter((f) => !f.endsWith(".test.tsx"));

  it("scans a tree that exists", () => {
    expect(rendering.length).toBeGreaterThan(20);
  });

  /**
   * An inline object splits a component's styling across two places — layout in
   * a stylesheet, one colour in a JSX attribute — which is how a hardcoded
   * colour gets added back without anyone noticing. It is also the shape a
   * colour took in the two files that had no stylesheet at all: the root layout
   * and Storybook's own panel, both of which read `themes[name]` by hand
   * because their `View` sat *above* the provider. Both are now components
   * underneath it.
   *
   * **Caught two ways, both of them one `{ … }` reaching a component**:
   * `style={{ … }}` directly, and the shape `quick-add-screen.tsx` had —
   * `style={[styles.scroll, { paddingLeft: … }]}`, an object literal riding
   * inside the array `dock.tsx`'s own `[styles.root, clearance]` precedent
   * says to use instead. `STYLE_ARRAY_OBJECT` requires the `{` inside the
   * array to open like a real style object (`{ key:`), the same shape every
   * offender takes, so `[styles.a, condition ? styles.b : null]` — no object
   * literal in sight — stays unflagged, and `[styles.a, computedInsets]`
   * (the fix: a plain object built *above* the JSX) reads as what it is,
   * a reference, not a literal.
   */
  it("passes no style object literal through JSX", () => {
    const STYLE_OBJECT = /style=\{\{/;
    const STYLE_ARRAY_OBJECT = /style=\{\[[^\]]*?\{\s*[A-Za-z_$]\w*\s*:/;
    const offenders = rendering
      .filter((f) => {
        const source = readFileSync(f, "utf8");
        return STYLE_OBJECT.test(source) || STYLE_ARRAY_OBJECT.test(source);
      })
      .map(rel);

    expect(offenders, "build it with makeStyles instead").toEqual([]);
  });

  /**
   * `StyleSheet.create` at module scope resolves colours at **import** time,
   * which is what made the theme a build-time constant before `makeStyles`
   * existed. One call site remains and it is `makeStyles` itself.
   */
  it("calls StyleSheet.create in exactly one place", () => {
    const callers = rendering
      .concat(ROOTS.flatMap((root) => sourceFiles(join(repoRoot, root))))
      .filter((f) =>
        /\bStyleSheet\.create\(/.test(importsOf(f).join("\n") + readFileSync(f, "utf8")),
      )
      .map(rel);

    expect([...new Set(callers)]).toEqual(["packages/ui/src/theme/styles.ts"]);
  });

  /**
   * The scale-step and colour rules `conformance.test.ts` holds inside
   * `packages/ui`, applied where it could not reach. Both were live: the web
   * dashboard wrote three font sizes and used `opacity` as an ink.
   */
  it("names a scale step and a role, never a size or an opacity", () => {
    const SIZE = /\b(fontSize|lineHeight):\s*[\d.]/;
    const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/;
    // One style entry — `{ … }` with no nested brace — that both paints text
    // and fades it. Fading a shape has no `color:` or `text.` beside it.
    const INK_OPACITY = /\{[^{}]*\bopacity:\s*0?\.\d[^{}]*\}/g;
    const PAINTS_TEXT = /\bcolor:|\.\.\.text\.(ui|display|mono)\(/;

    const offenders: string[] = [];
    for (const file of rendering) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

      if (SIZE.test(code)) offenders.push(`${rel(file)} — a font size literal`);
      if (COLOUR.test(code)) offenders.push(`${rel(file)} — a colour literal`);

      for (const entry of code.match(INK_OPACITY) ?? []) {
        if (PAINTS_TEXT.test(entry)) {
          offenders.push(`${rel(file)} — opacity as ink; use theme.textMuted`);
        }
      }
    }

    expect(offenders, "tokens.ts and theme/roles.ts hold these").toEqual([]);
  });
});

/**
 * L1 — `create-phone-ledger.ts` used to assert `phase: "success"` by hand at
 * every one of its own controllers' return sites; 43 of them sat immediately
 * before a `return { fieldErrors }` and reported a refusal as a success. The
 * fix (`finish()`, the same file) derives the phase from the outcome once,
 * in one place — this is the rule that keeps a new call site from
 * reintroducing the bug by hand-writing the literal again. `phase: "start"`
 * and `phase: "failure"` carry no equivalent risk (a caught exception is
 * unambiguously a failure) and are left alone.
 */
describe("a refusal is never reported as a success", () => {
  it("create-phone-ledger.ts derives phase through finish(), never by a bare literal", () => {
    const file = join(repoRoot, "packages/client/src/ledger/create-phone-ledger.ts");
    const lines = readFileSync(file, "utf8").split("\n");

    const finishStart = lines.findIndex((line) => line.includes("function finish<T>("));
    expect(finishStart, "the finish() helper must exist").toBeGreaterThan(-1);
    // The next top-level function declaration closes finish()'s own body —
    // a non-vacuity anchor rather than counting braces, the same reason
    // every other check in this file roots itself at real source structure.
    const finishEnd = lines.findIndex((line, i) => i > finishStart && line.startsWith("function "));
    expect(finishEnd, "finish() must be followed by another top-level function").toBeGreaterThan(
      finishStart,
    );

    // L5 — matched anywhere in the line, not against the line's entire
    // trimmed content: an exact-line check misses the identical literal
    // sharing a line with other content (`{ phase: "success", operation }`,
    // one object per line) or spaced differently (`phase:"success"`,
    // `phase :  "success"`) — none of which is a different rule, only a
    // different formatting of the same reintroduced bug. A comment line
    // (`* …`, `// …` — this file's own JSDoc and line-comment style
    // throughout) is excluded: this section's own prose *names* the literal
    // it replaced, which is not a call site to flag.
    const PHASE_SUCCESS_LITERAL = /phase\s*:\s*"success"/;
    const offenders = lines
      .map((line, i) => ({ trimmed: line.trim(), index: i }))
      .filter(({ trimmed }) => !trimmed.startsWith("*") && !trimmed.startsWith("//"))
      .filter(({ trimmed }) => PHASE_SUCCESS_LITERAL.test(trimmed))
      .filter(({ index }) => index < finishStart || index >= finishEnd)
      .map((o) => o.index + 1);

    expect(
      offenders,
      'a bare phase: "success" literal outside finish() reintroduces L1 — every controller returns its outcome through finish() instead',
    ).toEqual([]);
  });
});
