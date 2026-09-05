/**
 * Two things about `tests/git-fixture.ts`: that it actually strips what it
 * claims to, and that it is the *only* place any test may invoke `git` with
 * a verb that is not provably read-only.
 *
 * The second half exists because of the incident `tests/git-fixture.ts`'s
 * own header describes: a test that spawned `git init`/`add`/`commit`
 * itself, once, was enough to commit onto this branch's real history and
 * leave a stray identity in the shared `.git/config`. A rule that says "use
 * the fixture" is not a rule until something fails when it is not used —
 * this file is that something.
 *
 * Its default is the same as the fixture's: an invocation whose verbs cannot
 * be *read out of the source as literals* counts as a write. A verb list
 * held in a const, an interpolated verb, a `sh -c "git …"` string, a
 * `pnpm exec git …` line — none of those prove anything, so none of them
 * pass. The first version of this scan looked only for `exec*("git", [...])`
 * with a literal verb in the array and let every one of those shapes
 * through, which is a boundary that catches the mistake already made and no
 * other.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { _internal, createTempGitRepo, git, removeTempGitRepo } from "./git-fixture.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const HELPER_FILE = fileURLToPath(new URL("./git-fixture.ts", import.meta.url));
// This file itself is exempt from its own scan: the self-tests below need
// literal bait text that looks exactly like the violation being banned.
const THIS_FILE = fileURLToPath(import.meta.url);

describe("git-fixture.ts strips every inherited GIT_* variable (M-a)", () => {
  it("removes every GIT_* key, regardless of value", () => {
    const dirty = {
      GIT_DIR: "/somewhere/real/.git",
      GIT_INDEX_FILE: "/somewhere/real/.git/index",
      GIT_WORK_TREE: "/somewhere/real",
      GIT_EDITOR: "true",
      PATH: "/usr/bin",
      HOME: "/home/whoever",
    };
    const stripped = _internal.stripGitEnv(dirty);
    expect(Object.keys(stripped).filter((k) => k.startsWith("GIT_"))).toEqual([]);
    // Non-GIT_* keys survive — this is a filter, not a wipe.
    expect(stripped["PATH"]).toBe("/usr/bin");
    expect(stripped["HOME"]).toBe("/home/whoever");
  });

  it("passes a fully-stripped environment plus only the fixture's own keys", () => {
    const env = {
      PATH: "/usr/bin",
      GIT_CEILING_DIRECTORIES: "/tmp/some-dir",
      ..._internal.FIXTURE_IDENTITY,
    };
    expect(() => _internal.assertNoLeakedGitEnv(env)).not.toThrow();
  });

  it("throws — the M-a check that must run before git init — when a real GIT_* leaks through", () => {
    const leaked = {
      PATH: "/usr/bin",
      GIT_CEILING_DIRECTORIES: "/tmp/some-dir",
      ..._internal.FIXTURE_IDENTITY,
      GIT_DIR: "/somewhere/real/.git",
    };
    expect(() => _internal.assertNoLeakedGitEnv(leaked)).toThrow(/GIT_DIR/);
  });
});

describe("no unproven git call outside tests/git-fixture.ts (M-b, M-1)", () => {
  /**
   * The exec-family entry points a test could reach the `git` binary
   * through. `exec`/`execFile`/`spawn` cover their promisified forms by
   * name too (`promisify(execFile)` is matched separately, below, because
   * the call site is whatever the result was bound to).
   */
  const BASE_EXEC_FUNCS = [
    "execSync",
    "exec",
    "execFile",
    "execFileSync",
    "spawn",
    "spawnSync",
    "execa",
    "execaSync",
    "execaCommand",
    "execaCommandSync",
    "execaNode",
  ];

  const escapeRe = (literal: string) => literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /** Names bound to a promisified child_process function: `const run = promisify(execFile)`. */
  function promisifiedNames(source: string): string[] {
    const BINDING =
      /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[A-Za-z_$][\w$]*\.)?promisify\(\s*(?:[A-Za-z_$][\w$]*\.)?(?:exec|execFile|spawn)\s*\)/g;
    return [...source.matchAll(BINDING)].map((m) => m[1] ?? "").filter(Boolean);
  }

  /** From an opening delimiter, the source text up to and including its match. */
  function balanced(source: string, open: number): string {
    const opener = source[open];
    if (opener === "`") {
      for (let i = open + 1; i < source.length; i++) {
        if (source[i] === "\\") {
          i++;
          continue;
        }
        if (source[i] === "`") return source.slice(open, i + 1);
      }
      return source.slice(open);
    }
    let depth = 0;
    for (let i = open; i < source.length; i++) {
      if (source[i] === "(") depth++;
      else if (source[i] === ")") {
        depth--;
        if (depth === 0) return source.slice(open, i + 1);
      }
    }
    return source.slice(open);
  }

  /**
   * Every exec-family call in `source`, as its own argument-list (or tagged
   * template) source text.
   *
   * Both call shapes matter: `execFileSync("git", [...])` and
   * ``execSync(`git ...`)`` reach the same binary, and round 2's scanner saw
   * only the first — it keyed on a literal `"git"` immediately after the
   * open paren, so a template literal, a `sh -c "git …"` string, and
   * `pnpm exec git …` all walked straight past it.
   */
  function execCallTexts(source: string): string[] {
    const names = [...BASE_EXEC_FUNCS, ...promisifiedNames(source)];
    const CALL = new RegExp(`\\b(?:${names.map(escapeRe).join("|")})\\s*[(\`]`, "g");
    const texts = [...source.matchAll(CALL)].map((m) =>
      balanced(source, (m.index ?? 0) + m[0].length - 1),
    );
    // execa's `$` tagged template: `` $`git commit` ``.
    for (const m of source.matchAll(/(?:^|[^A-Za-z0-9_$.])\$\s*`/g)) {
      texts.push(balanced(source, (m.index ?? 0) + m[0].length - 1));
    }
    return texts;
  }

  type Token = { text: string; literal: boolean };
  const DELIMITERS = new Set([",", "[", "]", "(", ")", "{", "}", ":", ";", " ", "\t", "\n", "\r"]);

  /**
   * Words, each marked with whether it came from a string literal.
   *
   * That mark is the whole reason this is a lexer rather than a regex: a
   * verb is only *proven* read-only when it is spelled out in the source. A
   * bare identifier (`args`, `verbs[0]`) or an interpolation (`${verb}`)
   * carries no proof, so it becomes UNRESOLVED and the shared allowlist
   * refuses it.
   */
  function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    while (i < source.length) {
      const ch = source[i] ?? "";
      if (ch === '"' || ch === "'" || ch === "`") {
        let j = i + 1;
        let buffer = "";
        while (j < source.length && source[j] !== ch) {
          if (source[j] === "\\") {
            buffer += source[j + 1] ?? "";
            j += 2;
            continue;
          }
          buffer += source[j];
          j += 1;
        }
        for (const raw of buffer.split(/\s+/)) {
          // A nested quote (`sh -c "git status"`) is a shell delimiter, not
          // part of the word — without stripping it the command reads as
          // `"git`, and the whole `sh -c` shape walks past this scan.
          const word = raw.replace(/^["'`]+|["'`]+$/g, "");
          if (word) tokens.push({ text: word, literal: !word.includes("${") });
        }
        i = j + 1;
        continue;
      }
      if (DELIMITERS.has(ch)) {
        i += 1;
        continue;
      }
      let j = i;
      let buffer = "";
      while (
        j < source.length &&
        !DELIMITERS.has(source[j] ?? "") &&
        source[j] !== '"' &&
        source[j] !== "'" &&
        source[j] !== "`"
      ) {
        buffer += source[j];
        j += 1;
      }
      tokens.push({ text: buffer, literal: false });
      i = j;
    }
    return tokens;
  }

  /**
   * Every `git` invocation inside one exec call, as the argument list that
   * follows it — with each unresolvable token replaced by the sentinel the
   * fixture's own allowlist treats as "not proven".
   *
   * `git` must itself be a literal: this is looking for the command being
   * run, not for the wrapper named `git` that tests are supposed to call.
   */
  function gitArgLists(callText: string): string[][] {
    const tokens = tokenize(callText);
    const lists: string[][] = [];
    tokens.forEach((token, index) => {
      if (token.text !== "git" || !token.literal) return;
      lists.push(
        tokens.slice(index + 1).map((arg) => (arg.literal ? arg.text : _internal.UNRESOLVED)),
      );
    });
    return lists;
  }

  /** The invocation up to and including its verb — what a failure message needs to name. */
  function describeArgs(args: string[]): string {
    const shown: string[] = [];
    let i = 0;
    while (i < args.length) {
      const arg = args[i] ?? "";
      if (_internal.VALUE_FLAGS.has(arg)) {
        shown.push(arg, args[i + 1] ?? "");
        i += 2;
        continue;
      }
      if (arg.startsWith("-")) {
        shown.push(arg);
        i += 1;
        continue;
      }
      shown.push(arg);
      if (arg === "config") shown.push(args[i + 1] ?? "");
      break;
    }
    const text = shown
      .map((arg) => (arg === _internal.UNRESOLVED ? "<unresolved>" : arg))
      .join(" ")
      .trim();
    return `git ${text || "<no verb>"}`;
  }

  /** The unproven git invocations in one file's source, described for a failure message. */
  function unprovenGitCalls(source: string): string[] {
    const found: string[] = [];
    for (const callText of execCallTexts(source)) {
      for (const args of gitArgLists(callText)) {
        if (_internal.isReadOnlyGitArgs(args)) continue;
        found.push(describeArgs(args));
      }
    }
    return found;
  }

  function tsFiles(dir: string, out: string[] = []): string[] {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return out;
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry === "dist" || entry === ".expo") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) tsFiles(full, out);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  }

  /**
   * `tests/` in full, and every test or spec file under the four trees that
   * hold the rest of this repository's code. `apps/**` and `tools/**` are
   * here because nothing stops an app or a tool test from shelling out to
   * git — the incident this rule exists for was one file in one directory,
   * and a boundary that only watches the directory it already happened in
   * is a memorial, not a control.
   */
  const SCANNED_ROOTS = ["tests", "packages", "apps", "tools"];

  function candidateFiles(): string[] {
    const underTests = tsFiles(join(repoRoot, "tests")).filter(
      (f) => f !== HELPER_FILE && f !== THIS_FILE,
    );
    const elsewhere = SCANNED_ROOTS.filter((root) => root !== "tests").flatMap((root) =>
      tsFiles(join(repoRoot, root)).filter((f) => /\.(test|spec)\.tsx?$/.test(f)),
    );
    return [...underTests, ...elsewhere];
  }

  it("scans tests/, packages/, apps/ and tools/ — not just the directory it first went wrong in", () => {
    const files = candidateFiles().map((f) => relative(repoRoot, f));
    expect(files.length, "candidate files found").toBeGreaterThan(20);
    expect(SCANNED_ROOTS).toContain("apps");
    expect(SCANNED_ROOTS).toContain("tools");
    expect(
      files.some((f) => f.startsWith("apps/")),
      "apps/ test files are in the scan",
    ).toBe(true);
    expect(
      files.some((f) => f.startsWith("packages/")),
      "packages/ test files are in the scan",
    ).toBe(true);
  });

  it("finds none — every candidate file goes through tests/git-fixture.ts instead", () => {
    const offenders: string[] = [];
    for (const file of candidateFiles()) {
      for (const call of unprovenGitCalls(readFileSync(file, "utf8"))) {
        offenders.push(`${relative(repoRoot, file)}: ${call}`);
      }
    }
    expect(
      offenders,
      "git invocations outside tests/git-fixture.ts whose verbs are not provably read-only",
    ).toEqual([]);
  });

  // Broken once with each of the three shapes round 2's scanner missed,
  // by hand, before this file shipped: a template-literal
  // ``execSync(`git commit -m x`, { cwd: dir })`` in
  // tests/verify-visual-gate.test.ts, an
  // `execSync("pnpm exec git commit -m x")` in the same file, and an
  // `execFileSync("git", ["reset", "--hard"], …)` in
  // apps/api/src/http/dev-cors.test.ts (a tree round 2 did not scan at
  // all). Each one failed the assertion above, naming that exact file and
  // invocation; all three were removed before anything was committed.
  it.each([
    ['execFileSync("git", ["commit", "-q", "-m", "bait"], { cwd: dir });', "commit"],
    ["execSync(`git commit -m 'bait'`, { cwd: dir });", "commit"],
    ['execSync("pnpm exec git commit -m bait");', "commit"],
    ['spawnSync("sh", ["-c", "git add -A"], { cwd: dir });', "add"],
    ["execSync(`sh -c 'git reset --hard'`);", "reset"],
    ['await execa("git", ["clean", "-fd"], { cwd: dir });', "clean"],
    ["await $`git worktree add /tmp/x`;", "worktree"],
  ])("catches %s", (bait, verb) => {
    const calls = unprovenGitCalls(bait);
    expect(calls, `bait not caught: ${bait}`).toHaveLength(1);
    expect(calls[0]).toContain(verb);
  });

  it("catches an argument list it cannot read — a verb list held in a const", () => {
    const bait = [
      'const MUTATING = ["commit", "-m", "bait"];',
      'execFileSync("git", MUTATING, { cwd: dir });',
    ].join("\n");
    expect(unprovenGitCalls(bait)).toEqual(["git <unresolved>"]);
  });

  it("catches an interpolated verb, and a promisified exec bound to another name", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholder is the bait
    const interpolated = "execSync(`git ${verb} -A`);";
    expect(unprovenGitCalls(interpolated)).toEqual(["git <unresolved>"]);
    const promisified = [
      "const run = promisify(execFile);",
      'await run("git", ["reset", "--hard"], { cwd: dir });',
    ].join("\n");
    expect(unprovenGitCalls(promisified)).toEqual(["git reset"]);
  });

  it("passes what it should: the wrapper, and every provably read-only verb", () => {
    // Calling the *wrapper* named `git` (not an exec function) is the
    // sanctioned shape, and must never itself look like a violation.
    expect(unprovenGitCalls('git(dir, ["commit", "-q", "-m", "init"]);')).toEqual([]);
    for (const verb of _internal.READ_ONLY_VERBS) {
      expect(unprovenGitCalls(`execFileSync("git", ["${verb}"], { cwd: dir });`)).toEqual([]);
    }
    // Flags before the verb, and options that swallow their argument.
    expect(
      unprovenGitCalls('execFileSync("git", ["-C", dir, "--no-pager", "log"], { cwd: dir });'),
    ).toEqual([]);
    // `config` reads only with --get; anything else it does is a write.
    expect(unprovenGitCalls('execFileSync("git", ["config", "--get", "user.email"]);')).toEqual([]);
    expect(
      unprovenGitCalls('execFileSync("git", ["config", "user.email", "x@example.invalid"]);'),
    ).toEqual(["git config user.email"]);
  });

  it("shares one allowlist with the fixture rather than keeping a second copy", () => {
    // The scanner decides "provably read-only" by calling the very function
    // the fixture's own runtime guard calls. Two lists would drift, and the
    // one nobody is looking at would be the permissive one.
    expect(_internal.isReadOnlyGitArgs(["status"])).toBe(true);
    expect(_internal.isReadOnlyGitArgs(["commit"])).toBe(false);
    expect(_internal.isReadOnlyGitArgs([_internal.UNRESOLVED])).toBe(false);
    expect(_internal.isReadOnlyGitArgs([])).toBe(false);
  });
});

describe("the fixture refuses to mutate anything outside os.tmpdir() (L-2)", () => {
  it("throws on a mutating verb against the real repository — before any git process starts", () => {
    let thrown: unknown;
    try {
      git(repoRoot, ["commit", "-q", "-m", "this must never run"]);
    } catch (error) {
      thrown = error;
    }
    expect(thrown, "a mutating call against the repo root must throw").toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/refusing to run/);
    expect((thrown as Error).message).toContain("not under");
    // Proof it never spawned: execFileSync's failures carry `status`,
    // `stderr` and `pid` from the child. A refusal that reached the child
    // process would be an ExecFileSyncException, not a plain Error.
    const asChildError = thrown as { status?: unknown; stderr?: unknown; pid?: unknown };
    expect(asChildError.status, "no child process exit status").toBeUndefined();
    expect(asChildError.stderr, "no child process stderr").toBeUndefined();
    expect(asChildError.pid, "no child process pid").toBeUndefined();
  });

  it("refuses `init` outside tmpdir too — the one write with no repository to check afterwards", () => {
    expect(() => git(repoRoot, ["init", "-q"])).toThrow(/refusing to run/);
  });

  it("still allows read-only verbs anywhere, so the guard is verb-scoped and not a blanket ban", () => {
    expect(git(repoRoot, ["rev-parse", "--show-toplevel"]).trim().length).toBeGreaterThan(0);
  });

  it("allows every verb inside a temp repository, which is the whole point", () => {
    const dir = createTempGitRepo("gate-tmp-guard-");
    try {
      writeFileSync(join(dir, "a.txt"), "x\n");
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-q", "-m", "init"]);
      expect(git(dir, ["log", "--oneline"]).trim().length).toBeGreaterThan(0);
    } finally {
      removeTempGitRepo(dir);
    }
  });

  it("judges by the real path, not the string — tmpdir is a symlink on macOS", () => {
    expect(_internal.isUnderTmp(_internal.TMP_ROOT)).toBe(true);
    expect(_internal.isUnderTmp(join(_internal.TMP_ROOT, "anything", "deeper"))).toBe(true);
    expect(_internal.isUnderTmp(repoRoot)).toBe(false);
    // A directory whose name merely starts with the temp root's name is not
    // inside it — the separator in the prefix check is what says so.
    expect(_internal.isUnderTmp(`${_internal.TMP_ROOT}-not-really`)).toBe(false);
  });
});
