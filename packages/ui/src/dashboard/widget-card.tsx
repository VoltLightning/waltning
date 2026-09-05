/**
 * `<WidgetCard>` — `S01` §4's `WidgetCard`, the one shell every dashboard
 * widget shares.
 *
 * **Every widget states its own period and scope in its header** (`S01` §3):
 * a figure on a dashboard with no stated frame is a figure you will misread.
 * `meta` is that line — the caller composes it (a period label, a `·`, a
 * scope label — `transaction-row.tsx`'s own join precedent), never a prop
 * this component derives on its own, because it has no reader to derive it
 * from.
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

export type WidgetCardProps = {
  /** The widget's kind, translated — "Balances", "Spend by category". */
  title: string;
  /** Period and scope, composed by the caller — "August 2026 · Mine". */
  meta: string;
  /** Present only while this widget's own read has not resolved yet. */
  loading?: boolean | undefined;
  /** Present only when this widget's own read failed — never the whole grid. */
  error?: string | undefined;
  children: React.ReactNode;
};

export function WidgetCard({ title, meta, loading = false, error, children }: WidgetCardProps) {
  const styles = useStyles();

  return (
    <View style={styles.card} accessibilityRole="none">
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>{meta}</Text>
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
