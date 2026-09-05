/**
 * `<WidgetCard>` — `S01` §4's `WidgetCard`, the one shell every dashboard
 * widget shares.
 *
 * **Every widget states its currency, its period and its scope in its
 * header** (`S01` §3, `SPEC.md` §7.0): a figure on a dashboard with no stated
 * frame is a figure you will misread. Those are **three required props**, not
 * one free `meta` string — a caller composing the line itself is a caller that
 * can compose nothing, and three of the five widgets shipped exactly that,
 * one of them printing the application's own name where a period belongs.
 * This component still derives none of the three, because it has no reader to
 * derive them from; it only refuses to render without them.
 *
 * **The currency comes first because it is the one a reader assumes.** §7.0's
 * display currency leads every widget, and figures in any other currency are
 * listed unconverted on their own rows — arc-phone has no rate table, so a
 * converted total here would be a number invented to look tidy.
 *
 * **Loading is a skeleton in the widget's own shape, never a page-level
 * spinner** (`S01` §6) — `loading` swaps `children` for a `Skeleton` sized
 * `block`, so a slow query holds only its own card, not the grid. **Error is
 * per widget** (`S01` §6) — `error` swaps `children` for the message,
 * un-styled beyond what the card already gives, matching `ErrorState`'s own
 * "never page-level" rule one level down.
 */

import { Text, View } from "react-native";
import { Skeleton } from "../states/skeleton";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { hairline, radius, space } from "../tokens.ts";

/**
 * The three parts of a widget's stated frame, as one named shape — every
 * widget in this module takes all three and hands all three on, so a new
 * widget that forgets one does not compile.
 */
export type WidgetFrame = {
  /** The lead currency these figures are stated in — §7.0's display currency, as an ISO code. */
  currency: string;
  /** What span the figures cover — "September 2026", "As of September 5, 2026", "5 months + this month to date". */
  period: string;
  /** The scope actually applied here, which is not always the band's — `S01` §3's "may or may not inherit". */
  scope: string;
};

export type WidgetCardProps = WidgetFrame & {
  /** The widget's kind, translated — "Balances", "Spend by category". */
  title: string;
  /** Present only while this widget's own read has not resolved yet. */
  loading?: boolean | undefined;
  /** Present only when this widget's own read failed — never the whole grid. */
  error?: string | undefined;
  children: React.ReactNode;
};

export function WidgetCard({
  title,
  currency,
  period,
  scope,
  loading = false,
  error,
  children,
}: WidgetCardProps) {
  const styles = useStyles();

  return (
    <View style={styles.card} accessibilityRole="none">
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>{`${currency} · ${period} · ${scope}`}</Text>
      </View>
      {loading ? (
        <Skeleton shape="block" label={title} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        children
      )}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  card: {
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    padding: space.x5,
    gap: space.x3,
    borderWidth: theme.elevation.card.borderWidth,
    borderColor: theme.elevation.card.borderColor,
  },
  header: {
    gap: space.xxs,
    borderBottomWidth: hairline.width,
    borderBottomColor: theme.hairline,
    paddingBottom: space.md,
  },
  title: { color: theme.text, ...text.ui("displayThree") },
  meta: { color: theme.textMuted, ...text.ui("caption") },
  error: { color: theme.dangerText, ...text.ui("body") },
}));
