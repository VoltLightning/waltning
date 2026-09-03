/**
 * `useInteraction` — hover and focus, tracked once instead of eleven times.
 *
 * Every interactive primitive was carrying the same four lines: a `focused`
 * boolean, two callbacks, and the comment explaining why Pressable's own state
 * callback cannot be trusted for focus. Hover adds two more callbacks to each.
 * Past the third copy this stopped being a pattern and became a maintenance
 * surface, which is the one licence `architecture/11` grants an abstraction.
 *
 * **Why focus is tracked here at all**: Pressable's style-callback only reports
 * `pressed` in React Native core — `focused` exists on web alone. A ring that
 * appears on one surface and not the other is worse than none: it looks
 * handled.
 *
 * **Hover is a web fact and harmless elsewhere.** `onHoverIn`/`onHoverOut` are
 * delivered by `react-native-web` and simply never fire from a touch screen, so
 * the hover style is dead weight of zero cost on the phone — and the thing
 * that makes the desk surface feel alive. `theme.hoverFill` existed for this
 * and nothing used it.
 */

import { useCallback, useMemo, useState } from "react";

export type Interaction = {
  hovered: boolean;
  focused: boolean;
  /** Spread onto the Pressable: focus, blur, hover in, hover out. */
  handlers: {
    onFocus: () => void;
    onBlur: () => void;
    onHoverIn: () => void;
    onHoverOut: () => void;
  };
};

export function useInteraction(): Interaction {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);
  const onHoverIn = useCallback(() => setHovered(true), []);
  const onHoverOut = useCallback(() => setHovered(false), []);

  const handlers = useMemo(
    () => ({ onFocus, onBlur, onHoverIn, onHoverOut }),
    [onFocus, onBlur, onHoverIn, onHoverOut],
  );

  return { hovered, focused, handlers };
}
