/**
 * gesture-handler under jsdom: the names this package uses, inert.
 *
 * The real library cannot load here. Its web half does a guarded
 * `require("react-native-reanimated")`, and Node resolves that to the native
 * CommonJS build, which requires `react-native` itself — Flow-typed source
 * the loader refuses before the `catch` can see it. Vite's aliases do not
 * reach a raw `require`.
 *
 * So the detector renders its child and every builder accepts every callback
 * and calls none. Component tests assert what a control *is* and that a tap
 * reaches its handler; a drag or a hold is looked at in Storybook and on the
 * device, where the real library runs.
 */

import type { ReactNode } from "react";
import { View } from "react-native";

type Callback = (event: never) => void;

class PanBuilder {
  // Stored, not discarded: `threshold-slider.test.tsx`'s layout-mid-drag
  // test calls these directly to simulate `onStart`/`onUpdate` without a
  // real gesture-handler runtime — the same reason the callback is kept
  // rather than invoked and dropped, since a real `Gesture.Pan` cannot fire
  // here (see the file doc).
  onStartCallback: Callback | null = null;
  onUpdateCallback: Callback | null = null;
  onEndCallback: (() => void) | null = null;

  minDistance(_distance: number): this {
    return this;
  }
  enabled(_enabled: boolean): this {
    return this;
  }
  onStart(callback: Callback): this {
    this.onStartCallback = callback;
    return this;
  }
  onUpdate(callback: Callback): this {
    this.onUpdateCallback = callback;
    return this;
  }
  onEnd(callback: () => void): this {
    this.onEndCallback = callback;
    return this;
  }
}

/** `FloatingAdd`'s own long-press picker (S05 §9.1) — the fourth name this stub carries. */
class LongPressBuilder {
  minDuration(_duration: number): this {
    return this;
  }
  enabled(_enabled: boolean): this {
    return this;
  }
  onStart(_callback: Callback): this {
    return this;
  }
}

type AnyBuilder = PanBuilder | LongPressBuilder | CombinedBuilder;

/**
 * `Gesture.Exclusive`/`Gesture.Simultaneous` — inert composition, same reason
 * as the two builders above. Takes the gestures it composes and does nothing
 * with them, same as `PanBuilder`'s own callbacks.
 */
class CombinedBuilder {}

export const Gesture = {
  Pan: (): PanBuilder => new PanBuilder(),
  LongPress: (): LongPressBuilder => new LongPressBuilder(),
  Exclusive: (..._gestures: readonly AnyBuilder[]): CombinedBuilder => new CombinedBuilder(),
  Simultaneous: (..._gestures: readonly AnyBuilder[]): CombinedBuilder => new CombinedBuilder(),
};

export function GestureDetector({ children }: { gesture: AnyBuilder; children: ReactNode }) {
  return children;
}

export const GestureHandlerRootView = View;
