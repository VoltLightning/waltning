/**
 * `createLedgerGate` — the decisions between "the app started" and "the app
 * shows a failure screen", with every platform call taken as a parameter.
 *
 * **This exists because the decisions were the fragile part and the platform
 * file was the untestable part, and they were the same file.** What
 * `apps/mobile/src/phone-ledger.web.ts` holds is now `expo-sqlite` calls and
 * nothing else; what is here is: when may a synchronous open be attempted, what
 * does the screen say when it may not, what is worth another attempt, and what
 * is cached. None of that names a platform API — the one browser fact it knows
 * is a `DOMException` *name* — so `architecture/11`'s own seam rule puts it in
 * this package, where a test can drive it with four stubs and no worker.
 *
 * **The gate opens on an answer, not on a clock.** `ready()` is false while the
 * probe is running and true once it has settled *either way*; `start()` is what
 * reads which way. That split is deliberate: a gate that stayed shut on a
 * refusal would leave the caller rendering a blank frame with nothing to say,
 * and a gate that reported a refusal as readiness would hand a cold engine to
 * a synchronous caller. So the gate reports "settled" and the caller asks what
 * settled means.
 */

import { errorFromThrown } from "@waltning/core/diagnostics";
import { type WarmupResult, type WarmupSchedule, warmWorker } from "./warm-worker.ts";

/**
 * Which sentence a failure screen should say.
 *
 * Absent means "the ledger's own words": the failure came from the engine
 * *after* it answered — a migration refusing a file, a journal-mode claim the
 * file contradicts — and those are written for a person by the layer that
 * knows what is wrong. Present means the failure came from the platform
 * getting the engine up at all, where the only text available is a browser's
 * untranslated paragraph about an API method, and the screen says something of
 * its own instead.
 */
export type LedgerFailureCause =
  /** Another document holds the browser's storage lock. It gives it back. */
  | "ledgerBusy"
  /** The engine did not come up: no answer, no isolation headers, no wasm. */
  | "engineUnavailable";

export type LedgerFailed = {
  status: "failed";
  error: Error;
  retryable: boolean;
  cause?: LedgerFailureCause;
};

export type LedgerStartup<Controller> = { status: "ready"; controller: Controller } | LedgerFailed;

export type LedgerGate<Controller> = {
  /** `true` once the warm-up has settled, either way. */
  ready(): boolean;
  subscribe(listener: () => void): () => void;
  /** The startup outcome. Never makes a synchronous call against a cold engine. */
  start(): LedgerStartup<Controller>;
  /** Discard the outcome and warm again — `ready()` falls until it settles. */
  retry(): void;
};

export type LedgerGateOptions<Controller> = {
  /** One asynchronous round trip to the engine. Resolves iff it can answer. */
  probe: () => Promise<void>;
  /** The synchronous open, attempted only after `probe` has resolved. */
  open: () => Controller;
  /** Close whatever a failed `open` left holding the engine's locks. */
  release: () => void;
  schedule: WarmupSchedule;
  wait: (ms: number) => Promise<void>;
};

/**
 * The browser's own name for a storage lock another document holds. Normative
 * in the File System Access API for `createSyncAccessHandle`, so this is a
 * specification name rather than one engine's wording.
 *
 * **Matched on `name` alone, walking the cause chain.** An earlier version also
 * matched the string anywhere in a `message`, which a wrapped migration failure
 * can carry — the migrator interpolates the cause it caught into its own
 * sentence — and misclassifying that as a held pool now costs more than a
 * confusing word: the recoverable branch does not render the error's message at
 * all, so the migrator's account of the pre-migration copy it kept would be
 * replaced by "another tab has it open" and a button that re-runs the same
 * migration. The chain is walked instead, which reaches the same name without
 * reading prose.
 */
const POOL_CONTENTION = "NoModificationAllowedError";
const MAX_CAUSE_DEPTH = 8;

export function isPoolContention(error: Error): boolean {
  for (
    let step: Error | undefined = error, depth = 0;
    step && depth < MAX_CAUSE_DEPTH;
    depth += 1
  ) {
    if (step.name === POOL_CONTENTION) return true;
    step = step.cause instanceof Error ? step.cause : undefined;
  }
  return false;
}

/**
 * **A warm-up failure always offers another attempt, and never shows the
 * engine's words.** Both of its causes are about getting the engine up rather
 * than about the ledger: a held lock clears by itself, and an engine that did
 * not come up may be a slow device, a cold cache or a deployment that is being
 * fixed while someone looks at the screen. Neither has a sentence worth
 * showing — one is a paragraph about `createSyncAccessHandle`, the other a
 * timeout — so the screen says its own, and a button costs nothing and is the
 * only thing on offer.
 */
function warmupFailure(error: Error): LedgerFailed {
  return {
    status: "failed",
    error,
    retryable: true,
    cause: isPoolContention(error) ? "ledgerBusy" : "engineUnavailable",
  };
}

/**
 * **An open failure is the ledger's own, and terminal.** It happened after the
 * engine answered, so the layer that threw is the migrator or the session —
 * both of which write for a person — and it will throw the same thing next
 * time. The one exception is a lock lost between the probe and the open, which
 * is the warm-up's case arriving late.
 */
function openFailure(error: Error): LedgerFailed {
  return isPoolContention(error)
    ? { status: "failed", error, retryable: true, cause: "ledgerBusy" }
    : { status: "failed", error, retryable: false };
}

export function createLedgerGate<Controller>(
  options: LedgerGateOptions<Controller>,
): LedgerGate<Controller> {
  /** `null` while the probe is running — the caller renders its blank frame. */
  let warmup: WarmupResult | null = null;
  let startup: LedgerStartup<Controller> | null = null;
  const listeners = new Set<() => void>();

  function announce() {
    for (const listener of listeners) listener();
  }

  function warm(): void {
    warmup = null;
    announce();
    void warmWorker(options.probe, options.schedule, options.wait).then((result) => {
      warmup = result;
      announce();
    });
  }

  warm();

  return {
    ready: () => warmup !== null,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    start() {
      if (startup) return startup;

      // **The cold branch, and it is the first statement for a reason.** A
      // synchronous open against an engine that never answered cannot report
      // why it failed — the driver's spin budget expires first and the only
      // thing that surfaces is its own timeout, which names no cause. The
      // probe's refusal is the readable account of the same condition.
      if (warmup?.status !== "warm") {
        return warmupFailure(
          warmup?.error ?? new Error("the storage engine has not been asked yet"),
        );
      }

      try {
        startup = { status: "ready", controller: options.open() };
        return startup;
      } catch (caught) {
        // `catch` bindings are `unknown` because the language gives no choice.
        const failure = openFailure(errorFromThrown(caught));
        options.release();
        // **A success is cached and a retryable failure is not.** A session is
        // a singleton and a refusal is a fact about a file; a lock is neither,
        // and caching it would make "Try again" a button that re-renders the
        // same sentence.
        if (!failure.retryable) startup = failure;
        return failure;
      }
    },

    retry() {
      startup = null;
      warm();
    },
  };
}
