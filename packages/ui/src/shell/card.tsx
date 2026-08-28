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
 * The elevation props are still read from the theme rather than written here,
 * because the theme is where "a card has no shadow" is decided — and where the
 * one exception, the floating button, is granted its.
 */

import { Text, View } from "react-native";
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

  return <View style={styles.panel}>{children}</View>;
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
