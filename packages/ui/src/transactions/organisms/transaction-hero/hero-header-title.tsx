/**
 * `<HeroHeaderTitle>` — the page header's words on S09, which trade places
 * with the band as it scrolls away (`screens/S09-transaction-detail.md` §3).
 *
 * At rest the header says the **date**, and the band below says everything
 * else. As the band's figure passes under the header, the date fades out and
 * the **name and amount** fade in, so the one thing you opened the screen for
 * never leaves the screen. The date lifts away before the compact line rises
 * in (`fold.ts`), so the two never share the space at half strength. Both are
 * always in the tree — the swap is opacity, which reduced motion keeps (it is
 * a fade, not a movement); the lift and the rise are what it drops.
 */

import type * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import Animated, { interpolate, type SharedValue, useAnimatedStyle } from "react-native-reanimated";
import { Amount } from "../../../fx/atoms/amount/amount";
import { useReducedMotion } from "../../../primitives/reduced-motion.ts";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { space } from "../../../tokens.ts";
import {
  TRANSACTION_AMOUNT_KIND,
  type TransactionType,
} from "../../molecules/transaction-row/transaction-row";
import { DATE_OUT, TITLE_IN } from "./fold.ts";

export type HeroHeaderTitleProps = {
  scrollY: SharedValue<number>;
  date: string;
  name: string;
  amount: money.Money;
  currency: string;
  decimals: number;
  type: TransactionType;
};

export function HeroHeaderTitle({
  scrollY,
  date,
  name,
  amount,
  currency,
  decimals,
  type,
}: HeroHeaderTitleProps) {
  const styles = useStyles();
  const reduced = useReducedMotion();
  const dateStyle = useAnimatedStyle(
    () => ({
      opacity: interpolate(scrollY.value, [...DATE_OUT], [1, 0], "clamp"),
      transform: [
        {
          translateY: reduced
            ? 0
            : -interpolate(scrollY.value, [...DATE_OUT], [0, space.md], "clamp"),
        },
      ],
    }),
    [reduced],
  );
  const compactStyle = useAnimatedStyle(() => {
    const progress = interpolate(scrollY.value, [...TITLE_IN], [0, 1], "clamp");
    return {
      opacity: progress,
      transform: [{ translateY: reduced ? 0 : (1 - progress) * space.md }],
    };
  }, [reduced]);

  return (
    <View style={styles.root}>
      <Animated.View style={dateStyle}>
        <Text style={styles.date} numberOfLines={1}>
          {date}
        </Text>
      </Animated.View>
      <Animated.View
        style={[styles.compact, compactStyle]}
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Amount
          value={amount}
          currency={currency}
          decimals={decimals}
          size="small"
          kind={TRANSACTION_AMOUNT_KIND[type]}
        />
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { flex: 1, justifyContent: "center", minHeight: 28 },
  date: { color: theme.text, ...text.ui("displayThree") },
  compact: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.md,
  },
  name: { color: theme.text, ...text.ui("displayThree"), flexShrink: 1 },
}));
