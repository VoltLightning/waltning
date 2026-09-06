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
 * **Generic over nothing, and dependent on everything through parameters.**
 * `probe`, `wait` and the schedule are all arguments — `architecture/11`: a
 * unit here is one a test can drive with no bundler, no worker and no clock.
 * `apps/mobile/src/phone-ledger.web.ts` supplies the real three.
 */

import { errorFromThrown } from "@waltning/core/diagnostics";

export type WarmupResult =
  /** The engine answered. A synchronous call may now be made. */
  | { status: "warm" }
  /**
   * It did not, within the schedule. `error` is the last refusal — on the
   * browser this is the `DOMException` naming the held pool, which is exactly
   * the thing a caller needs to decide whether another attempt is worth
   * offering.
   */
  | { status: "cold"; error: Error };

/**
 * Runs `probe` once per entry in `delays`, waiting that many milliseconds
 * first. A zero entry runs immediately, so `[0, …]` costs nothing on the happy
 * path.
 */
export async function warmWorker(
  probe: () => Promise<void>,
  delays: readonly number[],
  wait: (ms: number) => Promise<void>,
): Promise<WarmupResult> {
  let last = new Error("the storage engine was never asked to warm up");
  for (const delay of delays) {
    if (delay > 0) await wait(delay);
    try {
      await probe();
      return { status: "warm" };
    } catch (caught) {
      last = errorFromThrown(caught);
    }
  }
  return { status: "cold", error: last };
}
