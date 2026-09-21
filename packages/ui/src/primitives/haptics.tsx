/**
 * The device's touch feedback, as a value the app provides — `safe-area.tsx`'s
 * shape, for the same reason: `packages/ui` draws and names no haptics library,
 * so the app reads the device once and hands down a function.
 *
 * **A context, because the thing that ticks is four components deep.** A wheel
 * lives in a picker, in a field, in a form, on a screen; threading `onTick`
 * through every one of them is how a drum ends up silent — which it was: the
 * day strip ticked because its screen handed it a callback, and the date and
 * time drums never had one to be handed.
 *
 * The default does nothing, which is the right answer on the web and in every
 * test and story.
 */

import { createContext, type ReactNode, useContext, useMemo } from "react";

export type Haptics = {
  /** One detent passing under a fixed mark — a drum's row, a strip's day. */
  tick: () => void;
};

function nothing(): void {}

const SILENT: Haptics = { tick: nothing };

const HapticsContext = createContext<Haptics>(SILENT);

export function HapticsProvider({ tick, children }: { tick: () => void; children: ReactNode }) {
  const value = useMemo(() => ({ tick }), [tick]);
  return <HapticsContext.Provider value={value}>{children}</HapticsContext.Provider>;
}

export function useHaptics(): Haptics {
  return useContext(HapticsContext);
}
