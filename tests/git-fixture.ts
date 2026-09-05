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
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
 * The only sanctioned way any test invokes the `git` executable with a
 * mutating verb — `tests/git-fixture-boundary.test.ts` enforces that
 * directly. Always `-C dir`, never a bare `cwd`.
 */
export function git(dir: string, args: string[]): string {
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
export const _internal = { stripGitEnv, assertNoLeakedGitEnv, FIXTURE_IDENTITY };
