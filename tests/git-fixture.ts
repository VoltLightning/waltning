/**
 * The one place a test may spin up a real, disposable git repository.
 *
 * This exists because of a real incident: `tests/verify-visual-gate.test.ts`
 * once built its own "isolated" temp repo with a bare `{ cwd: dir }` on each
 * `execFileSync("git", …)` call. Run from a shell it was fine. Run once
 * through this repo's own pre-commit hook, it committed two commits onto
 * `feature/gate-speed`'s real history and wrote a stray `[user]` section and
 * a `core.worktree` override into the *shared* `.git/config` — because git
 * exports `GIT_DIR` (and, mid-commit, `GIT_INDEX_FILE`) into every hook and
 * everything the hook spawns, so hook subprocesses share the commit in
 * progress's repository and index. An explicit `GIT_DIR` overrides `-C` and
 * cwd both — repository *discovery* never runs when `GIT_DIR` already says
 * where the repository is — so the "isolated" temp repo's `git init` created
 * a `.git` nobody ever used, and every call after it quietly ran against the
 * real repository. Two other worktrees on this machine got a bogus commit
 * identity out of it, one of them not even the worktree that ran this test.
 *
 * Every function below is built around not repeating that: `-C dir` instead
 * of `cwd`, every inherited `GIT_*` variable stripped before it can reach a
 * child process, a fixture identity that never touches any `.git/config`,
 * `GIT_CEILING_DIRECTORIES` so discovery cannot walk upward even before
 * `git init` has run, and a hard `rev-parse --show-toplevel` check before
 * anything that mutates.
 *
 * The outermost of those guards needs no `git` process at all: a verb this
 * module cannot read as one of a short read-only list is refused outright
 * unless the target directory is under `os.tmpdir()`. `git init` in the
 * wrong place cannot be detected after the fact — it has already made a
 * repository — so the check has to happen on the argument list, before the
 * child process exists.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

/**
 * Never a `git config` call, which is itself a mutating write — the exact
 * shape of write that leaked into the shared config last time. `commit` is
 * the only command that reads these; every other command ignores them.
 */
const FIXTURE_IDENTITY: Readonly<Record<string, string>> = Object.freeze({
  GIT_AUTHOR_NAME: "gate-test-fixture",
  GIT_AUTHOR_EMAIL: "gate-test-fixture@example.invalid",
  GIT_COMMITTER_NAME: "gate-test-fixture",
  GIT_COMMITTER_EMAIL: "gate-test-fixture@example.invalid",
});

/** Every inherited `GIT_*` variable removed — the fixture identity is added back by the caller. */
function stripGitEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith("GIT_") && value !== undefined) kept[key] = value;
  }
  return kept;
}

/**
 * Throws if `env` carries any `GIT_*` key other than the ones this fixture
 * deliberately set. This is the check M-a asked for run *before* `git init`
 * specifically: `init` is a write with no repository yet to `rev-parse
 * --show-toplevel` against, so an environment-level assertion is the only
 * guard available for that first call — every call after it also gets this,
 * plus `assertIsolated`.
 */
function assertNoLeakedGitEnv(env: Record<string, string>): void {
  const allowed = new Set(["GIT_CEILING_DIRECTORIES", ...Object.keys(FIXTURE_IDENTITY)]);
  const leaked = Object.keys(env).filter((key) => key.startsWith("GIT_") && !allowed.has(key));
  if (leaked.length > 0) {
    throw new Error(`git fixture: environment still carries ${leaked.join(", ")} after stripping`);
  }
}

/**
 * The verbs that cannot change a repository. Everything else is mutating,
 * including verbs nobody thought of — an argument list this module cannot
 * read as one of these is treated as a write, never waved through.
 *
 * `config` is deliberately absent: `git config x y` writes, and writing a
 * `[user]` section into the *shared* `.git/config` is precisely the damage
 * this file's header describes. Only `config --get` reads, and
 * {@link isReadOnlyGitArgs} spells that one case out.
 */
const READ_ONLY_VERBS: ReadonlySet<string> = new Set([
  "rev-parse",
  "status",
  "diff",
  "log",
  "ls-files",
  "check-ignore",
]);

/** Git options that swallow the next argument, so the verb is not the token after them. */
const VALUE_FLAGS: ReadonlySet<string> = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--exec-path",
  "--super-prefix",
]);

/**
 * Whether `args` is provably a read-only `git` invocation.
 *
 * "Provably" is the whole point: no verb at all, a verb this module does not
 * recognise, or a verb that is not a literal string (a variable, an
 * interpolation, an array built somewhere else) all answer **false**. An
 * unreadable argument list is a write until shown otherwise — the opposite
 * default is how `git init`/`add`/`commit` reached this repository's real
 * history once already.
 *
 * Shared with `tests/git-fixture-boundary.test.ts`, which feeds it argument
 * lists it lexed out of source files, with every non-literal token replaced
 * by {@link UNRESOLVED}. One allowlist, two callers.
 */
function isReadOnlyGitArgs(args: readonly string[]): boolean {
  let i = 0;
  while (i < args.length) {
    const arg = args[i] ?? "";
    if (VALUE_FLAGS.has(arg)) {
      i += 2;
      continue;
    }
    if (arg.startsWith("-")) {
      i += 1;
      continue;
    }
    if (arg === "config") return args[i + 1] === "--get";
    return READ_ONLY_VERBS.has(arg);
  }
  return false;
}

/** The token a caller substitutes for an argument it could not resolve to a string literal. */
const UNRESOLVED = "\u0000unresolved";

/** `os.tmpdir()` resolved through every symlink — on macOS `/var/folders/…` is really `/private/var/folders/…`. */
const TMP_ROOT = realpathSync(tmpdir());

function isUnderTmp(dir: string): boolean {
  const real = existsSync(dir) ? realpathSync(dir) : resolve(dir);
  return real === TMP_ROOT || real.startsWith(TMP_ROOT + sep);
}

/**
 * The guard that runs *before* the child process exists.
 *
 * `assertIsolated` cannot help here: it asks git where the repository is,
 * which means spawning git — and `git init` outside a temp directory has
 * already done its damage by the time anything can be asked. So a mutating
 * verb against a directory that is not under `os.tmpdir()` is refused on the
 * argument list alone, with no `git` process started at all. `init` is
 * mutating like every other write, so it is covered by the same rule rather
 * than a second one.
 */
function assertMutationAllowed(dir: string, args: readonly string[]): void {
  if (isReadOnlyGitArgs(args)) return;
  if (isUnderTmp(dir)) return;
  throw new Error(
    `git fixture: refusing to run \`git ${args.join(" ")}\` in ${dir} — ` +
      `it is not a read-only command and ${dir} is not under ${TMP_ROOT}. ` +
      "Mutating git commands belong in a disposable repository from createTempGitRepo().",
  );
}

/**
 * The only sanctioned way any test invokes the `git` executable with a
 * mutating verb — `tests/git-fixture-boundary.test.ts` enforces that
 * directly. Always `-C dir`, never a bare `cwd`.
 */
export function git(dir: string, args: string[]): string {
  assertMutationAllowed(dir, args);
  const env = {
    ...stripGitEnv(process.env),
    GIT_CEILING_DIRECTORIES: dir,
    ...FIXTURE_IDENTITY,
  };
  assertNoLeakedGitEnv(env);
  return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", env });
}

/**
 * The hard stop before any caller runs `add`/`commit`/etc. against `dir`.
 * If `-C dir rev-parse --show-toplevel` does not report back exactly `dir`,
 * something about this environment makes "isolated temp repo" not mean what
 * it says, and the caller must refuse rather than find out by writing to
 * the real repository's history.
 */
export function assertIsolated(dir: string): void {
  const toplevel = realpathSync(git(dir, ["rev-parse", "--show-toplevel"]).trim());
  const real = realpathSync(dir);
  if (toplevel !== real) {
    throw new Error(
      `temp repo isolation failed: "git -C ${dir} rev-parse --show-toplevel" reported ` +
        `${toplevel}, not ${real} — refusing to run git add/commit anywhere near this`,
    );
  }
}

/** A fresh, isolated, empty git repository under the OS temp directory. Caller owns cleanup via {@link removeTempGitRepo}. */
export function createTempGitRepo(prefix = "gate-hook-"): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  git(dir, ["init", "-q"]);
  assertIsolated(dir);
  return dir;
}

export function removeTempGitRepo(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** Exported for this module's own tests only — not part of the fixture's public contract. */
export const _internal = {
  stripGitEnv,
  assertNoLeakedGitEnv,
  isReadOnlyGitArgs,
  isUnderTmp,
  FIXTURE_IDENTITY,
  READ_ONLY_VERBS,
  VALUE_FLAGS,
  UNRESOLVED,
  TMP_ROOT,
};
