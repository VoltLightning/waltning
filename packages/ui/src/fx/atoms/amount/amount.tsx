/**
 * `<Amount>` — `design-system/04` §4.1.
 *
 * One figure, in one currency, never converted. Conversion is `<FxAmount>`, and
 * the split is the whole of P1: a component that *could* convert would
 * sometimes be handed an amount and a rate from different dates, and nothing in
 * its signature would object.
 *
 * **Every amount is tabular.** §2.2 calls it mandatory and names it the most
 * common omission when figures are rendered ad hoc — without it a column of
 * numbers does not align, and a ledger that does not align is read wrong.
 *
 * **A figure takes a `kind`, never a colour.** Money has three colours of its
 * own — income, spend, transfer — and this is the one place they are resolved,
 * so a screen cannot paint a credit in the action green or a debit in the
 * danger red. Both are near misses that look deliberate.
 */

import * as money from "@waltning/core/money";
import { useCallback, useState } from "react";
import { type LayoutChangeEvent, PixelRatio, Text, type TextStyle, View } from "react-native";
import { decimalMark } from "../../../i18n/locales.ts";
import { useLocale } from "../../../i18n/provider";
import { text, textCap } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { FIT_MIN_SCALE, type TypeStep, tabularNums } from "../../../tokens.ts";
import { useCurrencyMark } from "../../currency-marks";

/**
 * **These names do not order, and it has cost twice.** `medium` is 38 and
 * `large` is 23; `compact` is 17 and `small` is 14.5. A caller reaching for the
 * biggest figure picks `large` and lands two steps down — which is how the
 * month card's hero ended up the same size as the month title above it — and a
 * caller wanting the quietest picks `compact` and gets something larger than
 * the rows it sits over. Sorted by the step each resolves to:
 *
 * `hero` 54 · `medium` 38 · `large` 23 · `compact` 17 · `body` 16 · `small`
 * 14.5 · `caption` 12.
 */
export type AmountSize = "hero" | "medium" | "large" | "body" | "small" | "compact" | "caption";
export type AmountEmphasis = "default" | "muted" | "shell" | "shellMuted";

/**
 * What kind of movement the figure is.
 *
 * `auto` is sign-based and is the default: a negative figure is spend, anything
 * else is plain ink. It is right for a balance, where a positive number is not
 * income — it is what you have. A row that *knows* it is income says so, and
 * gets the brighter green; a transfer says so and gets muted, because money
 * moved between your own accounts is neither gained nor lost.
 *
 * **`net` is `auto`'s other half, for a figure that is a flow rather than a
 * stock.** A day's total, a month's net: money that came in *is* income there,
 * and a positive one drawn in plain ink while the negative beside it is red
 * reads as "we have nothing to say about this day" — which is the one thing it
 * is not. Zero with rows behind it is a day of transfers between your own
 * accounts, and it takes `transfer`'s muted ink for the same reason
 * `DayCell`'s mark calls that day `flat`. A balance keeps `auto`; the two are
 * separate kinds because the question "is a positive number good news" has
 * different answers for a stock and for a flow, and a single sign-based rule
 * has to get one of them wrong.
 */
export type AmountKind = "auto" | "net" | "income" | "spend" | "transfer";

export type AmountProps = {
  /** A decimal string. A JS number holding money is a bug (`SPEC.md` §7.0). */
  value: money.Money;
  /** ISO code. Rendered as a trailing marker, never used to convert. */
  currency: string;
  /** Decimal places for this currency — 2 for most, 0 for JPY. */
  decimals?: number;
  size?: AmountSize;
  emphasis?: AmountEmphasis;
  kind?: AmountKind;
  /** Force a leading `+` on positives. Off by default; ledgers rarely want it. */
  signed?: boolean;
  /**
   * **The figure without its currency** — for a cell too small to carry one,
   * where the currency is the whole grid's and said once around it: a
   * calendar's day. Never where a reader could meet the figure alone.
   */
  bare?: boolean;
  /**
   * **One line, shrunk to fit the width it is given.** For a headline figure
   * that must never break: a twelve-digit balance at `medium` is wider than a
   * phone, and a `<Text>` that cannot fit wraps between any two digits — which
   * is how `-100 000 0` / `00 504,20` reached a screen. The figure keeps its
   * digits and loses point size, down to `FIT_MIN_SCALE`.
   */
  fit?: boolean;
  /**
   * The width `fit` fits to, when the caller knows it. **Needed wherever the
   * figure sits in a row**: a row gives a child its content's width, so the
   * figure would be measuring itself and shrink for ever. A column parent
   * stretches the figure and needs nothing.
   */
  fitWidth?: number;
};

/** Keeps the estimate below the truth's width: the estimate is a model, the glyphs are not. */
const FIT_MARGIN = 0.94;

/** Plex Sans digits are 600 units; the separators, sign and mark are the widths below. */
const DIGIT_EM = 0.6;
const NARROW_EM = 0.3;
const SIGN_EM = 0.6;
const MARK_EM = 0.68;

/**
 * The scale a figure needs to fit in `width`, from its text alone.
 *
 * **Estimated rather than measured, because the platforms disagree.** React
 * Native's `adjustsFontSizeToFit` measures, but react-native-web ignores it, so
 * on the web the figure would wrap as before. Digits are tabular (every digit
 * is the same width — `fonts.test.ts`), which is what makes a width computable
 * from the characters; the native prop is still set on top, to absorb what the
 * model gets wrong.
 */
export function figureWidth(
  figure: string,
  mark: string,
  fontSize: number,
  markSize: number,
): number {
  const em = [...figure].reduce(
    (total, char) =>
      total + (/\d/.test(char) ? DIGIT_EM : char === "-" || char === "+" ? SIGN_EM : NARROW_EM),
    0,
  );
  const markWidth = mark === "" ? 0 : (NARROW_EM + mark.length * MARK_EM) * markSize;
  return em * fontSize + markWidth;
}

export function fitScale(
  figure: string,
  mark: string,
  fontSize: number,
  markSize: number,
  width: number,
): number {
  const needed = figureWidth(figure, mark, fontSize, markSize);
  if (needed <= 0 || width <= 0) return 1;
  return Math.min(1, Math.max(FIT_MIN_SCALE, (width * FIT_MARGIN) / needed));
}

/** The step's size-bound numbers, together — a figure at half the size has half the leading. */
function scaleStyle(step: TextStyle, scale: number): TextStyle {
  return {
    fontSize: (step.fontSize ?? 0) * scale,
    ...(step.lineHeight === undefined ? {} : { lineHeight: step.lineHeight * scale }),
    ...(step.letterSpacing === undefined ? {} : { letterSpacing: step.letterSpacing * scale }),
  };
}

/**
 * **`text.display`, not the raw token.** This was `hero: type.displayHero`,
 * which spread the whole step object into a `TextStyle` — so the figure got
 * its size and its tracking, no leading at all, and a stray `lineHeightRatio`
 * key React Native does not know. It typechecked because the value is a
 * variable rather than a literal, so excess-property checking never ran.
 */
const SIZES: Record<AmountSize, TextStyle> = {
  hero: text.display("displayHero"),
  // `DeskBand`'s hero (`shell/desk-band.tsx`): a headline figure sharing a
  // row with nav and a scope control has no room for `displayHero`'s 54px,
  // so it is *mine*'s size there — one step down, still a figure rather than
  // a step borrowed from body text.
  medium: text.display("displayOne"),
  large: text.display("displayTwo"),
  body: text.display("body"),
  small: text.display("bodySm"),
  // `DeskBand`'s *collapsed* hero: `displayThree` is the same step §2.9's
  // phone header collapses its own total to — one row, no room for even
  // `displayOne`.
  compact: text.display("displayThree"),
  // A day's own total over the rows it sums — the boards set it at 12/600.
  caption: text.display("caption"),
};

/**
 * The step behind each size, named again so the OS text-size cap can be found.
 *
 * **A second map rather than a field on the first**, because `SIZES` is a
 * `TextStyle` and the cap is a *prop*: React Native takes
 * `maxFontSizeMultiplier` on the `<Text>`, and a stylesheet cannot carry it.
 * Keeping the two keyed on the same union is what makes a new size fail to
 * compile until it has said how far it may grow — which is the whole reason
 * `maxFontScale` reached nothing for as long as it did.
 */
const STEPS: Record<AmountSize, TypeStep> = {
  hero: "displayHero",
  medium: "displayOne",
  large: "displayTwo",
  body: "body",
  small: "bodySm",
  compact: "displayThree",
  caption: "caption",
};

export function Amount({
  value,
  currency,
  decimals = 2,
  size = "body",
  emphasis = "default",
  kind = "auto",
  signed = false,
  bare = false,
  fit = false,
  fitWidth,
}: AmountProps) {
  // `cmp` rather than inspecting the string: `-0.00000000` is not a negative
  // balance, and `startsWith("-")` says it is — showing a cleared account in
  // the ink of an overdraft.
  const negative = money.cmp(value, money.toMoney("0")) < 0;
  // The mark follows the language; the group separator does not (§4.1).
  // Unwrapped — in a test, in a story — `useLocale` is English, so a figure
  // renders correctly with no provider rather than throwing.
  const figure = money.forDisplay(value, decimals, decimalMark(useLocale()));
  const prefix = signed && !negative && !money.isZero(value) ? "+" : "";
  // The pivot's symbol, every other currency's code (`04` §4.1).
  const mark = useCurrencyMark(currency);

  const styles = useStyles();

  // neither legible nor what the screen is for. `shellMuted` is the same
  // rule at the shell's secondary ink — `DeskBand`'s collapsed *ours*,
  // beside the compact figure rather than stacked under its own kicker.
  //
  // **Tried and reverted: tinting `kind="spend"`/`kind="income"` even under
  // shell emphasis.** `theme.spend` on `theme.shell` measures 1.68:1 in light
  // and 3.63:1 in dark — both well under the 4.5:1 floor `visual/stories.spec.ts`
  // checks with axe, on both stories that carried it. `theme.spend` was never
  // verified against the shell background; DualTotal's own history records the
  // same discovery for plain text ink. A shell-safe spend tint would need a new,
  // separately-verified token — real design-system work, not a StatTile fix.
  const onShell = emphasis === "shell" || emphasis === "shellMuted";
  // `net` is resolved to one of the other three by sign before anything else
  // looks at it, so the table below stays the three colours money has.
  const resolved: AmountKind =
    kind !== "net" ? kind : negative ? "spend" : money.isZero(value) ? "transfer" : "income";
  const tone = onShell
    ? emphasis === "shellMuted"
      ? styles.shellMuted
      : styles.shell
    : resolved === "income"
      ? styles.income
      : resolved === "transfer"
        ? styles.transfer
        : resolved === "spend" || negative
          ? styles.spend
          : null;

  const step = SIZES[size];
  // What the reader's text-size setting makes of the step, capped where the
  // `<Text>` itself is capped: the estimate has to be of the glyphs drawn.
  const userScale = Math.min(PixelRatio.getFontScale(), textCap(STEPS[size]) ?? Infinity);
  const fontSize = (step.fontSize ?? 0) * userScale;
  const markSize = CURRENCY_SIZE * userScale;
  const shown = `${prefix}${figure}`;
  const shownMark = bare ? "" : mark;

  // **Measured from the wrapper only where the parent stretches it.** In a
  // column the wrapper is as wide as the room there is; in a row it is as wide
  // as its own content, and a scale taken from that is a scale taken from
  // itself (`fitWidth` is for those).
  const [measured, setMeasured] = useState(0);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setMeasured(Math.floor(event.nativeEvent.layout.width));
  }, []);
  const available = fitWidth ?? measured;
  const scale = fit ? fitScale(shown, shownMark, fontSize, markSize, available) : 1;
  const scaled = scale === 1 ? null : scaleStyle(step, scale);
  const fitProps = fit
    ? {
        numberOfLines: 1,
        adjustsFontSizeToFit: true,
        // From the size already reduced, so the floor is the token's, not the
        // token's share of the share.
        minimumFontScale: Math.min(1, FIT_MIN_SCALE / scale),
      }
    : null;

  // **A no-break space before the mark.** With a plain one the currency could
  // wrap onto a line of its own — `€` alone under a figure — and a figure is
  // one run: digits, separators, mark.
  const figureText = (
    <Text
      maxFontSizeMultiplier={textCap(STEPS[size])}
      {...fitProps}
      style={[styles.base, step, scaled, tone, emphasis === "muted" ? styles.muted : null]}
    >
      {prefix}
      {figure}
      {bare ? null : (
        <Text style={[styles.currency, onShell ? styles.shellCurrency : null]}>
          {`${NBSP}${mark}`}
        </Text>
      )}
    </Text>
  );
  // The width comes from a wrapper rather than the `<Text>`: a text measures
  // its own content, which is the one width that cannot say what is available.
  return fit && fitWidth === undefined ? (
    <View style={styles.fit} onLayout={handleLayout}>
      {figureText}
    </View>
  ) : (
    figureText
  );
}

const NBSP = " ";
const CURRENCY_SIZE = text.ui("caption").fontSize ?? 12;

const useStyles = makeStyles((theme) => ({
  fit: { alignSelf: "stretch", flexShrink: 1, minWidth: 0 },
  base: {
    color: theme.text,
    // The face comes with the step, from `SIZES` — §2.2 files money under the
    // **display** face, and the reason the column still aligns on Android is
    // the file, not the feature below: IBM Plex Sans's digits are 600 units at
    // every weight with no feature applied. `fonts.test.ts` pins it.
    // Spread, not cast. React Native types `fontVariant` as a union of the
    // five real values, and both tokens are members — so this typechecks
    // *because they are correct*. `as string[]` compiled and would have
    // accepted a typo just as happily.
    fontVariant: [...tabularNums],
  },
  income: { color: theme.income },
  spend: { color: theme.spend },
  transfer: { color: theme.textMuted },
  muted: { color: theme.textMuted },
  shell: { color: theme.shellText },
  shellMuted: { color: theme.shellTextMuted },
  currency: { color: theme.textMuted, ...text.ui("caption") },
  shellCurrency: { color: theme.shellTextMuted },
}));
