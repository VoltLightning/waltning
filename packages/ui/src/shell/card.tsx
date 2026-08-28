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
 * device's chrome is cleared. Nothing did that: the last card and the add
 * button sat under the home indicator on every gesture-navigation phone, and
 * the two form screens — which are a bare `GroundPanel` under a headerless
 * route — began under the status bar.
 *
 * Left and right are always cleared, because they are always the screen's
 * sides; in landscape the notch is on one of them, and a figure running under
 * it is a figure read wrong rather than a cosmetic clip. Top and bottom are the
 * `edges` prop, because a panel under the shell has already had its top cleared
 * by the shell.
 *
 * **The default clears both, so the mistake is the cheap one.** A panel that
 * forgets to opt *out* renders a little extra padding under the shell — visible
 * the moment anyone looks. One that forgets to opt *in* renders content under
 * the status bar, which is invisible on every machine this suite runs on and
 * broken on every phone.
 *
 * The elevation props are still read from the theme rather than written here,
 * because the theme is where "a card has no shadow" is decided — and where the
 * one exception, the floating button, is granted its.
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

/** Which screen edges this panel is actually against. */
export type ScreenEdge = "top" | "bottom";

/** The panel under a shell: the shell above it already cleared the status bar. */
export const BELOW_SHELL: readonly ScreenEdge[] = ["bottom"];

export type GroundPanelProps = {
  edges?: readonly ScreenEdge[];
  children: React.ReactNode;
};

export function GroundPanel({ edges = BOTH_EDGES, children }: GroundPanelProps) {
  const styles = useStyles();
  const insets = useSafeArea();

  // Not in `useStyles`: that cache is keyed on the theme, and these are keyed
  // on the device.
  const clearance = {
    paddingTop: space.x5 + (edges.includes("top") ? insets.top : 0),
    paddingBottom: space.x5 + (edges.includes("bottom") ? insets.bottom : 0),
    paddingLeft: space.x5 + insets.left,
    paddingRight: space.x5 + insets.right,
  };

  return <View style={[styles.panel, clearance]}>{children}</View>;
}

const BOTH_EDGES: readonly ScreenEdge[] = ["top", "bottom"];

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
