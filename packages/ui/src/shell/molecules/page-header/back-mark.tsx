/**
 * `<BackMark>` — the way back, drawn.
 *
 * Two borders of a square, rotated: the same construction `SettingsMenu`'s
 * disclosure chevron uses, pointing the other way. A typed `‹` would be the
 * one mark in the app depending on a face shipping it — `keypad.tsx`'s rule,
 * and the reason every glyph here is geometry.
 *
 * **It points left and it sits at the right**, which looks like a mistake and
 * is the deck's (S17, S18, S09, S13). The header's words are the screen's
 * subject and start at the gutter; the way out is a quiet mark in the corner
 * the thumb reaches, not a control competing with the title for the first
 * thing read.
 */

import { View } from "react-native";
import { makeStyles } from "../../../theme/styles.ts";

export function BackMark() {
  const styles = useStyles();
  return <View style={styles.mark} />;
}

const useStyles = makeStyles((theme) => ({
  mark: {
    width: 9,
    height: 9,
    borderLeftWidth: 1.6,
    borderBottomWidth: 1.6,
    borderColor: theme.textMuted,
    transform: [{ rotate: "45deg" }],
  },
}));
