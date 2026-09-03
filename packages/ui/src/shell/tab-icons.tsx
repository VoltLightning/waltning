/**
 * The four tab glyphs `(tabs)/_layout.tsx` hands to `<TabBar>` — drawn the
 * same way `FloatingAdd`'s plus and `Select`'s chevron are, because no icon
 * library is installed yet (`design-system/02` §2.8 names Phosphor; the
 * install is its own card). Each is a fixed 20×20 shape built from plain
 * `View`s, so it costs nothing to swap for a real icon set later — `TabBar`
 * only ever sees a `ReactNode`.
 */

import { View } from "react-native";
import { makeStyles } from "../theme/styles.ts";
import { radius, space } from "../tokens.ts";

const SIZE = 20;

export function TodayTabIcon() {
  const styles = useStyles();
  return <View style={styles.dot} />;
}

export function LedgerTabIcon() {
  const styles = useStyles();
  return (
    <View style={styles.stack}>
      <View style={styles.bar} />
      <View style={styles.bar} />
      <View style={styles.bar} />
    </View>
  );
}

export function CalendarTabIcon() {
  const styles = useStyles();
  return (
    <View style={styles.square}>
      <View style={styles.squareTab} />
    </View>
  );
}

export function DebtTabIcon() {
  const styles = useStyles();
  return (
    <View style={styles.square}>
      <View style={styles.debtLine} />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  // §2.4's shape rule reserves `pill` for the radio, the switch and the
  // floating add button — a soft-rectangle `sm` here, not a circle.
  dot: { width: SIZE, height: SIZE, borderRadius: radius.sm, backgroundColor: theme.textMuted },
  stack: {
    width: SIZE,
    height: SIZE,
    justifyContent: "space-between",
    paddingVertical: space.xxs,
  },
  bar: { height: 3, backgroundColor: theme.textMuted },
  square: {
    width: SIZE,
    height: SIZE,
    borderWidth: 2,
    borderColor: theme.textMuted,
    borderRadius: radius.xs,
    alignItems: "center",
  },
  squareTab: { width: "100%", height: 5, backgroundColor: theme.textMuted },
  debtLine: { width: 2, height: SIZE - 6, marginTop: 3, backgroundColor: theme.textMuted },
}));
