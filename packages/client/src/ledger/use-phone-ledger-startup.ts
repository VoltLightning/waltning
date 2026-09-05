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
 */

import { useMemo } from "react";

export function usePhoneLedgerStartup<T>(ready: boolean, start: () => T): T | null {
  // biome-ignore lint/correctness/useExhaustiveDependencies: `ready` is the trigger — `start` runs once, the moment it turns true, not whenever a caller's `start` reference changes.
  return useMemo(() => (ready ? start() : null), [ready]);
}
