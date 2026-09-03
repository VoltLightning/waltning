/**
 * `<EmptyState>` — `design-system/08` §8.1. Three variants, not one blank.
 *
 * The same empty region means three unrelated things, and conflating them is
 * "the commonest failure in this system": `first-run` (nothing has ever
 * existed here), `filtered` (things exist; this filter excludes them) and
 * `range` (things exist; this period has none). `variant` is required so a
 * call site cannot render the generic blank by omission.
 *
 * **`filtered` never composes its count into a pluralised sentence.** §8.1's
 * copy is `Scope · Business is excluding 1,284 rows`, and the honest way to
 * build that today is a fixed, non-declining line — `count` renders through
 * `states.filteredHidden`, which states a number beside a noun that does not
 * decline in English *or* Polish, rather than through a caller-built message
 * that would need `_one`/`_few`/`_many`/`_other` the catalogue does not carry
 * yet (the Polish-plurals card is blocked on a build). `body` still names the
 * excluding filter in prose; `count` is the actionable number beside it.
 */

import { Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type EmptyStateVariant = "first-run" | "filtered" | "range";

export type EmptyStateProps = {
  variant: EmptyStateVariant;
  title: string;
  body: string;
  /** `filtered` only — the number of rows the excluding filter is hiding. */
  count?: number;
  primaryAction: { label: string; onPress: () => void };
  secondaryAction?: { label: string; onPress: () => void };
};

export function EmptyState({
  variant,
  title,
  body,
  count,
  primaryAction,
  secondaryAction,
}: EmptyStateProps) {
  const t = useT();
  const styles = useStyles();
  return (
    <View style={styles.root}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {variant === "filtered" && count !== undefined ? (
        <Text style={styles.count}>{t("states.filteredHidden", { count })}</Text>
      ) : null}
      <View style={styles.actions}>
        <Button {...primaryAction} variant="primary" size="lg" />
        {secondaryAction ? <Button {...secondaryAction} variant="secondary" /> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { alignItems: "center", gap: space.x3, padding: space.x6 },
  title: { color: theme.text, ...text.display("displayTwo") },
  body: { color: theme.textMuted, ...text.ui("body"), textAlign: "center" },
  count: { color: theme.textMuted, ...text.ui("bodySm", 600), textAlign: "center" },
  actions: { width: "100%", gap: space.xl },
}));
