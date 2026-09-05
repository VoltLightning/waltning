/**
 * The two processes tier 2 drives: the API under test and the Expo web
 * bundle, each started and stopped by `global.ts`'s own `globalSetup`.
 *
 * **Why not Playwright's `webServer`.** `webServer` starts before
 * `globalSetup` runs, and the API this suite drives must be pointed at a
 * database that only `globalSetup` creates (`database.ts`'s `createScratch`)
 * — there is no `APP_DATABASE_URL` to hand it until the scratch clone exists.
 * `globalSetup` owning the whole lifecycle, in order, is the only sequencing
 * that works; `servers.ts` is the part of it that knows how to start, wait
 * for, and stop a process.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
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

function logPath(name: string): string {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
  return `${LOG_DIR}/${name}`;
}

/** The log file's last lines, for an error message — not the whole file, which can be megabytes after a slow Metro bundle. */
function tail(file: string, lines = 40): string {
  if (!existsSync(file)) return "(no log file)";
  const content = readFileSync(file, "utf8").trimEnd();
  if (!content) return "(empty log file)";
  return content.split("\n").slice(-lines).join("\n");
}

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
      const res = await fetch(url);
      if (res.status === 200) return;
    } catch {
      // Not up yet — connection refused is the expected state until it is.
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

/** Any HTTP response at all — used only to detect a server already running, never to judge whether it is ready. */
async function answers(url: string): Promise<boolean> {
  try {
    await fetch(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * A stale process already on the port cannot be reused: every scratch
 * database is uniquely named (`scratch.ts`'s own `pid` + counter), so
 * whatever that process was pointed at is not the database this run just
 * cloned — most likely it no longer exists at all. Refusing loudly, naming
 * the port, is cheaper than a `00-smoke.spec.ts` that passes against the
 * wrong server.
 */
async function assertPortFree(port: number, label: string): Promise<void> {
  const inUse = await new Promise<boolean>((resolve) => {
    const socket = connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      resolve(false);
    });
  });

  if (inUse) {
    throw new Error(
      `${label} port ${port} is already in use. A stale process there is pointed at a ` +
        `database this run did not create — stop it before running \`pnpm e2e\` again.`,
    );
  }
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
 * Spawns the API under test, pointed at the scratch database `global.ts`
 * just cloned, and waits for it to answer ready.
 *
 * `/readyz`, not `/healthz` (`apps/api/src/http/health.ts`): `/healthz`
 * proves only that the process is up, and this suite needs proof the API
 * reached *this* run's Postgres — `/readyz`'s `ok` follows the database alone
 * (MinIO is reported, never required — `health.ts`'s own `readiness()`), and
 * nothing in this stack configures `MINIO_ENDPOINT`, so it turns green on the
 * database check without ever waiting on a dependency this run has no
 * container for.
 *
 * Combined with `assertPortFree` above, a `200` here can only be this run's
 * own process: nothing else held the port when this started, this is the one
 * process this run bound to it, and nothing else could have taken it in
 * between — which is exactly what keeps `00-smoke.spec.ts` from ever passing
 * against a developer's own API on a different port.
 */
export async function startApi(options: { appDatabaseUrl: string; port: number }): Promise<Server> {
  const { appDatabaseUrl, port } = options;
  await assertPortFree(port, "API");

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
  await waitForHttp(`${url}/readyz`, { timeoutMs: 30_000, label: "API", logFile });

  return { url, stop: stopper(child) };
}

/**
 * Reuses an already-running web bundle at `port` — a developer's own Metro,
 * left running, is the common case — because the web build is stateless with
 * respect to the server it is served from: arc-phone is local-first, and the
 * browser bootstraps its own reference currencies
 * (`apps/mobile/src/phone-ledger.web.ts`) rather than asking it for them.
 *
 * Otherwise this starts one, non-interactively (`CI: "1"` — no keyboard
 * shortcuts to answer, no reload prompts). Metro's first bundle is slow, so
 * the budget is 180s, not the API's 30s.
 */
export async function startWeb(options: { port: number }): Promise<Server> {
  const { port } = options;
  const url = `http://localhost:${port}`;

  if (await answers(url)) {
    return { url, stop: async () => {} };
  }

  const logFile = logPath("web.log");
  const logFd = openSync(logFile, "a");
  const child = spawn("pnpm", ["--filter", "@waltning/mobile", "exec", "expo", "start", "--web"], {
    cwd: repoRoot,
    env: { ...process.env, CI: "1" },
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  closeSync(logFd);

  await waitForHttp(url, {
    timeoutMs: 180_000,
    label: "web bundle",
    logFile,
    intervalMs: 1_000,
  });

  return { url, stop: stopper(child) };
}
