/**
 * `<MoveCategorySheet>` — `screens/S19-settings-categories.md` §3, §4.
 * `reparent_category`'s picker, over `Select` — the plan's own fallback:
 * D4a's `CategorySheet` has no group-only mode, and building one for a
 * single caller here would be the abstraction `architecture/11` asks to wait
 * for a third use of.
 *
 * **`groups` arrives pre-filtered by the screen** — same kind as the leaf
 * being moved, self and descendants excluded (a leaf has none, but the
 * screen's own read does not know that in general) — so this stays a bare
 * picker with no taxonomy logic of its own. The refusal a bad pick still
 * produces (cross-kind, a cycle) comes back on `error` regardless, because
 * the controller is the authority, not this filter.
 */

import { useCallback, useState } from "react";
import { View } from "react-native";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { Select, type SelectOption } from "../primitives/select";
import { BottomSheet } from "../shell/bottom-sheet";
import { Banner } from "../states/banner";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type MoveCategorySheetProps = {
  visible: boolean;
  categoryName: string;
  groups: readonly { id: string; name: string }[];
  error?: string;
  onSave: (groupId: string | null) => void;
  onDismiss: () => void;
};

export function MoveCategorySheet({
  visible,
  categoryName,
  groups,
  error,
  onSave,
  onDismiss,
}: MoveCategorySheetProps) {
  const t = useT();
  const styles = useStyles();
  const [groupId, setGroupId] = useState<string | null>(null);

  const options: readonly SelectOption[] = groups.map((group) => ({
    value: group.id,
    label: group.name,
  }));

  const handleSave = useCallback(() => onSave(groupId), [onSave, groupId]);

  if (!visible) return null;

  return (
    <BottomSheet visible={visible} title={t("categories.move")} onDismiss={onDismiss}>
      <View style={styles.body}>
        {error === undefined ? null : <Banner tone="negative" message={error} />}
        <Select
          label={`${t("categories.moveTargetLabel")} · ${categoryName}`}
          placeholder={t("categories.moveTargetPlaceholder")}
          options={options}
          value={groupId}
          onChange={setGroupId}
          searchable
        />
        <Button
          label={t("common.save")}
          onPress={handleSave}
          variant="primary"
          disabled={groupId === null}
        />
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles(() => ({
  body: { gap: space.x3 },
}));
