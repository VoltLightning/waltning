/**
 * `useReducedMotion` — the `motion-none` branch, as a hook.
 *
 * §2.7: *every animation needs the `motion-none` branch*, and `design-system/10`
 * carries reduced motion as an open gap. The selection controls are the first
 * animations added since that gap was written down, so they take the branch
 * from day one rather than joining the backlog — an animated control asks this
 * hook and runs its transition at zero duration when the answer is yes.
 *
 * **Why zero duration rather than skipping the animation**: the end state is
 * produced by the same code path either way, so the reduced-motion branch
 * cannot drift into showing something different — it shows the same thing,
 * immediately. A separate "static" branch is a second implementation that stops
 * being tested the week after it is written.
 *
 * `AccessibilityInfo` is the one cross-platform answer: iOS Reduce Motion,
 * Android's "remove animations", and `prefers-reduced-motion` on web, all
 * behind the same call. Wrapped in try/catch because a jsdom test has no native
 * module and the correct answer there is the default, not a crash.
 */

import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    // Each call guarded on its own: `react-native-web` implements the query
    // but hands back nothing removable from `addEventListener` under jsdom,
    // so one try around both would lose the query to the listener's failure.
    // Either way the answer falls back to false — motion stays on, which is
    // the default the platform itself would report.
    try {
      void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
        if (mounted) setReduced(value);
      });
    } catch {
      // No native module in this environment.
    }
    let subscription: { remove?: () => void } | undefined;
    try {
      subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    } catch {
      // Changes go unobserved; the initial answer above still applied.
    }
    return () => {
      mounted = false;
      try {
        subscription?.remove?.();
      } catch {
        // A listener that cannot be removed in a test environment leaks
        // nothing the test outlives.
      }
    };
  }, []);

  return reduced;
}
