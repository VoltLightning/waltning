/**
 * `<MatchWarning>` — `design-system/08` §8.4. Fires on save when a new name
 * closely matches an existing one.
 *
 * Shows the candidate **with its balance and transaction count**, because
 * that is what makes the risk legible — merging two spellings of one person
 * corrupts a balance (`SPEC.md` §6.6), and an abstract warning does not convey
 * that. The balance renders through `<Amount>`, never restated as a string.
 *
 * **`balance` is `null` when the candidate's own cross-currency net could not
 * be computed** (P1 — one of *their* held currencies has no rate) — the
 * figure is omitted rather than showing a wrong or partial number; the
 * warning still fires on the name alone.
 *
 * **Two explicit actions, no default.** Both buttons are `secondary` — the
 * moment one of them is `primary` it reads as the recommended choice, and
 * §8.4 is explicit that there is not one: *"This is the same one"* merges,
 * *"These are different"* proceeds and records the decision so the pair is
 * never asked about again.
 */

import type * as money from "@waltning/core/money";
import { Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type MatchWarningCandidate = {
  name: string;
  /** `null` when the candidate's own net could not be computed (P1) — the figure is omitted. */
  balance: money.Money | null;
  currency: string;
  decimals?: number;
  transactionCount: number;
};

export type MatchWarningProps = {
  candidate: MatchWarningCandidate;
  onSame: () => void;
  onDifferent: () => void;
};

export function MatchWarning({ candidate, onSame, onDifferent }: MatchWarningProps) {
  const t = useT();
  const styles = useStyles();

  return (
    <View style={styles.root}>
      <View style={styles.candidate}>
        <Text style={styles.name}>{candidate.name}</Text>
        {candidate.balance === null ? null : (
          <Amount
            value={candidate.balance}
            currency={candidate.currency}
            decimals={candidate.decimals ?? 2}
            size="body"
          />
        )}
        <Text style={styles.meta}>
          {t("states.matchWarning.transactionCount", { count: candidate.transactionCount })}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button
          label={t("states.matchWarning.same")}
          onPress={onSame}
          variant="secondary"
          size="md"
        />
        <Button
          label={t("states.matchWarning.different")}
          onPress={onDifferent}
          variant="secondary"
          size="md"
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.x3 },
  candidate: { gap: space.xs },
  name: { color: theme.text, ...text.ui("body", 600) },
  meta: { color: theme.textMuted, ...text.ui("bodySm") },
  actions: { flexDirection: "row", gap: space.x3 },
}));
