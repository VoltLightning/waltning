/**
 * `useTimer` — a single-shot delay, own file per `architecture/11`'s "every
 * hook has its own file".
 *
 * `Toast` fires at 4 s and `UndoToast` at 8 s (§8.4), and `UndoToast`'s
 * rapid-repeat collapse (`design-system/08` §8.4 — "rapid repeats collapse
 * into one toast with a count") means the same toast instance can be handed a
 * new `resetKey` while it is already showing, and the 8 s must start over from
 * that moment rather than from when the toast first mounted.
 *
 * `onExpire` is read through a ref rather than listed as a dependency: the
 * caller's callback closes over fresh props on every render, and re-arming the
 * timer whenever *that* identity changes — rather than only when `resetKey`
 * does — would restart the countdown on every unrelated re-render.
 */

import { useEffect, useRef } from "react";

export function useTimer(durationMs: number, onExpire: () => void, resetKey: unknown): void {
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  // `resetKey` is not read in the body — it is the re-arm signal itself, the
  // one dependency this hook exists to add. Removing it (the lint's own
  // suggested fix) would delete the rapid-repeat behaviour it implements.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey re-arms the timer by identity, not by being read.
  useEffect(() => {
    const id = setTimeout(() => onExpireRef.current(), durationMs);
    return () => clearTimeout(id);
  }, [durationMs, resetKey]);
}
