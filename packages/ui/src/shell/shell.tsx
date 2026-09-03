/**
 * `<Shell>` — `design-system/05` §5.1. The sage band — `theme.shell`, one
 * flat colour, no gradient — holding the header row and the hero figure
 * every screen with one leads with (`DualTotal`, `CurrencyTotals`).
 *
 * `TodayFrame` used to draw this band itself; it now composes `Shell`, and
 * the split is what lets a second screen (S04's own hero row, a future
 * desk-width band) reuse the same frame without reaching into
 * `today-frame.tsx`.
 *
 * **The shell clears the status bar because the device says how tall it
 * is.** `paddingTop` is the safe-area inset plus the design's own breathing
 * room, added rather than maxed — `max()` would put the header hard against
 * the status bar on exactly the phones that need the most room. See
 * `today-frame.tsx`'s longer note on the same arithmetic; it moved here
 * along with the band it describes.
 *
 * `leading`/`trailing` are rendered exactly as given — a heading, a brand
 * mark, an appearance control — because a screen's header content is never
 * this component's to style; `hero` and `children` (an optional row below
 * it, `PeriodHeader`'s eventual slot) are the same.
 */

import { View } from "react-native";
import { useSafeArea } from "../primitives/safe-area";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type ShellProps = {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  hero: React.ReactNode;
  children?: React.ReactNode;
};

export function Shell({ leading, trailing, hero, children }: ShellProps) {
  const styles = useStyles();
  const insets = useSafeArea();

  // Composed here rather than in `useStyles`: `makeStyles` caches per theme,
  // and these vary per device — a cache keyed on the theme alone would hand
  // the second device the first one's notch.
  const clearance = {
    paddingTop: space.x5 + insets.top,
    paddingLeft: space.x5 + insets.left,
    paddingRight: space.x5 + insets.right,
  };

  return (
    <View style={[styles.shell, clearance]}>
      <View style={styles.header}>
        {leading}
        {trailing}
      </View>
      <View>{hero}</View>
      {children}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  shell: { backgroundColor: theme.shell, padding: space.x5, gap: space.x4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
}));
