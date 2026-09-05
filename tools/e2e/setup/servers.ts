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
 * stop the child they just spawned if the readiness wait after it throws (or
 * the child itself reports a spawn error — see `raceWithChildError`), rather
 * than leaving an orphaned process for `global.ts` to never learn about.
 */

import { type ChildProcess, spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
} from "node:fs";
import { createServer } from "node:net";
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
 * Polls a log file until some line contains every one of `needles`, or
 * throws with the log's tail. Read as a whole each poll (not by offset,
 * unlike `tail`) — the file is still small at this point in a run, well
 * before a slow bundle's output could make that expensive.
 */
async function waitForLogLine(
  logFile: string,
  needles: readonly string[],
  options: { timeoutMs: number; label: string; intervalMs?: number },
): Promise<void> {
  const intervalMs = options.intervalMs ?? 100;
  const deadline = Date.now() + options.timeoutMs;

  for (;;) {
    if (existsSync(logFile)) {
      const lines = readFileSync(logFile, "utf8").split("\n");
      if (lines.some((line) => needles.every((needle) => line.includes(needle)))) return;
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `${options.label} never logged a line containing ${needles.map((n) => JSON.stringify(n)).join(" and ")} ` +
          `within ${options.timeoutMs}ms.\n\n${logFile}, last lines:\n${tail(logFile)}`,
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
 * never `""`. A falsy `raw` (`undefined` or `""`) uses `fallback` instead;
 * otherwise `raw` must match `/^\d+$/` before it is trusted to `Number()` at
 * all — `Number()`'s own parsing accepts things a port never is (`"3300.5"`,
 * `"  3300"`, `"0x3300"`, `"Infinity"`), and the regex rejects all of them
 * before they can reach the bounds check below.
 *
 * The value this returns is where `findFreePort` *starts* probing, not
 * necessarily the port a server ends up on — see its own doc.
 */
export function readPort(name: string, raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;

  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a positive integer TCP port — got ${JSON.stringify(raw)}.`);
  }
  const value = Number(raw);
  if (value <= 0 || value >= 65536) {
    throw new Error(
      `${name} must be an integer TCP port between 1 and 65535 — got ${JSON.stringify(raw)}.`,
    );
  }
  return value;
}

/**
 * One address family's half of `canBindPort`. `EADDRNOTAVAIL`/`EAFNOSUPPORT`
 * on `::1` mean this machine has no IPv6 loopback to worry about, not that
 * the port is busy — every other error (`EADDRINUSE`, most commonly) means
 * something is actually listening there.
 */
function tryBind(port: number, host: string): Promise<"bound" | "busy" | "unsupported"> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT") resolve("unsupported");
      else resolve("busy");
    });
    server.listen(port, host, () => {
      server.close(() => resolve("bound"));
    });
  });
}

/**
 * A port is free only if *this process* can bind it — on `127.0.0.1` and,
 * separately, on `::1`. A connect-test (dial the port, `ECONNREFUSED` means
 * nothing is there) cannot see a listener bound to one address family and
 * not the other: `127.0.0.1` and `::1` are different sockets, and something
 * bound only to the latter (`python3 -m http.server 8099 --bind ::1`, a
 * stray Node dev server defaulting to IPv6) would answer a bind-test on
 * `::1` with `EADDRINUSE` while a connect-test dialing `127.0.0.1` sees
 * nothing and calls the port free. A machine with no IPv6 loopback at all
 * has nothing to check there, which `tryBind`'s `"unsupported"` case covers.
 */
async function canBindPort(port: number): Promise<boolean> {
  if ((await tryBind(port, "127.0.0.1")) !== "bound") return false;
  const v6 = await tryBind(port, "::1");
  return v6 !== "busy";
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
 * Something else can still win that race. Closing it here (holding the
 * listening socket this function only tested with) would just move the same
 * race into whichever `bind()` call happened first; instead, `startApi`/
 * `startWeb` close it after the fact — see their own comments on exactly
 * what that check does and does not prove.
 */
export async function findFreePort(from: number, attempts = 50): Promise<number> {
  for (let port = from; port < from + attempts && port <= 65535; port++) {
    if (await canBindPort(port)) return port;
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
 * Runs `work`, but rejects immediately if `child` itself emits `"error"`
 * (failed to spawn at all — a missing binary, `EACCES`, and the like) —
 * without this, a spawn failure would leave `waitForHttp`/`waitForLogLine`
 * polling for up to their own full timeout for a process that was never
 * going to answer.
 */
function raceWithChildError<T>(child: ChildProcess, work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    child.once("error", onError);
    work.then(
      (value) => {
        child.off("error", onError);
        resolve(value);
      },
      // `unknown`, the same as a `catch` binding — a promise's rejection
      // reason is exactly that, and the language gives no more choice here
      // than it does there.
      (error: unknown) => {
        child.off("error", onError);
        reject(error);
      },
    );
  });
}

/**
 * `findFreePort` only proves a port was bindable at the moment it probed it;
 * something else can still bind it before `spawn()` runs. What follows
 * narrows that, in order, to no stronger a claim than the evidence supports:
 *
 * 1. **The child's own log says it bound this exact port.** For the API,
 *    that is `apps/api/src/index.ts`'s `server started` diagnostic —
 *    `{"scope":"server","phase":"started","port":<n>}`; for the web bundle,
 *    Metro's own `Waiting on http://localhost:<n>`. A `200` *before* this
 *    line exists is not this run's process answering — it is something
 *    else already on the port, which is exactly the failure `findFreePort`
 *    cannot rule out on its own (its TOCTOU window, stated on its own doc).
 * 2. **Only then does this wait for `200`.** Between 1 and this, nothing
 *    stops a *third* process from taking the port instead — that window is
 *    real and not closed by anything here.
 * 3. **The child must still be running.** `exitCode === null` after both of
 *    the above: a process that had already lost the port would show up as
 *    dead, not as a startup line with no `200` to follow.
 *
 * None of this is a lock. It is what turns "something on this port answered
 * 200" into "the log line, then the port, then the process — all three,
 * still this run's own" — which is the one shape of failure `00-smoke.
 * spec.ts` must never quietly pass against.
 */
async function waitForOwnProcess(
  child: ChildProcess,
  options: {
    logFile: string;
    logNeedles: readonly string[];
    logTimeoutMs: number;
    httpUrl: string;
    httpTimeoutMs: number;
    label: string;
    port: number;
    httpIntervalMs?: number;
  },
): Promise<void> {
  await raceWithChildError(
    child,
    waitForLogLine(options.logFile, options.logNeedles, {
      timeoutMs: options.logTimeoutMs,
      label: options.label,
    }),
  );
  await raceWithChildError(
    child,
    waitForHttp(options.httpUrl, {
      timeoutMs: options.httpTimeoutMs,
      label: options.label,
      logFile: options.logFile,
      ...(options.httpIntervalMs === undefined ? {} : { intervalMs: options.httpIntervalMs }),
    }),
  );

  if (child.exitCode !== null) {
    throw new Error(
      `${options.label} on port ${options.port} answered ready, but the process this run spawned ` +
        `for it has already exited (code ${child.exitCode}) — something else must have taken the ` +
        `port first. Re-run \`pnpm e2e\`.`,
    );
  }
}

/**
 * Spawns the API under test, pointed at the scratch database `global.ts`
 * just cloned, and waits for it to answer ready.
 *
 * `from` is where this starts probing (`global.ts`'s `E2E_API_PORT`, default
 * 3300) — the API can end up on a later port than that if the first is
 * busy; `url` on the returned `Server` is always the port it actually got,
 * and always `127.0.0.1` — never `localhost`, which resolves to whichever
 * address family the OS tries first and could reach a *different* socket
 * than the one `findFreePort` just proved free on both (`canBindPort`'s own
 * doc).
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
  const url = `http://127.0.0.1:${port}`;
  let child: ChildProcess | undefined;
  try {
    const logFd = openSync(logFile, "a");
    try {
      child = spawn("pnpm", ["--filter", "@waltning/api", "start"], {
        cwd: repoRoot,
        env: { ...process.env, APP_DATABASE_URL: appDatabaseUrl, API_PORT: String(port) },
        detached: true,
        stdio: ["ignore", logFd, logFd],
      });
    } finally {
      closeSync(logFd);
    }

    await waitForOwnProcess(child, {
      logFile,
      logNeedles: ['"scope":"server"', '"phase":"started"', `"port":${port}`],
      // 10s — the process logging that it bound should be near-instant;
      // the remaining budget is `httpTimeoutMs`'s, for the database
      // roundtrip `/readyz` itself makes.
      logTimeoutMs: 10_000,
      httpUrl: `${url}/readyz`,
      httpTimeoutMs: 30_000,
      label: "API",
      port,
    });

    return { url, stop: stopper(child) };
  } catch (error) {
    // `error`'s type is `unknown` — a catch binding is one of the few places
    // this repo allows it, since the language gives no choice.
    if (child) await stopper(child)();
    throw error;
  }
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
 * got, always as `127.0.0.1` — same reasoning as `startApi`'s own doc,
 * despite Metro's own log line always saying `localhost`.
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

  const logFile = logPath("web.log");
  const url = `http://127.0.0.1:${port}`;
  let child: ChildProcess | undefined;
  try {
    const logFd = openSync(logFile, "a");
    try {
      child = spawn(
        "pnpm",
        ["--filter", "@waltning/mobile", "exec", "expo", "start", "--web", "--port", String(port)],
        {
          cwd: repoRoot,
          env: { ...process.env, CI: "1", EXPO_NO_TELEMETRY: "1" },
          detached: true,
          stdio: ["ignore", logFd, logFd],
        },
      );
    } finally {
      closeSync(logFd);
    }

    await waitForOwnProcess(child, {
      logFile,
      logNeedles: [`Waiting on http://localhost:${port}`],
      // Metro logs this before it bundles anything — slower than the API's
      // own startup line, since it is still booting the bundler itself, but
      // much faster than a first full bundle. The bulk of the budget is
      // `httpTimeoutMs`'s, for that bundle.
      logTimeoutMs: 60_000,
      httpUrl: url,
      httpTimeoutMs: 180_000,
      httpIntervalMs: 1_000,
      label: "Web",
      port,
    });

    return { url, stop: stopper(child) };
  } catch (error) {
    // `error`'s type is `unknown` — a catch binding is one of the few places
    // this repo allows it, since the language gives no choice.
    if (child) await stopper(child)();
    throw error;
  }
}
