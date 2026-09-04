/**
 * `<MergeCategorySheet>` — `screens/S19-settings-categories.md` §7: *"pick
 * the winner among same-kind leaves → preview → confirm."*
 *
 * **The preview does not depend on which winner is picked.** What moves is
 * every live row naming the loser — fixed the moment the sheet opens — so
 * `counts` arrives once, computed from the loser alone, and only the
 * direction line in `MergePreview` changes as the winner choice changes.
 *
 * **`ConfirmDialog` gates the write, not the preview.** Picking a winner
 * only updates what is shown; the merge itself waits for the explicit
 * confirm, matching §7's *"states it before it happens"*.
 */

import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { Select, type SelectOption } from "../primitives/select";
import { BottomSheet } from "../shell/bottom-sheet";
import { ConfirmDialog } from "../shell/confirm-dialog";
import { Banner } from "../states/banner";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { MergePreview, type MergePreviewCounts } from "./merge-preview";

export type MergeCategorySheetProps = {
  visible: boolean;
  loserName: string;
  candidates: readonly { id: string; name: string }[];
  counts: MergePreviewCounts;
  /** Pre-selects a winner — the collision finder's "Review" seeds both sides. */
  initialWinnerId?: string | null;
  error?: string;
  onConfirm: (winnerId: string) => void;
  onDismiss: () => void;
};

export function MergeCategorySheet({
  visible,
  loserName,
  candidates,
  counts,
  initialWinnerId = null,
  error,
  onConfirm,
  onDismiss,
}: MergeCategorySheetProps) {
  const t = useT();
  const styles = useStyles();
  const [winnerId, setWinnerId] = useState<string | null>(initialWinnerId);
  const [confirming, setConfirming] = useState(false);

  // Re-seeds on every open — one sheet instance reused across every pair,
  // the same reasoning `RenameCategorySheet` re-seeds its field.
  useEffect(() => {
    if (visible) setWinnerId(initialWinnerId);
  }, [visible, initialWinnerId]);

  const options: readonly SelectOption[] = candidates.map((candidate) => ({
    value: candidate.id,
    label: candidate.name,
  }));
  const winner = candidates.find((candidate) => candidate.id === winnerId) ?? null;

  const handleOpenConfirm = useCallback(() => setConfirming(true), []);
  const handleCancelConfirm = useCallback(() => setConfirming(false), []);
  const handleConfirm = useCallback(() => {
    if (winnerId === null) return;
    setConfirming(false);
    onConfirm(winnerId);
  }, [onConfirm, winnerId]);

  if (!visible) return null;

  return (
    <BottomSheet visible={visible} title={t("categories.merge")} onDismiss={onDismiss}>
      <View style={styles.body}>
        {error === undefined ? null : <Banner tone="negative" message={error} />}
        <Select
          label={t("categories.mergeWinnerLabel")}
          placeholder={t("categories.mergeWinnerPlaceholder")}
          options={options}
          value={winnerId}
          onChange={setWinnerId}
          searchable
        />
        {winner === null ? null : (
          <MergePreview loserName={loserName} winnerName={winner.name} counts={counts} />
        )}
        <Button
          label={t("categories.merge")}
          onPress={handleOpenConfirm}
          variant="primary"
          disabled={winner === null}
        />
      </View>
      <ConfirmDialog
        visible={confirming && winner !== null}
        title={t("categories.mergeConfirmTitle")}
        body={t("categories.mergeConfirmBody", { loser: loserName, winner: winner?.name ?? "" })}
        confirmLabel={t("categories.mergeConfirmAction")}
        onConfirm={handleConfirm}
        onCancel={handleCancelConfirm}
      />
    </BottomSheet>
  );
}

const useStyles = makeStyles(() => ({
  body: { gap: space.x3 },
}));
