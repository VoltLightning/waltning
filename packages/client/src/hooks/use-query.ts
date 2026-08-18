/**
 * One asynchronous read, one state machine.
 *
 * Three feature hooks were written independently and came out **byte-identical
 * modulo the domain noun** — 33 lines each, the same `loading | ready | failed`
 * union, the same `live` cancellation flag, the same error normalisation. A
 * fourth partial copy lived in a route file and had already drifted: it
 * discarded the `Error` object the other three preserved.
 *
 * That is not three hooks. It is one hook, written four times, diverging — and
 * the divergence was in the part nothing tested.
 *
 * `CLAUDE.md`'s *no abstraction before the third use* does not block this; there
 * were four uses and the fourth was already inconsistent. It also is not really
 * an abstraction: it is the deletion of three copies.
 *
 * **What it deliberately does not do** is cache, retry, dedupe or refetch on
 * focus. Those are decisions about the offline replica (§14.3) and the `link`
 * state machine (`architecture/09`), neither of which exists. A hand-rolled half
 * of either would have to be unpicked before the real one lands — and this is
 * the file a future TanStack Query adoption replaces wholesale, which is only
 * possible while it stays this small.
 */

import { useEffect, useState } from "react";

export type Query<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "failed"; error: Error };

/**
 * @param run   the request. Re-run whenever `deps` change.
 * @param deps  React's own dependency list — a genuinely heterogeneous
 *              collection, which is the one place `unknown` belongs in a
 *              constraint position rather than as a placeholder
 *              (`architecture/10`, "Types: parameters, not escape hatches").
 */
export function useQuery<T>(run: () => Promise<T>, deps: readonly unknown[]): Query<T> {
  const [state, setState] = useState<Query<T>>({ status: "loading" });

  useEffect(() => {
    /**
     * **Ordering.** The familiar justification for this flag is "do not set
     * state after unmount", and under React 19 that one is obsolete: the
     * warning and the leak it described are both gone, and removing the flag
     * changes nothing observable about unmounting.
     *
     * What it still does is discard a stale response. When `deps` change the
     * effect re-runs before the first request settles, and without this an
     * earlier, slower answer overwrites a later one — page 1 rendered while
     * page 2 is on screen. `use-query.test.tsx` fails on exactly that when the
     * flag is removed, and passes on the unmount case either way.
     */
    let live = true;

    setState({ status: "loading" });

    run()
      .then((data) => {
        if (live) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        // The `Error` is preserved, not flattened to a message. A
        // `CaptiveResponseError` means the request was never answered by us,
        // which is a different thing to show than a refusal — and the type is
        // what says which.
        if (live) {
          setState({
            status: "failed",
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      });

    return () => {
      live = false;
    };
    // The list is the caller's, by design. `run` is a fresh closure every
    // render, so `deps` is how the caller declares its identity — the same
    // contract `useEffect` itself has, one level up. A literal array here would
    // defeat the entire point of a shared hook.
    // biome-ignore lint/correctness/useExhaustiveDependencies: the caller owns this list
  }, deps);

  return state;
}
