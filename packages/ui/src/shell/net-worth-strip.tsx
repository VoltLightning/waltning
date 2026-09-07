/**
 * `<NetWorthStrip>` — what you hold, on one line, with a way through to the
 * accounts that hold it.
 *
 * **Net worth stopped being the hero because it is not the daily question.**
 * S04's band spent about 500pt of a 844pt screen on four figures — the total,
 * the period, spend and net — and then handed over a ground with almost
 * nothing on it. But a total you own changes slowly and is checked
 * occasionally; what changed *this month* is what the screen is opened for. So
 * the month became the hero (`MonthSummary`) and this is the total: a strip,
 * still first, still on top, and a tap from the register that explains it.
 *
 * **One figure, and a line saying what it leaves out.** `DualTotal` renders
 * *mine* and *ours* stacked because a 54pt hero has the room; a strip does
 * not, so *ours* and any second currency become one muted line rather than two
 * more figures competing with the month's. The register is one tap away and
 * shows every one of them — which is the reason this is pressable rather than
 * a label.
 */

import type * as money from "@waltning/core/money";
import { Pressable, Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { useT } from "../i18n/provider";
import { useInteraction } from "../primitives/interaction.ts";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";

export type NetWorthStripProps = {
  /** Everything you own in the lead currency, business included (§6.7). */
  mine: money.Money;
  /** The household figure, or `null` where no shared account exists. */
  ours: money.Money | null;
  currency: string;
  decimals?: number;
  /**
   * How many currencies the ledger holds beyond this one. `0` draws no note;
   * anything above it says the figure is partial, because a total that is
   * silently one of several is the way to read the wrong number.
   */
  otherCurrencies?: number;
  onPress: () => void;
};

export function NetWorthStrip({
  mine,
  ours,
  currency,
  decimals = 2,
  otherCurrencies = 0,
  onPress,
}: NetWorthStripProps) {
  const t = useT();
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("shell.openAccounts")}
      onPress={onPress}
      style={[styles.root, hovered ? styles.hovered : null, focused ? styles.focused : null]}
      {...handlers}
    >
      <View style={styles.figures}>
        <View style={styles.line}>
          <Text style={styles.kicker}>{t("shell.mine")}</Text>
          <Amount value={mine} currency={currency} decimals={decimals} size="body" />
        </View>
        {/*
          `ours` through `<Amount>` like every other figure — never a string
          interpolated into a sentence, which is how a figure loses its tabular
          digits and its own decimals (`design-system/04`).
        */}
        {ours === null ? null : (
          <View style={styles.line}>
            <Text style={styles.note}>{t("shell.ours")}</Text>
            <Amount
              value={ours}
              currency={currency}
              decimals={decimals}
              size="small"
              emphasis="muted"
            />
          </View>
        )}
        {otherCurrencies > 0 ? (
          <Text style={styles.note}>
            {t("shell.alsoInOtherCurrencies", { count: otherCurrencies })}
          </Text>
        ) : null}
      </View>
      {/*
        Two borders of a square, rotated — the disclosure mark drawn rather
        than typed, the spelling `SettingsMenu` established for the same reason
        (a glyph depends on the face shipping it).
      */}
      <View style={styles.chevron} />
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    minHeight: touchTarget.min,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
    paddingHorizontal: space.x3,
    paddingVertical: space.lg,
    borderRadius: radius.sm,
    backgroundColor: theme.subtleFill,
  },
  hovered: { backgroundColor: theme.hoverFill },
  focused: {
    outlineWidth: focus.width,
    outlineStyle: "solid",
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  figures: { gap: space.xxs, flexShrink: 1 },
  line: { flexDirection: "row", alignItems: "baseline", gap: space.md },
  kicker: { color: theme.textMuted, ...text.ui("kicker") },
  note: { color: theme.textMuted, ...text.ui("caption") },
  chevron: {
    width: 8,
    height: 8,
    borderRightWidth: 1.5,
    borderTopWidth: 1.5,
    borderColor: theme.textMuted,
    transform: [{ rotate: "45deg" }],
  },
}));
