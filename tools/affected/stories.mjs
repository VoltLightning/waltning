/**
 * Which visual stories a changeset can affect.
 *
 * **Playwright's own `--only-changed` cannot answer this.**
 * `visual/stories.spec.ts` is a single file that reads `storybook-static/
 * index.json` at run time and generates all 1705 tests from it, so it imports
 * no component and Playwright's dependency graph sees no edge from a changed
 * component to the spec. It would run everything or nothing. The mapping has
 * to be ours, and `index.json` already holds half of it: 423 of 426 stories
 * carry the `componentPath` they render.
 *
 * **The other half is the importers**, and it is the half a naive version gets
 * wrong. Changing `Button` must run every story that *renders* a `Button`, not
 * only `Button`'s own — so this walks imports backwards, transitively, before
 * it looks anything up.
 *
 * **Anything it cannot map runs everything.** A changed token, theme, locale
 * or config file has no story of its own and reaches all of them; a changed
 * component with no story and no importer that has one is a gap in the map
 * rather than a component with no tests. Both print `ALL`. The failure this
 * exists to avoid is a silent miss, so the fallback is the slow answer, never
 * the empty one.
 *
 * Prints one of:
 *   ALL              — run the whole suite
 *   NONE             — nothing visual changed
 *   <regex>          — a `-g` pattern over the story titles
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const UI = "packages/ui";
const SRC = `${UI}/src`;
const INDEX = `${UI}/storybook-static/index.json`;

/**
 * Files that reach every story, so a change to one is not worth mapping.
 *
 * Tokens and the theme are read by every component; the i18n catalogue is
 * rendered by most; `.storybook/` and `visual/` are the harness itself. A
 * lock-file change can move any dependency under any of them.
 */
const GLOBAL = [
  /^packages\/ui\/src\/tokens\.ts$/,
  /^packages\/ui\/src\/theme\//,
  /^packages\/ui\/src\/i18n\//,
  /^packages\/ui\/src\/primitives\//,
  /^packages\/ui\/\.storybook\//,
  /^packages\/ui\/visual\//,
  /^packages\/ui\/(package\.json|playwright\.config\.ts)$/,
  /^packages\/core\//,
  /^pnpm-lock\.yaml$/,
];

/**
 * The changeset: staged by default, a given list under `--files`.
 *
 * The explicit form is what `tests/affected-stories.test.ts` uses to ask about
 * a case without building a git fixture for it — the script it tests is then
 * the script that runs, rather than a second copy of the mapping written in
 * TypeScript.
 */
function changedFiles() {
  const args = process.argv.slice(2);
  const at = args.indexOf("--files");
  if (at !== -1) return args.slice(at + 1);
  // **`D` included.** A deleted or moved component cannot be mapped — its
  // story is gone from the index and its old path resolves to nothing — so it
  // falls through to `ALL`, which is the answer a change nobody can trace
  // should get. Leaving deletions out made a delete-only commit look like a
  // commit that touched no component at all.
  return execSync("git diff --cached --name-only --diff-filter=ACMRD", {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

/** Every `.ts`/`.tsx` under `packages/ui/src`, repo-relative. */
function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

/** `from` → the files it imports, resolved to real paths within `packages/ui/src`. */
function importsOf(file) {
  const source = readFileSync(file, "utf8");
  const out = new Set();
  for (const match of source.matchAll(/from\s+"(\.[^"]+)"/g)) {
    const raw = match[1];
    const base = resolve(dirname(file), raw);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        out.add(relative(process.cwd(), candidate));
        break;
      }
    }
  }
  return out;
}

/** Everything that imports `seed`, transitively. */
function importersOf(seed, files) {
  const reverse = new Map();
  for (const file of files) {
    for (const target of importsOf(file)) {
      const list = reverse.get(target) ?? [];
      list.push(file);
      reverse.set(target, list);
    }
  }
  const reached = new Set(seed);
  const queue = [...seed];
  while (queue.length > 0) {
    const next = queue.pop();
    for (const importer of reverse.get(next) ?? []) {
      if (reached.has(importer)) continue;
      reached.add(importer);
      queue.push(importer);
    }
  }
  return reached;
}

function main() {
  const changed = changedFiles();
  const visual = changed.filter(
    (file) =>
      file.startsWith(`${UI}/`) || file.startsWith("packages/core/") || file === "pnpm-lock.yaml",
  );
  if (visual.length === 0) return "NONE";
  if (visual.some((file) => GLOBAL.some((pattern) => pattern.test(file)))) return "ALL";
  if (!existsSync(INDEX)) return "ALL";

  const seed = visual.filter((file) => file.startsWith(`${SRC}/`) && /\.tsx?$/.test(file));
  if (seed.length !== visual.length) return "ALL";

  const reached = importersOf(seed, sourceFiles(SRC));
  const index = JSON.parse(readFileSync(INDEX, "utf8"));
  const titles = new Set();
  for (const entry of Object.values(index.entries)) {
    if (entry.type !== "story") continue;
    // `./src/…` in the index, repo-relative here.
    const paths = [entry.componentPath, entry.importPath]
      .filter(Boolean)
      .map((path) => join(UI, path.replace(/^\.\//, "")));
    if (paths.some((path) => reached.has(path))) titles.add(entry.title);
  }
  // A component nothing renders and nothing has a story for is a hole in this
  // map, not a component without tests.
  if (titles.size === 0) return "ALL";
  return [...titles].map((title) => title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}

process.stdout.write(`${main()}\n`);
