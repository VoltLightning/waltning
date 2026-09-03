/**
 * `<Skeleton>` — `design-system/08` §8.5. **Matches the shape it replaces —
 * never a grey box, and never a spinner over a whole page.**
 *
 * Three shapes, because the thing loading is never generic: `row` stands in
 * for a transaction row, `hero` for a headline figure, `block` for a card or a
 * chart. A single shimmering rectangle regardless of shape reads as "loading",
 * which is less useful than reading as "loading *this*" — the layout does not
 * jump when the real content lands, because the skeleton already had its
 * proportions.
 *
 * **One shimmer, on opacity alone, at `motion.base`.** §2.7's `motion-none`
 * branch renders `subtleFill` static rather than looping an animation nobody
 * asked to see.
 */

import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { easing } from "../primitives/easing.ts";
import { useReducedMotion } from "../primitives/reduced-motion.ts";
import { makeStyles } from "../theme/styles.ts";
import { motion, radius } from "../tokens.ts";

export type SkeletonShape = "row" | "hero" | "block";

export type SkeletonProps = {
  shape: SkeletonShape;
  /** The accessible name for what is loading — "Recent transactions", "Net worth". */
  label: string;
};

export function Skeleton({ shape, label }: SkeletonProps) {
  const styles = useStyles();
  const reduced = useReducedMotion();
  const opacity = useSharedValue(reduced ? 0.6 : 1);

  useEffect(() => {
    if (reduced) {
      opacity.value = 0.6;
      return;
    }
    opacity.value = withRepeat(
      withTiming(0.55, { duration: motion.base.duration, easing: easing.base }),
      -1,
      true,
    );
  }, [reduced, opacity]);

  const shimmer = useAnimatedStyle(() => ({ opacity: opacity.value }), [opacity]);

  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={styles[shape]}>
      <Animated.View style={[styles.fill, shimmer]} />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  row: { height: 56, borderRadius: radius.sm, overflow: "hidden" },
  hero: { height: 96, borderRadius: radius.md, overflow: "hidden" },
  block: { height: 160, borderRadius: radius.md, overflow: "hidden" },
  fill: { flex: 1, backgroundColor: theme.subtleFill },
}));
