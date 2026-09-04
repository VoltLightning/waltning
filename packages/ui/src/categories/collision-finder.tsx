/**
 * `<CollisionFinder>` — `screens/S19-settings-categories.md` §9.2, the
 * decided open question: *"same mechanism as `MatchWarning` — trigram
 * similarity, ranked, showing usage counts."*
 *
 * **A ranked list, not a modal gate.** `MatchWarning` (`states/`) interrupts
 * a single save with two equal actions and records a *"these are different"*
 * decision, because a counterparty proposal is one candidate found at one
 * moment. A taxonomy has 59 leaves that drift apart over months — `Groceries`
 * and `Grocery`, created under different groups — so this sits above the
 * tree as a passive, always-current list; picking a pair opens the merge
 * sheet already seeded with both.
 */

import { useCallback } from "react";
import { Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type CollisionCandidate = {
  a: { id: string; name: string; usageCount: number };
  b: { id: string; name: string; usageCount: number };
  score: number;
};

export type CollisionFinderProps = {
  candidates: readonly CollisionCandidate[];
  onReview: (aId: string, bId: string) => void;
};

export function CollisionFinder({ candidates, onReview }: CollisionFinderProps) {
  const t = useT();
  const styles = useStyles();

  if (candidates.length === 0) return null;

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t("categories.collisionsTitle")}</Text>
      {candidates.map((candidate) => (
        <CollisionRow
          key={`${candidate.a.id}:${candidate.b.id}`}
          candidate={candidate}
          onReview={onReview}
        />
      ))}
    </View>
  );
}

function usageOf(t: ReturnType<typeof useT>, count: number): string {
  return count === 1 ? t("categories.usageOne", { count }) : t("categories.usageMany", { count });
}

type CollisionRowProps = {
  candidate: CollisionCandidate;
  onReview: (aId: string, bId: string) => void;
};

function CollisionRow({ candidate, onReview }: CollisionRowProps) {
  const t = useT();
  const styles = useStyles();
  const handleReview = useCallback(
    () => onReview(candidate.a.id, candidate.b.id),
    [onReview, candidate.a.id, candidate.b.id],
  );

  return (
    <View style={styles.row}>
      <View style={styles.names}>
        <Text style={styles.name}>
          {candidate.a.name} · {usageOf(t, candidate.a.usageCount)}
        </Text>
        <Text style={styles.name}>
          {candidate.b.name} · {usageOf(t, candidate.b.usageCount)}
        </Text>
      </View>
      <Button
        label={t("categories.collisionsReview")}
        onPress={handleReview}
        variant="secondary"
        size="sm"
      />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.sm },
  title: { color: theme.textMuted, ...text.ui("kicker") },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
  },
  names: { gap: space.xxs },
  name: { color: theme.text, ...text.ui("bodySm") },
}));
