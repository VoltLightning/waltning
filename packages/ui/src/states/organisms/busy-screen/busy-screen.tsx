/**
 * `<BusyScreen>` — the whole app, covered, while something runs that the
 * reader must not walk away from halfway.
 *
 * **A `Modal`, so it covers the tabs too.** Drawn inside a screen, it left the
 * tab bar live under it, and a tab press mid-load is exactly the reload-halfway
 * that once left the Counterparties tab empty. The hardware back button is
 * swallowed for the same reason: `onRequestClose` does nothing, on purpose.
 *
 * **Opaque, not a scrim.** There is nothing behind it worth reading while it
 * is up — the screens underneath are being rewritten, and are about to be
 * thrown away by the restart that follows.
 *
 * **It says how far, when it knows.** `detail` is the caller's progress line;
 * without one the spinner alone is the claim that something is still running.
 */

import { ActivityIndicator, Modal, Text, View } from "react-native";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { space, tabularNums } from "../../../tokens.ts";

export type BusyScreenProps = {
  visible: boolean;
  title: string;
  /** How far it has got — absent until there is something true to say. */
  detail?: string | undefined;
};

/** Back does nothing while the work runs — see the header. */
function stay() {}

export function BusyScreen({ visible, title, detail }: BusyScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={stay}>
      <View style={styles.ground} accessibilityViewIsModal accessibilityLiveRegion="polite">
        <ActivityIndicator size="large" color={theme.accentText} />
        <Text style={styles.title}>{title}</Text>
        {detail === undefined ? null : <Text style={styles.detail}>{detail}</Text>}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((theme) => ({
  ground: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.x3,
    padding: space.x5,
    backgroundColor: theme.ground,
  },
  title: { color: theme.text, ...text.ui("displayThree"), textAlign: "center" },
  detail: {
    color: theme.textMuted,
    ...text.ui("body"),
    textAlign: "center",
    fontVariant: [...tabularNums],
  },
}));
