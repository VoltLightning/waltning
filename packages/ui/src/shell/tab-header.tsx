/**
 * `<TabHeader>` — the band a tab root wears when it has no hero to lead with.
 *
 * **Every tab is titled, and the title is the shell's, not the screen's.**
 * Today drew its own band through `TodayFrame`; Ledger and Debt drew nothing
 * at all, so their content began 22px from the top of the device with no name
 * on it; Settings put its name inside a card, where a card's title is a
 * card's, not the page's. Three treatments for one thing means the app reads
 * as three apps, and the fix belongs above the screens rather than in each of
 * them — a screen that draws its own header is a screen that can disagree
 * with the next one.
 *
 * So `tabs-shell.tsx` draws this from the active tab's own label, and no tab
 * screen carries a title of its own. The one exception is the one with
 * something better: Today keeps `TodayFrame`'s hero band, because §5.1's
 * *"a 54pt total does not fit in a navigation bar"* is still true and a hero
 * is a better header than a word.
 *
 * **`shell`, `displayTwo`, and the same top clearance `Shell` uses** — the
 * inset plus the design's own breathing room, added rather than maxed, so the
 * phones that reserve the most room are not the ones whose title sits hard
 * against the status bar. Sharing the vocabulary is what makes the band read
 * as one surface with Today's rather than as a second, similar one.
 *
 * `action` is one node, on the right — an appearance control, a filter, a
 * period picker. One, for `Card`'s own reason: a header with three
 * affordances is a header that has stopped being a title.
 */

import { Text, View } from "react-native";
import { useSafeArea } from "../primitives/safe-area";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type TabHeaderProps = {
  title: string;
  /** **One** action or figure, on the right. Rendered exactly as given. */
  action?: React.ReactNode;
};

export function TabHeader({ title, action }: TabHeaderProps) {
  const styles = useStyles();
  const insets = useSafeArea();

  // Per-device, so not in `useStyles` — the same arithmetic and the same
  // reason `Shell` states beside its own copy.
  const clearance = {
    paddingTop: space.x5 + insets.top,
    paddingLeft: space.x5 + insets.left,
    paddingRight: space.x5 + insets.right,
  };

  return (
    <View style={[styles.header, clearance]}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {action}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  header: {
    backgroundColor: theme.shell,
    padding: space.x5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
  },
  title: { flexShrink: 1, color: theme.shellText, ...text.ui("displayTwo") },
}));
