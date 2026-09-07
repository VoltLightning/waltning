/**
 * The tab glyphs `use-tab-bar-items.tsx` hands to `<TabBar>` — four of them
 * wired today, and `CalendarTabIcon` waiting for S11 to build the screen it
 * belongs to.
 *
 * **Phosphor, duotone, at last (§2.8).** These were five shapes built from
 * plain `View`s, because no icon library was installed — and it showed: Today
 * was a filled square, which is a placeholder rather than a home, and Debt was
 * an arrow that could have meant anything. `react-native-svg` ships in Expo
 * Go, so the install needed no EAS cutover, and the drawn set is gone in one
 * move rather than being extended a sixth time.
 *
 * **One box for all five, and the icon is drawn inside it.** `Today` used to
 * *be* its 14px square rather than sit in a 20px box, so its label rose 3px
 * above the other four and the bar read as slightly broken without anyone
 * being able to say why. `TAB_ICON_SIZE` is what `TabBar` reserves; a glyph is
 * free to be smaller than the box, never free to change the row's height.
 *
 * **The ink follows the label.** `TabBar` colours the active label
 * `accentText`; these take the same `active` flag so the glyph agrees with the
 * word beside it rather than staying `textMuted` regardless of selection.
 */

import {
  ArrowsLeftRight,
  CalendarBlank,
  House,
  ListBullets,
  SlidersHorizontal,
} from "phosphor-react-native";
import { View } from "react-native";
import { useTheme } from "../theme/provider";
import { makeStyles } from "../theme/styles.ts";

/**
 * The box every glyph is drawn in, and the box `TabBar` reserves for it.
 * Exported so the two cannot drift: a bar reserving 24 for a 20px set is a
 * 4px gap under every label, and nothing would say so.
 */
export const TAB_ICON_SIZE = 20;

export type TabIconProps = { active?: boolean };

/**
 * `duotone` — §2.8 gives it to navigation, and the tab bar is the navigation.
 * The second tone is the same ink at Phosphor's own reduced opacity, so an
 * inactive glyph is one colour lighter rather than a different shape.
 */
const WEIGHT = "duotone" as const;

export function TodayTabIcon({ active = false }: TabIconProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.box}>
      <House
        size={TAB_ICON_SIZE}
        color={active ? theme.accentText : theme.textMuted}
        weight={WEIGHT}
      />
    </View>
  );
}

export function LedgerTabIcon({ active = false }: TabIconProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.box}>
      <ListBullets
        size={TAB_ICON_SIZE}
        color={active ? theme.accentText : theme.textMuted}
        weight={WEIGHT}
      />
    </View>
  );
}

export function CalendarTabIcon({ active = false }: TabIconProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.box}>
      <CalendarBlank
        size={TAB_ICON_SIZE}
        color={active ? theme.accentText : theme.textMuted}
        weight={WEIGHT}
      />
    </View>
  );
}

/**
 * Two arrows, opposed — money owed in one direction and out in the other,
 * which is what S12 is. The drawn version was a single arrow that read as
 * *up*, and *up* is not what debt means.
 */
export function DebtTabIcon({ active = false }: TabIconProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.box}>
      <ArrowsLeftRight
        size={TAB_ICON_SIZE}
        color={active ? theme.accentText : theme.textMuted}
        weight={WEIGHT}
      />
    </View>
  );
}

export function SettingsTabIcon({ active = false }: TabIconProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.box}>
      <SlidersHorizontal
        size={TAB_ICON_SIZE}
        color={active ? theme.accentText : theme.textMuted}
        weight={WEIGHT}
      />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  box: {
    width: TAB_ICON_SIZE,
    height: TAB_ICON_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
}));
