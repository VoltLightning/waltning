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
 *
 * The same default governs the *command word*. `git`, `/usr/bin/git` and
 * `git.exe` are one binary under four spellings, so the scan compares
 * basenames rather than the string `git`; and a command word that is not a
 * literal at all — `execFileSync(GIT, …)`, ``execSync(`${bin} commit`)`` —
 * is refused outright, because a binary this scan cannot read is a possible
 * `git`.
 *
 * What it reads is every `.ts`/`.tsx` file under `tests/`, `tools/`,
 * `packages/` and `apps/`, not only the ones named `*.test.ts`. A helper, a
 * script, an app's platform module can each spawn exactly what a test can.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
   * `exec` is the one entry point above whose name is also a standard
   * method: `/re/.exec(text)`, `sqlite.exec(sql)`. Dotted, it is one of
   * those unless the receiver is a `child_process` binding — and a dotted
   * `exec` still gets scanned for a literal `git` command word, it just
   * cannot raise the *unresolved command* alarm, which would otherwise fire
   * on every regex match in the repository.
   */
  const COLLIDING_NAMES = new Set(["exec"]);
  const CHILD_PROCESS_RECEIVER = /(?:^|[^\w$])(?:cp|proc|childProcess|child_process)\s*\.\s*$/;

  /**
   * Command expressions the language itself proves are not git.
   * `process.execPath` is Node's own binary — deliberately the only member,
   * because every addition is a hole: an unreadable command word is a
   * possible `git` until something *guarantees* otherwise.
   */
  const PROVEN_NON_GIT_COMMANDS = new Set(["process.execPath"]);

  type ExecCall = { text: string; commandMustBeLiteral: boolean };

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
  function execCallTexts(source: string): ExecCall[] {
    const names = [...BASE_EXEC_FUNCS, ...promisifiedNames(source)];
    const CALL = new RegExp(`\\b(?:${names.map(escapeRe).join("|")})\\s*[(\`]`, "g");
    const calls: ExecCall[] = [];
    for (const m of source.matchAll(CALL)) {
      const start = m.index ?? 0;
      const name = m[0].replace(/\s*[(`]$/, "");
      const before = source.slice(Math.max(0, start - 64), start);
      const dotted = /\.\s*$/.test(before);
      const isMethodCollision =
        dotted && COLLIDING_NAMES.has(name) && !CHILD_PROCESS_RECEIVER.test(before);
      calls.push({
        text: balanced(source, start + m[0].length - 1),
        commandMustBeLiteral: !isMethodCollision,
      });
    }
    // execa's `$` tagged template: `` $`git commit` ``. Its first word is
    // the command word too, so the same rule applies.
    for (const m of source.matchAll(/(?:^|[^A-Za-z0-9_$.])\$\s*`/g)) {
      calls.push({
        text: balanced(source, (m.index ?? 0) + m[0].length - 1),
        commandMustBeLiteral: true,
      });
    }
    return calls;
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
   * `git`, `/usr/bin/git`, `../bin/git`, `git.exe` — one binary, four
   * spellings. Round 3's scanner compared the token to the string `git`, so
   * an absolute path to the same executable read as an ordinary word.
   */
  function isGitCommandWord(text: string): boolean {
    const base = text.split(/[/\\]+/).pop() ?? "";
    return base.replace(/\.exe$/i, "") === "git";
  }

  type Invocation = { command: string; args: string[] };

  /**
   * The git invocations inside one exec call: each command word, with the
   * argument list that follows it and every unresolvable token replaced by
   * the sentinel the fixture's own allowlist treats as "not proven".
   *
   * Two ways in. A literal token whose basename is `git` is a git command
   * word wherever it sits — first argument, or after `sh -c` / `pnpm exec`.
   * And the *command position* itself (the first token of the call) is a
   * violation whenever it is not a literal at all: `execFileSync(GIT, …)`
   * and ``execSync(`${bin} commit`)`` name a binary this scan cannot read,
   * and an unreadable binary is a possible `git`. The wrapper
   * `git(dir, […])` is not an exec-family call and never reaches here.
   */
  function gitInvocations(call: ExecCall): Invocation[] {
    const tokens = tokenize(call.text);
    const asArgs = (from: number) =>
      tokens.slice(from).map((arg) => (arg.literal ? arg.text : _internal.UNRESOLVED));
    const found: Invocation[] = [];
    const first = tokens[0];
    if (
      call.commandMustBeLiteral &&
      first !== undefined &&
      !first.literal &&
      !PROVEN_NON_GIT_COMMANDS.has(first.text)
    ) {
      found.push({ command: _internal.UNRESOLVED, args: asArgs(1) });
      return found;
    }
    tokens.forEach((token, index) => {
      if (!token.literal || !isGitCommandWord(token.text)) return;
      found.push({ command: token.text, args: asArgs(index + 1) });
    });
    return found;
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
    return text || "<no verb>";
  }

  function describeInvocation(invocation: Invocation): string {
    const command =
      invocation.command === _internal.UNRESOLVED ? "<unresolved command>" : invocation.command;
    return `${command} ${describeArgs(invocation.args)}`.trim();
  }

  /** The unproven git invocations in one file's source, described for a failure message. */
  function unprovenGitCalls(source: string): string[] {
    const found: string[] = [];
    for (const call of execCallTexts(source)) {
      for (const invocation of gitInvocations(call)) {
        // An unreadable command word is never proven, whatever follows it.
        if (
          invocation.command !== _internal.UNRESOLVED &&
          _internal.isReadOnlyGitArgs(invocation.args)
        )
          continue;
        found.push(describeInvocation(invocation));
      }
    }
    return found;
  }

  /**
   * Directories whose contents nobody in this repository wrote: installed
   * packages, build output, and the generated migration trees under
   * `drizzle/` (SQL today, and this scan should not start policing them if
   * that ever changes).
   */
  const SKIPPED_DIRS = new Set([
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".expo",
    "drizzle",
    "storybook-static",
    "playwright-report",
    "test-results",
  ]);

  function tsFiles(dir: string, out: string[] = []): string[] {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return out;
    }
    for (const entry of entries) {
      if (SKIPPED_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) tsFiles(full, out);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  }

  /**
   * **Every** `.ts`/`.tsx` file under these four trees — not only
   * `*.test.ts`. A helper a test imports is not a test file and can spawn
   * anything the test would have; so can a script under `tools/`, an app's
   * platform module, or a package's build-time code. Round 3 scanned
   * `tests/` in full and test files elsewhere, which left the majority of
   * the repository's source outside a boundary whose whole claim is that
   * *nothing* invokes git except the fixture.
   *
   * The two exemptions are unchanged: `tests/git-fixture.ts`, which is the
   * sanctioned caller, and this file, which holds literal bait.
   */
  const SCANNED_ROOTS = ["tests", "tools", "packages", "apps"];

  function candidateFiles(): string[] {
    return SCANNED_ROOTS.flatMap((root) => tsFiles(join(repoRoot, root))).filter(
      (f) => f !== HELPER_FILE && f !== THIS_FILE,
    );
  }

  it("scans every .ts/.tsx under tests/, tools/, packages/ and apps/ — not only test files", () => {
    const files = candidateFiles().map((f) => relative(repoRoot, f));
    // 717 files when this was written (719 under the four roots, minus the
    // fixture and this file). The floor is well below that so an ordinary
    // deletion does not fail the gate, and well above round 3's ~250, which
    // is the number this finding was about.
    expect(files.length, "candidate files scanned").toBeGreaterThan(500);
    for (const root of SCANNED_ROOTS) {
      expect(
        files.some((f) => f.startsWith(`${root}/`)),
        `${root}/ files are in the scan`,
      ).toBe(true);
    }
    // The point of L-8: non-test source is scanned too.
    expect(
      files.filter((f) => !/\.(test|spec)\.tsx?$/.test(f)).length,
      "non-test files scanned",
    ).toBeGreaterThan(300);
    expect(files, "the sanctioned caller stays exempt").not.toContain("tests/git-fixture.ts");
    expect(files, "this file's bait stays exempt").not.toContain(
      "tests/git-fixture-boundary.test.ts",
    );
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

  // Broken once, by hand, with each of the two shapes L-7 names: an
  // `execFileSync("/usr/bin/git", ["commit", …])` appended to
  // tests/verify-visual-gate.test.ts and a `const GIT = "git"` +
  // `execFileSync(GIT, ["commit", …])` appended to
  // packages/core/src/money.ts — a *non-test* file, which is only in the
  // scan because of L-8. Both failed the assertion above, naming the file
  // and, respectively, `/usr/bin/git commit` and `<unresolved command>
  // commit`; both were reverted before anything was staged.
  it.each([
    [
      'execFileSync("/usr/bin/git", ["commit", "-m", "bait"], { cwd: dir });',
      "/usr/bin/git commit",
    ],
    ['execFileSync("git.exe", ["reset", "--hard"], { cwd: dir });', "git.exe reset"],
    [
      'execSync("C:\\\\tools\\\\Git\\\\bin\\\\git.exe add -A");',
      "C:\\tools\\Git\\bin\\git.exe add",
    ],
    ['execSync("/usr/local/bin/git push --force");', "/usr/local/bin/git push"],
  ])("reads a path to the same binary as the command word: %s", (bait, expected) => {
    expect(unprovenGitCalls(bait)).toEqual([expected]);
  });

  it("refuses a command name it cannot read — the binary might be git", () => {
    const constBinding = [
      'const GIT = "git";',
      'execFileSync(GIT, ["commit", "-m", "bait"], { cwd: dir });',
    ].join("\n");
    expect(unprovenGitCalls(constBinding)).toEqual(["<unresolved command> commit"]);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholder is the bait
    expect(unprovenGitCalls("execSync(`${bin} commit -m bait`);")).toEqual([
      "<unresolved command> commit",
    ]);
    // Read-only-looking arguments do not rescue it: `<unresolved> status`
    // is only read-only if the binary really was git, and that is exactly
    // what could not be established.
    expect(unprovenGitCalls('execFileSync(bin, ["status"]);')).toEqual([
      "<unresolved command> status",
    ]);
  });

  it("does not mistake RegExp#exec or a sqlite handle for a child process", () => {
    // `exec` is also a standard method. Without this, L-7's command rule
    // would fire on every `/re/.exec(line)` in the repository — hundreds of
    // them — and the scan would be useless rather than strict.
    expect(unprovenGitCalls("const m = /^(\\w+)$/.exec(line);")).toEqual([]);
    expect(unprovenGitCalls("replicaSqlite.exec(replicaSql);")).toEqual([]);
    // A child_process binding spelled with a receiver still counts.
    expect(unprovenGitCalls('cp.exec("git commit -m bait");')).toEqual(["git commit"]);
  });

  it("lets through the one command expression the language proves is not git", () => {
    // `process.execPath` is Node's own binary. It is the only member of
    // that allowlist, and the reason it can be one.
    expect(unprovenGitCalls('execFileSync(process.execPath, ["-e", probe]);')).toEqual([]);
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

describe("the fixture refuses a second location inside args (L-6)", () => {
  /**
   * The tmpdir guard judges the `dir` parameter. Git's own relocation
   * options let an argument list name somewhere else entirely — and the
   * fixture's `-C dir` goes in *first*, so a caller's `-C` wins. A
   * disposable repository as `dir` would then have made the call look
   * perfectly isolated while it ran in this repository.
   */
  let tempRepo = "";

  beforeAll(() => {
    tempRepo = createTempGitRepo("gate-reloc-");
  });

  afterAll(() => {
    removeTempGitRepo(tempRepo);
  });

  it("throws on `-C <repo root>` even from a temp repo — before any git process starts", () => {
    let thrown: unknown;
    try {
      git(tempRepo, ["-C", repoRoot, "commit", "-q", "-m", "this must never run"]);
    } catch (error) {
      thrown = error;
    }
    expect(thrown, "a relocated call must throw").toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/refusing to run/);
    expect((thrown as Error).message).toContain("-C");
    // Same proof as the tmpdir guard's: no child process was ever spawned.
    const asChildError = thrown as { status?: unknown; stderr?: unknown; pid?: unknown };
    expect(asChildError.status, "no child process exit status").toBeUndefined();
    expect(asChildError.stderr, "no child process stderr").toBeUndefined();
    expect(asChildError.pid, "no child process pid").toBeUndefined();
  });

  it("refuses every relocation option, in both spellings", () => {
    for (const flag of _internal.RELOCATION_FLAGS) {
      const target = flag === "--git-dir" ? join(repoRoot, ".git") : repoRoot;
      expect(() => git(tempRepo, [flag, target, "status"]), `${flag} <value>`).toThrow(
        /refusing to run/,
      );
      expect(() => git(tempRepo, [`${flag}=${target}`, "status"]), `${flag}=value`).toThrow(
        /refusing to run/,
      );
    }
    // The five, named — a shrinking set would be a silent widening.
    expect([..._internal.RELOCATION_FLAGS].sort()).toEqual([
      "--exec-path",
      "--git-dir",
      "--namespace",
      "--work-tree",
      "-C",
    ]);
  });

  it("refuses relocation even on a read-only verb — location is decided in one place", () => {
    expect(() => git(repoRoot, ["--git-dir", join(repoRoot, ".git"), "log"])).toThrow(
      /refusing to run/,
    );
  });

  it("refuses a relocation flag with no value at all", () => {
    expect(() => git(tempRepo, ["-C"])).toThrow(/refusing to run/);
  });

  it("still allows a value that is itself under tmpdir, and `-c`, which relocates nothing", () => {
    expect(() => git(tempRepo, ["-C", tempRepo, "status", "--porcelain"])).not.toThrow();
    expect(() => git(tempRepo, ["-c", "core.abbrev=12", "status", "--porcelain"])).not.toThrow();
  });
});
