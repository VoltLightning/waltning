/**
 * `<ComposerHeader>` — the fixed top band both capture composers wear
 * (`screens/S05` §3, `S31` §3): the screen's own name, the one line under it,
 * and the ✕.
 *
 * **It is a band, not a row inside the page.** `app/_layout.tsx` hides the
 * navigation header on `quick-add` and `transfer`, so this *is* the header —
 * and a header that scrolls is not one. `GroundPanel` is the page scroller and
 * clears the bottom and the sides on its own scroll content, deliberately
 * never the top ("the top belongs to the header above it"), so the screen
 * composes this **beside** the panel, and the device's top inset is cleared
 * here, once, on a `View` that does not move. Left inside the scroller the ✕ —
 * the only way out of a composer — slides under the notch the moment the
 * column overflows.
 *
 * `shell.tsx`'s own `clearance` is the pattern, values and all.
 *
 * **The title is a word, and the kind is not in it.** The deck draws *Add an
 * expense* over the day, with the ✕ at the right; which kind the draft is, is
 * the segment control the screen draws under this band (S05 §3), not a menu
 * hung off the title. An earlier band carried a kind menu here, top-right,
 * "out of the thumb zone" — and out of the design.
 */

import { Text, View } from "react-native";
import { useT } from "../../../i18n/provider";
import { IconButton } from "../../../primitives/atoms/icon-button/icon-button";
import { useSafeArea } from "../../../primitives/safe-area";
import { text, textCap } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { gutter, space } from "../../../tokens.ts";

export type ComposerHeaderProps = {
  /** The ✕ — every composer's own escape. Save belongs to the footer, Cancel does not. */
  onCancel: () => void;
  /** The screen's name — *Add an expense*, *Move money*. */
  title: string;
  /** The line under it — the day for a capture, what the composer does for a transfer. */
  subtitle?: string;
};

export function ComposerHeader({ onCancel, title, subtitle }: ComposerHeaderProps) {
  const t = useT();
  const styles = useStyles();
  const insets = useSafeArea();

  // Composed beside the JSX rather than in `useStyles`: `makeStyles` caches
  // per theme, and these three vary per device — `shell.tsx`'s own reason,
  // and its own values.
  // The deck's words sit 4 in from the gutter on the ground — the same inset
  // `DayHeader` keeps under a day's card.
  const clearance = {
    paddingTop: gutter + insets.top,
    paddingLeft: gutter + space.xs + insets.left,
    paddingRight: gutter + space.xs + insets.right,
  };

  return (
    <View style={[styles.band, clearance]}>
      <View style={styles.words}>
        <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={textCap("displayTwo")}>
          {title}
        </Text>
        {subtitle === undefined ? null : (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      <IconButton label={t("common.cancel")} onPress={onCancel}>
        <CrossMark />
      </IconButton>
    </View>
  );
}

/** The drawn ✕ — a literal glyph would be the one icon depending on a font shipping it (`keypad.tsx`'s own rule). */
function CrossMark() {
  const styles = useStyles();
  return (
    <View style={styles.crossMark}>
      <View style={[styles.crossMarkBar, styles.crossMarkBarA]} />
      <View style={[styles.crossMarkBar, styles.crossMarkBarB]} />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  band: {
    backgroundColor: theme.ground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xl,
  },
  words: { flex: 1, gap: space.xxs },
  title: { color: theme.text, ...text.ui("displayTwo") },
  subtitle: { color: theme.textMuted, ...text.ui("label", 400) },
  crossMark: { width: 18, height: 18, alignItems: "center", justifyContent: "center" },
  // The deck's ✕ is 18 in the muted ink, at a 1.6 stroke — a quiet way out,
  // not a control asking to be pressed.
  crossMarkBar: { position: "absolute", width: 18, height: 1.6, backgroundColor: theme.textMuted },
  crossMarkBarA: { transform: [{ rotate: "45deg" }] },
  crossMarkBarB: { transform: [{ rotate: "-45deg" }] },
}));
