/**
 * `<ComposerHeader>` — the fixed top band both capture composers wear
 * (`screens/S05` §3, `S31` §3): the screen's own name, the one line under it,
 * and the ✕.
 *
 * **It is `PageHeader` wearing a ✕.** The band itself — the clearance, the two
 * type steps, the one control at the right — is every screen's, and this file
 * used to hold a second copy of it. What is a composer's own is *which* mark
 * it carries and what the title is allowed to say; both are below.
 *
 * **The ✕, not a back mark.** A composer is a thing you are in the middle of,
 * and leaving it discards a draft — the deck draws that as a dismissal, not as
 * a step back through a stack. Save belongs to the footer; Cancel does not
 * exist.
 *
 * **The title is a word, and the kind is not in it.** The deck draws *Add an
 * expense* over the day, with the ✕ at the right; which kind the draft is, is
 * the segment control the screen draws under this band (S05 §3), not a menu
 * hung off the title. An earlier band carried a kind menu here, top-right,
 * "out of the thumb zone" — and out of the design.
 */

import { View } from "react-native";
import { useT } from "../../../i18n/provider";
import { IconButton } from "../../../primitives/atoms/icon-button/icon-button";
import { PageHeader } from "../../../shell/molecules/page-header/page-header";
import { makeStyles } from "../../../theme/styles.ts";

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

  return (
    <PageHeader
      title={title}
      {...(subtitle === undefined ? {} : { subtitle })}
      action={
        <IconButton label={t("common.cancel")} onPress={onCancel}>
          <CrossMark />
        </IconButton>
      }
    />
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
  crossMark: { width: 18, height: 18, alignItems: "center", justifyContent: "center" },
  // The deck's ✕ is 18 in the muted ink, at a 1.6 stroke — a quiet way out,
  // not a control asking to be pressed.
  crossMarkBar: { position: "absolute", width: 18, height: 1.6, backgroundColor: theme.textMuted },
  crossMarkBarA: { transform: [{ rotate: "45deg" }] },
  crossMarkBarB: { transform: [{ rotate: "-45deg" }] },
}));
