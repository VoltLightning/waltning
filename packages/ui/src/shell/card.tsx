/**
 * `<Card>` and `<GroundPanel>` — `design-system/05` §5.
 *
 * `Card`: `surface`, `radius-lg`, `shadow-card`, with an optional title and one
 * action. **One** action, not a row of them — a card with three affordances in
 * its header is a card whose content has stopped being the point.
 *
 * `GroundPanel`: the `radius-xl` surface that lifts over the shell. It is the
 * page body, and the reason the shell's dark band reads as behind rather than
 * above.
 */

import { Text, View } from "react-native";
import { makeStyles } from "../theme/index.ts";
import { hairline, radius, shadow, space, type } from "../tokens.ts";

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
    borderRadius: radius.lg,
    padding: space.x5,
    gap: space.x3,
    shadowColor: shadow.card.color,
    shadowOpacity: shadow.card.opacity,
    shadowRadius: shadow.card.radius,
    shadowOffset: { width: 0, height: shadow.card.offsetY },
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
  title: { color: t.text, fontSize: type.displayThree.fontSize, fontWeight: "600" },
  panel: {
    backgroundColor: t.ground,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.x5,
    gap: space.x4,
    flex: 1,
  },
}));
