/**
 * `<CategoryActionsSheet>` — `screens/S19-settings-categories.md` §3, §4.
 * The menu a tree row's trailing `IconButton` opens: Rename · Move · Convert
 * · Merge · Archive.
 *
 * **The offered set depends on the node.** `TAXONOMY.md` R1/R2 (group *or*
 * leaf, two levels only) means Move and Merge apply to a leaf alone — a
 * group already sits at the root, and `merge_categories` refuses a group on
 * either side. Convert always applies (leaf → group needs it empty; group →
 * leaf needs it childless — the controller's own refusal, not this menu's,
 * says which).
 *
 * **An inline `Banner` carries a direct action's refusal.** Convert and
 * Archive write immediately from here — no further sheet — so a refusal
 * (the count TAXONOMY.md names) has nowhere else to land; Rename, Move and
 * Merge open their own sheet, which carries its own refusal inline instead.
 */

import { View } from "react-native";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { BottomSheet } from "../shell/bottom-sheet";
import { Banner } from "../states/banner";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type CategoryActionsTarget = {
  id: string;
  name: string;
  isLeaf: boolean;
};

export type CategoryActionsSheetProps = {
  visible: boolean;
  category: CategoryActionsTarget | null;
  /** Set only after a direct write (convert/archive) refuses. */
  error?: string;
  onRename: () => void;
  onMove: () => void;
  onConvert: () => void;
  onMerge: () => void;
  onArchive: () => void;
  onDismiss: () => void;
};

export function CategoryActionsSheet({
  visible,
  category,
  error,
  onRename,
  onMove,
  onConvert,
  onMerge,
  onArchive,
  onDismiss,
}: CategoryActionsSheetProps) {
  const t = useT();
  const styles = useStyles();
  if (!category) return null;

  return (
    <BottomSheet visible={visible} title={category.name} onDismiss={onDismiss}>
      <View style={styles.actions}>
        {error === undefined ? null : <Banner tone="negative" message={error} />}
        <Button label={t("categories.rename")} onPress={onRename} variant="secondary" />
        {category.isLeaf ? (
          <Button label={t("categories.move")} onPress={onMove} variant="secondary" />
        ) : null}
        <Button
          label={t(category.isLeaf ? "categories.convertToGroup" : "categories.convertToLeaf")}
          onPress={onConvert}
          variant="secondary"
        />
        {category.isLeaf ? (
          <Button label={t("categories.merge")} onPress={onMerge} variant="secondary" />
        ) : null}
        <Button label={t("categories.archive")} onPress={onArchive} variant="danger" />
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles(() => ({
  actions: { gap: space.x3 },
}));
