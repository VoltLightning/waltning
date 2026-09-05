/**
 * The two processes tier 2 drives: the API under test and its own dedicated
 * Expo web bundle, each started and stopped by `global.ts`'s own
 * `globalSetup`.
 *
 * **Why not Playwright's `webServer`.** `webServer` starts before
 * `globalSetup` runs, and the API this suite drives must be pointed at a
 * database that only `globalSetup` creates (`database.ts`'s `createScratch`)
 * — there is no `APP_DATABASE_URL` to hand it until the scratch clone exists.
 * `globalSetup` owning the whole lifecycle, in order, is the only sequencing
 * that works; `servers.ts` is the part of it that knows how to start, wait
 * for, and stop a process.
 *
 * **Every step here is unwound by hand on the way out**, success or failure
 * — `global.ts`'s own header explains why (`globalSetup` throwing gets no
 * teardown from Playwright), and it is why `startApi`/`startWeb` themselves
 * stop the child they just spawned if the readiness wait after it throws,
 * rather than leaving an orphaned process for `global.ts` to never learn
 * about.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readSync, statSync } from "node:fs";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";

export type Server = {
  url: string;
  stop: () => Promise<void>;
};

/** `tools/e2e/setup/` → the repo root, same resolution `database.ts` uses. */
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

/** Gitignored — see `.gitignore`. Never the place to look for what a spec asserted; only for why a process never came up. */
const LOG_DIR = fileURLToPath(new URL("../.logs", import.meta.url));

/** Truncated (`"w"`), not appended, so a log never carries a previous run's output into this one's error message. */
function logPath(name: string): string {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
  const path = `${LOG_DIR}/${name}`;
  closeSync(openSync(path, "w"));
  return path;
}

/** Bounds a single read regardless of how long a run has been writing to the file — a slow Metro bundle's log can run to megabytes. */
const TAIL_BYTES = 64 * 1024;

/** The log file's last 64 KiB, for an error message — read by offset, never the whole file. */
function tail(file: string): string {
  if (!existsSync(file)) return "(no log file)";
  const { size } = statSync(file);
  if (size === 0) return "(empty log file)";

  const length = Math.min(size, TAIL_BYTES);
  const buffer = Buffer.alloc(length);
  const fd = openSync(file, "r");
  try {
    readSync(fd, buffer, 0, length, size - length);
  } finally {
    closeSync(fd);
  }
  return buffer.toString("utf8").trimEnd();
}

/** A single attempt must not itself be able to hang past the overall deadline — a server that accepts a connection and never answers would otherwise block every retry behind it. */
const ATTEMPT_TIMEOUT_MS = 5_000;

/**
 * Polls `url` until it answers `200`, or throws with the log's tail — the
 * only way to say *why* a process never came up rather than just that it
 * didn't.
 */
export async function waitForHttp(
  url: string,
  options: { timeoutMs: number; label: string; logFile: string; intervalMs?: number },
): Promise<void> {
  const intervalMs = options.intervalMs ?? 250;
  const deadline = Date.now() + options.timeoutMs;

  for (;;) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) });
      if (res.status === 200) return;
    } catch {
      // Not up yet — connection refused (or a single attempt timing out) is
      // the expected state until it is.
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `${options.label} never answered 200 at ${url} within ${options.timeoutMs}ms.\n\n` +
          `${options.logFile}, last lines:\n${tail(options.logFile)}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Reads a port number from an env var (`E2E_API_PORT`, `E2E_WEB_PORT`) that
 * may be *explicitly empty* — `E2E_API_PORT=` in `.env` is a real line, not
 * an absent one. `Number(raw ?? fallback)` would turn that into
 * `Number("")`, which is `0`: `??` only stands in for `undefined`/`null`,
 * never `""`. `||` treats empty the same as unset, and the bounds check below
 * catches everything else that is not a real TCP port: `NaN` from a typo,
 * negative, zero, or `65536`+.
 *
 * The value this returns is where `findFreePort` *starts* probing, not
 * necessarily the port a server ends up on — see its own doc.
 */
export function readPort(name: string, raw: string | undefined, fallback: number): number {
  const value = Number(raw || fallback);
  if (!Number.isInteger(value) || value <= 0 || value >= 65536) {
    throw new Error(
      `${name} must be an integer TCP port between 1 and 65535 — got ${JSON.stringify(raw)}.`,
    );
  }
  return value;
}

/**
 * `true` only if nothing answers a raw TCP connection within a second. A
 * connection attempt that neither connects nor errors in that window is
 * treated as busy too — something is there and not behaving like an open
 * port normally would, which this has no business waiting out.
 */
async function isPortFree(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = connect({ port, host: "127.0.0.1" });
    socket.setTimeout(1_000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      resolve(true);
    });
  });
}

/**
 * Ports are found, not refused on. A stale process squatting on the default
 * (`3300`, `8082`) is common enough — a previous run's API left running by a
 * killed terminal, a developer's own server — that failing the whole suite
 * over it would train people to go find and kill it by hand every time
 * instead of just trying the next port, which is all this run actually
 * needs.
 *
 * **This is a probe, not a reservation — there is a real TOCTOU window
 * between it and the `spawn()` a caller makes with the port it returns.**
 * Something else can still win that race. Closing it here (binding the port
 * this function only tested) would just move the same race into whichever
 * `bind()` call happened first; instead, `startApi`/`startWeb` close it
 * after the fact, by checking that the child *they* spawned is still the
 * one running once the readiness probe answers — see their own comments.
 */
export async function findFreePort(from: number, attempts = 50): Promise<number> {
  for (let port = from; port < from + attempts && port <= 65535; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free TCP port found in ${from}..${Math.min(from + attempts - 1, 65535)}.`);
}

/**
 * Kills the process group `child` leads (`detached: true` gave it one), so a
 * `tsx`/Expo child dies with it rather than surviving as an orphan. `SIGKILL`
 * follows after 5s only if `SIGTERM` was ignored.
 */
function stopper(child: ChildProcess): () => Promise<void> {
  return () =>
    new Promise((resolve) => {
      const pid = child.pid;
      if (pid === undefined || child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }

      const timer = setTimeout(() => {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          // Already gone between the timer firing and this running.
        }
      }, 5_000);

      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });

      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        // Already gone — the "exit" listener above still resolves.
      }
    });
}

/**
 * `findFreePort` proves a port was free at the moment it probed it; nothing
 * stops another process from binding it in the gap before `spawn()` runs.
 * A `200` from the readiness endpoint alone cannot tell "this run's own
 * child answered" from "something else won the race and is answering
 * instead" — but combined with the spawned child *still running*
 * (`exitCode === null`), it can: a process that beat this one to the port
 * would leave this child dead on arrival (its own `listen()` refused), not
 * quietly not-answering. Checking both is what turns "probably ours" into
 * "ours".
 */
function assertOwnProcessAnswered(child: ChildProcess, label: string, port: number): void {
  if (child.exitCode !== null) {
    throw new Error(
      `${label} on port ${port} answered ready, but the process this run spawned for it has ` +
        `already exited (code ${child.exitCode}) — something else must have taken the port ` +
        `first. Re-run \`pnpm e2e\`.`,
    );
  }
}

/**
 * Spawns the API under test, pointed at the scratch database `global.ts`
 * just cloned, and waits for it to answer ready.
 *
 * `from` is where this starts probing (`global.ts`'s `E2E_API_PORT`, default
 * 3300) — the API can end up on a later port than that if the first is
 * busy; `url` on the returned `Server` is always the port it actually got.
 *
 * `/readyz`, not `/healthz` (`apps/api/src/http/health.ts`): `/healthz`
 * proves only that the process is up, and this suite needs proof the API
 * reached *this* run's Postgres — `/readyz`'s `ok` follows the database alone
 * (MinIO is reported, never required — `health.ts`'s own `readiness()`), and
 * nothing in this stack configures `MINIO_ENDPOINT`, so it turns green on the
 * database check without ever waiting on a dependency this run has no
 * container for.
 */
export async function startApi(options: { appDatabaseUrl: string; from: number }): Promise<Server> {
  const { appDatabaseUrl, from } = options;
  const port = await findFreePort(from);
  console.log(`[e2e] API → port ${port}`);

  const logFile = logPath("api.log");
  const logFd = openSync(logFile, "a");
  const child = spawn("pnpm", ["--filter", "@waltning/api", "start"], {
    cwd: repoRoot,
    env: { ...process.env, APP_DATABASE_URL: appDatabaseUrl, API_PORT: String(port) },
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  closeSync(logFd);

  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForHttp(`${url}/readyz`, { timeoutMs: 30_000, label: "API", logFile });
    assertOwnProcessAnswered(child, "API", port);
  } catch (error) {
    // `error`'s type is `unknown` — a catch binding is one of the few places
    // this repo allows it, since the language gives no choice.
    await stopper(child)();
    throw error;
  }

  return { url, stop: stopper(child) };
}

/**
 * Spawns tier 2's own Expo web bundle, on its own dedicated port, and waits
 * for it to answer ready.
 *
 * **Never a developer's own Metro.** This used to reuse whatever answered on
 * `:8081` — the default port a developer's own `pnpm dev:web` binds to — on
 * the theory that the web build is stateless with respect to its server.
 * That theory is true of the *API*, never of the browser it runs in: OPFS is
 * scoped per *origin*, and every port is its own origin, so a developer's
 * `:8081` tab and this suite sharing that port would have shared one SQLite
 * worker and one bootstrapped ledger between a person's own testing and this
 * suite's writes. A dedicated port (`from` — `global.ts`'s `E2E_WEB_PORT`,
 * default 8082 — or the next free one after it) keeps tier 2's origin, and
 * therefore its ledger, its own — never touching `:8081` and never touched
 * by it. `url` on the returned `Server` names whichever port it actually
 * got, same as `startApi`.
 *
 * `EXPO_NO_TELEMETRY: "1"` alongside `CI: "1"` — non-interactive (no
 * keyboard shortcuts to answer, no reload prompts) and no telemetry ping a
 * test run has no reason to make. Metro's first bundle is slow, so the
 * budget is 180s, not the API's 30s.
 */
export async function startWeb(options: { from: number }): Promise<Server> {
  const { from } = options;
  const port = await findFreePort(from);
  console.log(`[e2e] Web → port ${port}`);

  const url = `http://localhost:${port}`;
  const logFile = logPath("web.log");
  const logFd = openSync(logFile, "a");
  const child = spawn(
    "pnpm",
    ["--filter", "@waltning/mobile", "exec", "expo", "start", "--web", "--port", String(port)],
    {
      cwd: repoRoot,
      env: { ...process.env, CI: "1", EXPO_NO_TELEMETRY: "1" },
      detached: true,
      stdio: ["ignore", logFd, logFd],
    },
  );
  closeSync(logFd);

  try {
    await waitForHttp(url, {
      timeoutMs: 180_000,
      label: "web bundle",
      logFile,
      intervalMs: 1_000,
    });
    assertOwnProcessAnswered(child, "Web", port);
  } catch (error) {
    // `error`'s type is `unknown` — a catch binding is one of the few places
    // this repo allows it, since the language gives no choice.
    await stopper(child)();
    throw error;
  }

  return { url, stop: stopper(child) };
}
