/**
 * The destination, for the one target that drops `accessibilityHint`.
 *
 * `react-native-web` renders no `aria-describedby` and no `aria-description`,
 * so a `Pressable` whose only affordance is a drawn chevron announces a figure
 * and nothing about what pressing it does. This puts the words in the tree,
 * where they join the computed name after the figure.
 *
 * **1×1 and `overflow: hidden`, not `width: 0`.** A zero-sized box is the
 * variant assistive technology is known to prune — the element has no box to
 * lay out, so some engines drop it from the tree along with the text. One
 * pixel that overflows out of sight is the shape that survives. Not the
 * `clip-path` of the usual visually-hidden recipe either: `makeStyles` types
 * its output as a React Native style, which has no such property, and the one
 * pixel is already off-screen under `position: absolute`.
 */

import { Text } from "react-native";
import { useT } from "../../i18n/provider";
import { makeStyles } from "../../theme/styles.ts";

export function ScreenReaderDestination() {
  const t = useT();
  const styles = useStyles();
  return <Text style={styles.hidden}>{t("shell.openAccounts")}</Text>;
}

const useStyles = makeStyles((theme) => ({
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    color: theme.textMuted,
  },
}));
