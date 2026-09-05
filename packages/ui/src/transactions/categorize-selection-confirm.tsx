/**
 * `<CategorizeSelectionConfirm>` — S10 §7 (web): "categorize_batch behind one
 * confirm." Shown once a category has been picked for a multi-selected
 * range, before the write happens.
 *
 * **Not `design-system/05` §5.3's `<DiffCard>`.** That component's shape is
 * a per-row before/after — right for one transaction, one agent write —
 * and a batch spans rows that each carried a different category before, so
 * a single before/after pair would either lie (pick one row's) or say
 * nothing (blank). `docs/specification/screens/S10-transactions-list.md` §7
 * has been written to match: a confirm, not a claimed `DiffCard`.
 *
 * **It states what is being overwritten, which a count alone does not**
 * (DESK3 review round 1, M). Select twenty rows of which fourteen already
 * read `Groceries` and six read `Eating out`, pick `Groceries`, and a bare
 * "Categorise 20 transactions as Groceries?" is indistinguishable from the
 * case where all twenty were uncategorised — the reader is approving a
 * change they cannot see the shape of. `fromCategories` is the third option
 * the `DiffCard` argument above skips over: not one row's before/after and
 * not nothing, but the *set* of categories the batch is leaving —
 * "from Eating out, Uncategorised → Groceries" — plus how many rows already
 * carry the target and are therefore not really changing at all.
 *
 * **Never a modal** — `05` §5.3's own rule for the component this replaces
 * still applies: the confirm *is* the decision, not a dialog on top of one.
 *
 * **`error` does not print the caught message.** `use-transaction-search.ts`
 * already keeps a failed read's raw string out of the screen; this keeps the
 * same rule for a failed write — `categorize_batch`'s one real refusal
 * (`transactions_category_shape`: a named row is gone, or not income or
 * expense) has one stated reason, catalogued once, rather than whatever a
 * thrown `Error#message` happened to say.
 */

import { Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { hairline, radius, space } from "../tokens.ts";

export type CategorizeSelectionConfirmState = "pending" | "applying" | "approved" | "error";

export type CategorizeSelectionConfirmProps = {
  /** Rows in the batch — every one of them is written, matching or not. */
  count: number;
  categoryName: string;
  /**
   * The distinct categories those rows carry *now*, already resolved for
   * display (an uncategorised row arrives as the caller's own word for it).
   * Empty renders no "from" line at all — a caller with nothing to say.
   */
  fromCategories?: readonly string[];
  /** How many of `count` already carry `categoryName` — `0` renders no line. */
  alreadyMatching?: number;
  state: CategorizeSelectionConfirmState;
  onApprove: () => void;
  onDecline: () => void;
  /** `approved` only — the applied line has no other way off screen. */
  onDismiss?: () => void;
};

export function CategorizeSelectionConfirm({
  count,
  categoryName,
  fromCategories = [],
  alreadyMatching = 0,
  state,
  onApprove,
  onDecline,
  onDismiss,
}: CategorizeSelectionConfirmProps) {
  const t = useT();
  const styles = useStyles();

  if (state === "approved") {
    return (
      <View style={[styles.root, styles.rootApproved]}>
        <Text style={styles.approvedText}>
          {count === 1
            ? t("transactions.categorizeBatchAppliedOne", { count })
            : t("transactions.categorizeBatchAppliedMany", { count })}
        </Text>
        {onDismiss ? (
          <Button label={t("common.close")} variant="ghost" size="sm" onPress={onDismiss} />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.summary}>
        {count === 1
          ? t("transactions.confirmCategorizeBatchOne", { count, category: categoryName })
          : t("transactions.confirmCategorizeBatchMany", { count, category: categoryName })}
      </Text>
      {fromCategories.length > 0 ? (
        <Text style={styles.detail}>
          {t("transactions.categorizeBatchFromTo", {
            // Joined here rather than by the caller so the separator is one
            // decision in one place; the words themselves are the caller's.
            from: fromCategories.join(", "),
            to: categoryName,
          })}
        </Text>
      ) : null}
      {alreadyMatching > 0 ? (
        <Text style={styles.detail}>
          {alreadyMatching === 1
            ? t("transactions.categorizeBatchAlreadyOne", {
                count: alreadyMatching,
                category: categoryName,
              })
            : t("transactions.categorizeBatchAlreadyMany", {
                count: alreadyMatching,
                category: categoryName,
              })}
        </Text>
      ) : null}
      {state === "error" ? (
        <Text style={styles.error}>{t("transactions.categorizeBatchFailedWhy")}</Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          label={t("common.decline")}
          variant="secondary"
          size="sm"
          disabled={state === "applying"}
          onPress={onDecline}
        />
        <Button
          label={t("common.approve")}
          variant="primary"
          size="sm"
          loading={state === "applying"}
          onPress={onApprove}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    gap: space.md,
    padding: space.x3,
    borderRadius: radius.md,
    borderWidth: hairline.width,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  rootApproved: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderColor: theme.income,
    backgroundColor: theme.accentFill,
  },
  summary: { color: theme.text, ...text.ui("bodySm", 500) },
  detail: { color: theme.textMuted, ...text.ui("caption") },
  approvedText: { color: theme.income, ...text.ui("bodySm", 600) },
  error: { color: theme.dangerText, ...text.ui("caption") },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.md },
}));
