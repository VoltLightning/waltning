/**
 * `<Card>` and `<GroundPanel>` — `design-system/05` §5.
 *
 * `Card`: `surface`, `radius-md`, a one-pixel `border` and **no shadow**, with
 * an optional title and one action. **One** action, not a row of them — a card
 * with three affordances in its header is a card whose content has stopped
 * being the point.
 *
 * `GroundPanel`: the `radius-lg` surface that lifts over the shell. It is the
 * page body, and the reason the shell's dark band reads as behind rather than
 * above.
 *
 * **It is also the thing that reaches the screen's edges**, so it is where the
 * device's chrome is cleared — bottom and sides, never the top.
 *
 * The top belongs to the header above it, and the app guarantees there is one:
 * `TodayFrame`'s shell on the ledger, a navigation header on every other route.
 * That is why `edges` came and went in the same change — the prop existed to
 * let a bare panel be a whole screen, and giving the form routes real headers
 * removed the case it was for. A prop whose only value is its default is a
 * decision the structure already made.
 *
 * Bottom, because the last card and the add button sat under the home
 * indicator on every gesture-navigation phone. Sides, because in landscape the
 * notch is on one of them, and a figure running under it is a figure read wrong
 * rather than a cosmetic clip.
 */

import { Text, View } from "react-native";
import { useSafeArea } from "../primitives/safe-area";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { hairline, radius, space } from "../tokens.ts";

export type CardProps = {
  title?: string;
  /** One action, in the header. Rendered as given — usually a `Button`. */
  action?: React.ReactNode;
  children: React.ReactNode;
};

export function Card({ title, action, children }: CardProps) {
  const styles = useStyles();

  return (
    <View style={styles.card}>
      {title || action ? (
        <View style={styles.header}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function GroundPanel({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const insets = useSafeArea();

  // Not in `useStyles`: that cache is keyed on the theme, and these are keyed
  // on the device.
  const clearance = {
    paddingBottom: space.x5 + insets.bottom,
    paddingLeft: space.x5 + insets.left,
    paddingRight: space.x5 + insets.right,
  };

  return <View style={[styles.panel, clearance]}>{children}</View>;
}

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.surface,
    borderRadius: radius.md,
    padding: space.x5,
    gap: space.x3,
    shadowColor: t.elevation.card.shadowColor,
    shadowOpacity: t.elevation.card.shadowOpacity,
    shadowRadius: t.elevation.card.shadowRadius,
    shadowOffset: t.elevation.card.shadowOffset,
    borderWidth: t.elevation.card.borderWidth,
    borderColor: t.elevation.card.borderColor,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
    borderBottomWidth: hairline.width,
    borderBottomColor: t.hairline,
    paddingBottom: space.xl,
  },
  title: { color: t.text, ...text.ui("displayThree") },
  panel: {
    backgroundColor: t.ground,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.x5,
    gap: space.x4,
    flex: 1,
  },
}));
