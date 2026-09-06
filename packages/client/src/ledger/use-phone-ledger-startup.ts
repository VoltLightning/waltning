/**
 * `usePhoneLedgerStartup` — the hook half of the fix for a ledger session
 * that used to open at module scope: a throw there broke the layout module's
 * own evaluation, so expo-router reported a missing default export and
 * crashed on its own `ErrorBoundary` instead of showing a screen.
 *
 * **Generic over `T`, not tied to one app's `PhoneLedgerStartup` shape.**
 * Each of `apps/mobile/src/phone-ledger.ts` / `.native.ts` / `.web.ts`
 * declares its own `PhoneLedgerStartup` union (`architecture/11` — no
 * type-only re-export), so this hook takes `start`'s return type as a type
 * parameter rather than importing a type from an app, which no package may
 * do.
 *
 * **`null` until `ready`, then the value, once.** `ready` is the platform's
 * own signal that a synchronous call will not hang — constant `true` on the
 * device, and the worker-warm flag in the browser (`phone-ledger.web.ts`) —
 * so a caller renders a blank frame until the platform can answer, then
 * calls `start` exactly once and keeps its result for the life of the
 * component. `start` is a parameter, never imported, so a test can hand it a
 * stub with no bundler involved (`architecture/11` — a hook takes its
 * dependencies as parameters). It never throws in this codebase's own
 * variants — each wraps its own `try`/`catch` and returns `{ status:
 * "failed" }` — so there is nothing here for this hook to catch.
 *
 * **A `useRef` guard, not `useMemo`.** `useMemo` is a cache React is free to
 * discard and recompute — StrictMode's double-invoke of a render function
 * relies on exactly that freedom to surface impure renders — so a memo is
 * the wrong tool for "call this at most once, ever, no matter how many times
 * this component re-renders." Two refs, checked and set during render rather
 * than in an effect: `started` flips before `start()` is called, so the
 * second of a StrictMode double-render sees it already true and skips the
 * call; `result` holds what the first call returned, for every render after.
 *
 * **`retry` is "once" made repeatable, not abandoned.** Some startup failures
 * clear by themselves — the browser's SQLite worker holds its files for one
 * document at a time, so a page loaded seconds after the last one can find
 * the pool still held and open again fine a moment later — and a screen that
 * can only tell someone to relaunch is the wrong answer to that. So the
 * guard is resettable: `retry()` clears both refs and asks React for another
 * render, and the render that follows takes the same "at most once" path it
 * always did. Everything about the hook's shape survives it, including the
 * StrictMode property: the second of the pair still sees `started` already
 * flipped by the first.
 */

import { useCallback, useRef, useState } from "react";

export type PhoneLedgerStartupState<T> = {
  /** `null` until `ready`, then whatever `start` last returned. */
  startup: T | null;
  /** Discard that answer and start once more, on the next render. */
  retry: () => void;
};

export function usePhoneLedgerStartup<T>(
  ready: boolean,
  start: () => T,
): PhoneLedgerStartupState<T> {
  const started = useRef(false);
  const result = useRef<T | null>(null);
  // The refs alone would change nothing anyone can see — a ref write is not a
  // render. This counter's only job is to ask for the render that re-runs the
  // guard below; its value is never read.
  const [, setAttempt] = useState(0);

  const retry = useCallback(() => {
    started.current = false;
    result.current = null;
    setAttempt(nextAttempt);
  }, []);

  if (ready && !started.current) {
    started.current = true;
    result.current = start();
  }

  return { startup: result.current, retry };
}

function nextAttempt(attempt: number): number {
  return attempt + 1;
}
