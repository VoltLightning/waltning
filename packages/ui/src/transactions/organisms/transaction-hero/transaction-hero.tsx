/**
 * `<TransactionHero>` — `screens/S09-transaction-detail.md` §3 mobile: the
 * header band that says what happened, in the category's own colour.
 *
 * **The band is the category's wash** — `categoryTintFor`, the same hue the
 * category's chip wears everywhere else. A transfer or an uncategorised row
 * has no category and takes the neutral `subtleFill`. The figure keeps its
 * money colour on the wash: the band is the category's, the amount is the
 * money's, and neither borrows the other's. `heroTint` is exported so the page
 * header above it takes the same wash and the two read as one band.
 *
 * **Full bleed.** The band is the first thing in the page scroller, which
 * pads its content by the gutter; the band takes that padding back so its
 * colour meets the screen's edges and the header above it.
 *
 * **`FxAmount`'s full basis is not here.** S09 §3 shows a second line for a
 * foreign capture; `wave-3-shared.md` names that block unbuilt (no rate table
 * until `#e3`), so the hero is exactly the row's own currency.
 *
 * **It moves twice, and says the same thing both times.** On arrival the
 * mark settles and the figure rises into place — the figure a beat later,
 * because it is what the eye goes to. On scroll the band folds: its contents
 * fade and drift at a third of the page's speed as the header's words swap
 * to the name and amount (`HeroHeaderTitle`), over the same stretch
 * (`fold.ts`), handing off rather than crossfading. Reduced motion keeps the fades and drops both movements.
 *
 * **The direction is said in words, beside the name.** *Went out* · *Came
 * in* — P5's rule that direction never rests on colour or a sign alone. A
 * transfer says neither, and names both accounts instead.
 */

import type * as money from "@waltning/core/money";
import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { Amount } from "../../../fx/atoms/amount/amount";
import { useT } from "../../../i18n/provider";
import { easing } from "../../../primitives/easing.ts";
import { type CategoryTint, categoryTintFor } from "../../../primitives/monogram.ts";
import { useReducedMotion } from "../../../primitives/reduced-motion.ts";
import { useSafeArea } from "../../../primitives/safe-area";
import { text, textCap } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import type { Theme } from "../../../theme/roles.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { gutter, motion, radius, space } from "../../../tokens.ts";
import { BrandIcon } from "../../atoms/brand-icon/brand-icon";
import {
  TRANSACTION_AMOUNT_KIND,
  type TransactionType,
} from "../../molecules/transaction-row/transaction-row";
import { bandOpacity } from "./fold.ts";

/** How far the figure rises on arrival. */
const RISE = 12;
/** The figure's beat behind the mark. */
const FIGURE_DELAY = 60;

export type TransactionHeroProps = {
  /** Already signed — same rule as `TransactionRow` and `readTransaction`. */
  amount: money.Money;
  currency: string;
  decimals?: number;
  type?: TransactionType;
  accountName: string;
  /** A transfer's destination — its line names both accounts. */
  toAccountName?: string | null;
  /** The category the band is tinted by; `null` takes the neutral fill. */
  categoryName: string | null;
  /** Drives `BrandIcon`'s fallback monogram when nothing matched. */
  enteredName: string;
  brandKey?: string | null;
  /** The page's scroll offset (`useHeroScroll`); absent, the band never folds. */
  scrollY?: SharedValue<number>;
};

/**
 * How much of the category's wash the band keeps, the rest being the ground.
 * A chip wears the wash at full strength because it is small; a band the width
 * of the screen at full strength is a slab of colour — a rose or indigo
 * category turned the whole top of the page purple — so the band is the wash
 * laid over the page, not painted instead of it.
 */
const WASH = { light: 0.6, dark: 0.45 } as const;

/** `#rrggbb` only — every ground and category wash is written that way. */
function mix(base: string, over: string, amount: number): string {
  const channel = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
  let out = "#";
  for (const at of [1, 3, 5]) {
    const value = Math.round(channel(base, at) * (1 - amount) + channel(over, at) * amount);
    out += value.toString(16).padStart(2, "0");
  }
  return out;
}

/** One category hue as a band — its wash laid over the ground, and its ink. */
export function bandOf(tint: CategoryTint, theme: Theme): { fill: string; ink: string } {
  return { fill: mix(theme.ground, tint.fill, WASH[theme.scheme]), ink: tint.ink };
}

/** The band's wash and the ink written on it — shared with the page header above. */
export function heroTint(categoryName: string | null, theme: Theme): { fill: string; ink: string } {
  if (categoryName === null) return { fill: theme.subtleFill, ink: theme.textMuted };
  return bandOf(categoryTintFor(categoryName, theme), theme);
}

export function TransactionHero({
  amount,
  currency,
  decimals = 2,
  type,
  accountName,
  toAccountName,
  categoryName,
  enteredName,
  brandKey,
  scrollY,
}: TransactionHeroProps) {
  const styles = useStyles();
  const reduced = useReducedMotion();
  const arrival = useSharedValue(0);
  useEffect(() => {
    const timing = { duration: motion.sheet.duration, easing: easing.sheet };
    arrival.value = withDelay(FIGURE_DELAY, withTiming(1, timing));
  }, [arrival]);

  const foldStyle = useAnimatedStyle(() => {
    const y = scrollY?.value ?? 0;
    return {
      opacity: bandOpacity(y),
      transform: [{ translateY: reduced ? 0 : Math.max(0, y) * 0.33 }],
    };
  }, [reduced, scrollY]);
  const markStyle = useAnimatedStyle(
    () => ({
      opacity: interpolate(arrival.value, [0, 0.5], [0, 1], "clamp"),
      transform: [{ scale: reduced ? 1 : interpolate(arrival.value, [0, 1], [0.92, 1]) }],
    }),
    [reduced],
  );
  const figureStyle = useAnimatedStyle(
    () => ({
      opacity: arrival.value,
      transform: [{ translateY: reduced ? 0 : (1 - arrival.value) * RISE }],
    }),
    [reduced],
  );
  const theme = useTheme();
  const t = useT();
  const insets = useSafeArea();
  const tint = heroTint(categoryName, theme);

  const direction =
    type === "expense" ? t("shell.wentOut") : type === "income" ? t("shell.cameIn") : null;
  const where =
    type === "transfer" && toAccountName
      ? `${accountName} → ${toAccountName}`
      : `${accountName} · ${currency}`;
  const name =
    enteredName !== ""
      ? enteredName
      : type === "transfer"
        ? t("transactions.transfer")
        : t("routes.transaction");

  const ink = { color: tint.ink };
  // Composed beside the JSX: the bleed is the page's gutter plus the device's
  // own side insets, which vary per device and so stay out of `useStyles`.
  const bleed = {
    backgroundColor: tint.fill,
    marginLeft: -(gutter + insets.left),
    marginRight: -(gutter + insets.right),
    paddingLeft: gutter + space.xs + insets.left,
    paddingRight: gutter + space.xs + insets.right,
  };

  return (
    <View style={[styles.band, bleed]}>
      <Animated.View style={[styles.contents, foldStyle]}>
        <View style={styles.identity}>
          <Animated.View style={markStyle}>
            <BrandIcon
              {...(brandKey !== undefined ? { brandKey } : {})}
              enteredName={enteredName}
              size={40}
            />
          </Animated.View>
          <View style={styles.words}>
            <Text
              style={styles.name}
              numberOfLines={2}
              maxFontSizeMultiplier={textCap("displayTwo")}
            >
              {name}
            </Text>
            <Text style={[styles.context, ink]} numberOfLines={1}>
              {direction === null ? where : `${direction} · ${where}`}
            </Text>
          </View>
        </View>
        <Animated.View style={figureStyle}>
          <Amount
            value={amount}
            currency={currency}
            decimals={decimals}
            size="hero"
            kind={type ? TRANSACTION_AMOUNT_KIND[type] : "auto"}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  band: {
    // The panel's own top padding, taken back so the band meets the header.
    marginTop: -space.x2,
    paddingTop: space.md,
    paddingBottom: space.x3 + space.md,
    // The band sits on the page like a sheet laid on it, not a stripe cut
    // across it — the ground panel's own lift radius, turned upside down.
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    overflow: "hidden",
  },
  contents: { gap: space.x3 },
  identity: { flexDirection: "row", alignItems: "center", gap: space.xl },
  words: { flex: 1, gap: space.xxs },
  name: { color: theme.text, ...text.ui("displayTwo") },
  context: { ...text.ui("bodySm") },
}));
