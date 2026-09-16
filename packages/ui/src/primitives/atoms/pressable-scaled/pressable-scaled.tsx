/**
 * `<PressableScaled>` — a `Pressable` that answers the finger, per
 * `design-system/02` §2.7.
 *
 * **Why this exists rather than the hook alone.** `usePressScale` is one call,
 * but wiring it is three coordinated edits: an `Animated.View` around the
 * control, `onPressIn` and `onPressOut` onto it, and the wrapper's style kept
 * in step with the child's so the layout box does not move. Three edits is
 * enough friction that it got skipped — 33 of the 50 files rendering a
 * `Pressable` had no press feedback at all while §2.7 claimed *every*
 * `Pressable` in the system gets it, which is how a rule nobody can see being
 * broken stays broken. One component makes it one edit, and
 * `tests/architecture.test.ts` makes the exceptions a list rather than an
 * accident.
 *
 * **No wrapper view.** The scale rides on the control itself through
 * `createAnimatedComponent`, not on an `Animated.View` around it: a wrapper
 * inherits none of the child's flex, width or margin, so wrapping a grid cell
 * or a row in one moves it. Riding the control means the layout box is
 * unchanged by construction, which is what makes this safe to apply to
 * thirty-odd components at once.
 *
 * The transform composes with whatever `style` the caller passes — it is
 * appended, so a caller's own `transform` would win, and none has one.
 *
 * **`Pressable`'s style may be a function, and the animated component does not
 * call it.** Several callers pass one by reference (`style={pressableStyle}`)
 * rather than inline, which is easy to miss when grepping — and
 * `createAnimatedComponent` hands that function to the style prop instead of
 * invoking it with the press state, so everything it returns is silently
 * dropped. `IconButton` takes its *width and height* from that function, so
 * every arrow and glyph in the app collapsed to the size of its content: the
 * period stepper lost its indent and forty baselines moved. Unit tests did not
 * see it because they assert colours, not boxes.
 *
 * So the press state is tracked here and the function is called with it, which
 * is what `Pressable` does internally. That costs one render per press for a
 * function-style caller — exactly what such a caller was already paying.
 */

import { useCallback, useMemo, useState } from "react";
import { Pressable, type PressableProps } from "react-native";
import Animated from "react-native-reanimated";
import { usePressScale } from "../../press-scale.ts";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * `ref` is taken from the animated component rather than from `Pressable`:
 * `createAnimatedComponent` wraps the ref in its own type, and `Select`
 * measures its trigger through one.
 */
export type PressableScaledProps = PressableProps & {
  ref?: React.ComponentProps<typeof AnimatedPressable>["ref"];
};

export function PressableScaled({
  style,
  onPressIn,
  onPressOut,
  onHoverIn,
  onHoverOut,
  ref,
  ...rest
}: PressableScaledProps) {
  const press = usePressScale();
  // Only a function style reads these, and only such a caller pays the render.
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const tracks = typeof style === "function";

  // The caller's handlers are kept, not replaced: a control that already does
  // something on press-in still does it, and gets the scale as well. Memoised
  // because a new function per render on a prop is what `noJsxPropsBind`
  // refuses, and this component sits under every row of a virtualised list.
  const handlePressIn = useCallback<NonNullable<PressableProps["onPressIn"]>>(
    (event) => {
      press.onPressIn();
      if (tracks) setPressed(true);
      onPressIn?.(event);
    },
    [press.onPressIn, onPressIn, tracks],
  );
  const handlePressOut = useCallback<NonNullable<PressableProps["onPressOut"]>>(
    (event) => {
      press.onPressOut();
      if (tracks) setPressed(false);
      onPressOut?.(event);
    },
    [press.onPressOut, onPressOut, tracks],
  );

  const handleHoverIn = useCallback<NonNullable<PressableProps["onHoverIn"]>>(
    (event) => {
      if (tracks) setHovered(true);
      onHoverIn?.(event);
    },
    [onHoverIn, tracks],
  );
  const handleHoverOut = useCallback<NonNullable<PressableProps["onHoverOut"]>>(
    (event) => {
      if (tracks) setHovered(false);
      onHoverOut?.(event);
    },
    [onHoverOut, tracks],
  );

  const composed = useMemo(() => {
    if (typeof style !== "function") return [style, press.style];
    // **Both fields, and both true.** The two `Pressable` types this monorepo
    // resolves disagree — the app's generated one declares `{ pressed }` and
    // the web build's also requires `hovered` — so the object carries both,
    // named rather than inline so neither excess-property check refuses it.
    // `hovered` is tracked rather than stubbed `false`: a shared primitive
    // that lies about its own state is a trap for the next caller, even
    // though the one function-style caller today reads only `pressed`.
    const state = { pressed, hovered };
    return [style(state), press.style];
  }, [style, press.style, pressed, hovered]);

  return (
    <AnimatedPressable
      {...rest}
      // Spread rather than passed: the animated component's own `ref` prop is
      // not declared as accepting `undefined`, and `exactOptionalPropertyTypes`
      // tells an omitted prop apart from one explicitly set to it.
      {...(ref === undefined ? {} : { ref })}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      style={composed}
    />
  );
}
