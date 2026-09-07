/**
 * `warmWorker` — wait until a platform's storage engine can answer, or report
 * why it never did.
 *
 * **Why this is a gate and not a retry loop around the real open.** The
 * browser's SQLite lives in a worker and its synchronous API is a spin on a
 * `SharedArrayBuffer` with a bounded iteration budget — about nine
 * milliseconds on an engine with `Atomics.pause`, which is every current
 * Chromium. A cold worker has to instantiate a ~620 KB wasm module and take a
 * file handle per pool slot before it can answer anything, so a synchronous
 * open against one does not fail with the reason it failed: it fails with
 * `Sync operation timeout`, which names nothing and can be classified as
 * nothing. The asynchronous API has no such budget. So the shape is: probe
 * asynchronously until the engine answers, and only then let a synchronous
 * caller near it. A probe that never succeeds hands back **its own** error,
 * which is the readable one.
 *
 * **Every attempt has a deadline, because "no answer" is a real outcome.** The
 * worker channel parks a deferred and posts a message; nothing in the driver
 * ever times that out, and a worker whose module cannot evaluate — a missing
 * wasm asset, a lost `Cross-Origin-Embedder-Policy` header — never installs
 * its `onmessage` handler at all. Awaiting that promise is awaiting forever,
 * and forever renders as a blank frame with no sentence, no button and no
 * diagnostic. So an attempt that outlives `deadlineMs` counts as a refusal
 * with a sentence of its own. A slow device loses nothing: the deadline is per
 * attempt, and the next attempt starts from a worker that is that much warmer.
 *
 * **Generic over nothing, and dependent on everything through parameters.**
 * `probe`, `wait` and the schedule are all arguments — `architecture/11`: a
 * unit here is one a test can drive with no bundler, no worker and no clock.
 * `apps/mobile/src/phone-ledger.web.ts` supplies the real ones.
 */

import { errorFromThrown } from "@waltning/core/diagnostics";

export type WarmupResult =
  /** The engine answered. A synchronous call may now be made. */
  | { status: "warm" }
  /**
   * It did not, within the schedule. `error` is the last refusal — on the
   * browser this is the `DOMException` naming the held pool, or this module's
   * own sentence when nothing answered at all — which is what a caller needs
   * to decide what the screen should say and whether to offer another attempt.
   */
  | { status: "cold"; error: Error };

export type WarmupSchedule = {
  /** One probe per entry, waiting that many milliseconds first. `0` runs at once. */
  delays: readonly number[];
  /** How long a single probe may take before it counts as no answer. */
  deadlineMs: number;
};

/** Named so a caller can tell "the engine refused" from "the engine said nothing". */
export const ENGINE_SILENT = "StorageEngineSilent";

function silence(deadlineMs: number): Error {
  const error = new Error(
    `the storage engine did not answer within ${deadlineMs}ms — its worker may not have loaded`,
  );
  error.name = ENGINE_SILENT;
  return error;
}

export async function warmWorker(
  probe: () => Promise<void>,
  schedule: WarmupSchedule,
  wait: (ms: number) => Promise<void>,
): Promise<WarmupResult> {
  let last = new Error("the storage engine was never asked to warm up");
  for (const delay of schedule.delays) {
    if (delay > 0) await wait(delay);
    // The deadline is expressed as a rejection so both ways of not answering
    // arrive at one `catch`. `Promise.race` attaches handlers to every input,
    // so whichever loses is still handled — a probe that settles late has
    // nowhere left to report to rather than becoming an unhandled rejection.
    try {
      await Promise.race([
        probe(),
        wait(schedule.deadlineMs).then(() => {
          throw silence(schedule.deadlineMs);
        }),
      ]);
      return { status: "warm" };
    } catch (caught) {
      last = errorFromThrown(caught);
    }
  }
  return { status: "cold", error: last };
}
