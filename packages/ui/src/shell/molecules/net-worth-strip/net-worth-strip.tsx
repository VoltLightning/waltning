/**
 * `<NetWorthStrip>` — what you hold, on one line, with a way through to the
 * accounts that hold it.
 *
 * **Net worth stopped being the hero because it is not the daily question.**
 * S04's band spent about 350pt of an 844pt screen on four figures — the total,
 * the period, spend and net — and then handed over a ground with almost
 * nothing on it. (348 on a notched phone with a shared account: 81 of inset
 * and padding, 28 of heading, 93 of `DualTotal`, 84 of period row and tiles,
 * two 20pt gaps and 22 of padding. Two fifths of the screen.) But a total you own changes slowly and is checked
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
import { Amount } from "../../../fx/atoms/amount/amount";
import { useT } from "../../../i18n/provider";
import { useInteraction } from "../../../primitives/interaction.ts";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../../../tokens.ts";
import { ScreenReaderDestination } from "../../atoms/screen-reader-destination";

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
      /*
        **No `accessibilityLabel`.** One on a `Pressable` *replaces* the
        accessible name computed from its content, so a screen reader announced
        "Open your accounts, button" and never read the figure — the headline
        number of the screen, which the plain `DualTotal` this replaced was
        perfectly able to read out. The content is the name.

        Where it goes is the hint — announced on iOS and Android, and dropped
        entirely by `react-native-web`, which emits no `aria-describedby` and
        no `aria-description`. So the web gets it a second way, from
        `ScreenReaderDestination`, whose `.web.tsx` half is the only one that
        renders anything: saying it on all three targets would have had
        VoiceOver read the destination twice.
      */
      accessibilityHint={t("shell.openAccounts")}
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
      <ScreenReaderDestination />
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
  /**
   * `accentFill`, not `hoverFill`. This strip puts two muted lines on its
   * fill, and `textMuted` was **4.47:1** on `hoverFill` when it was chosen —
   * under the 4.5 floor. `muted` has since moved a step darker and clears
   * every fill it lands on (4.89 on `hoverFill` now), so the choice is no
   * longer forced; it stays because `accentFill` is the more legible of the
   * two anyway, at 5.32 light and 4.91 dark.
   */
  hovered: { backgroundColor: theme.accentFill },
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
