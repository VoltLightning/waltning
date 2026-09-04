/**
 * `<RenameCategorySheet>` — `screens/S19-settings-categories.md` §6: *"rename
 * collides with a sibling → refused by the uniqueness index, naming the
 * existing sibling."* That refusal lands on `error`, exactly where
 * `TextField` already shows one — no separate banner needed for the one
 * action whose refusal is inherently about a single field.
 */

import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { TextField } from "../primitives/text-field";
import { BottomSheet } from "../shell/bottom-sheet";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type RenameCategorySheetProps = {
  visible: boolean;
  categoryName: string;
  error?: string;
  onSave: (name: string) => void;
  onDismiss: () => void;
};

export function RenameCategorySheet({
  visible,
  categoryName,
  error,
  onSave,
  onDismiss,
}: RenameCategorySheetProps) {
  const t = useT();
  const styles = useStyles();
  const [name, setName] = useState(categoryName);

  // Re-seeds on every open — the sheet is one instance reused across every
  // row, and a `useState` initializer alone would keep whichever category's
  // name it first mounted with.
  useEffect(() => {
    if (visible) setName(categoryName);
  }, [visible, categoryName]);

  const handleSave = useCallback(() => onSave(name), [onSave, name]);

  if (!visible) return null;

  return (
    <BottomSheet visible={visible} title={t("categories.rename")} onDismiss={onDismiss}>
      <View style={styles.body}>
        <TextField
          label={t("common.name")}
          value={name}
          onChangeText={setName}
          {...(error === undefined ? {} : { error })}
          autoFocus
        />
        <Button label={t("common.save")} onPress={handleSave} variant="primary" />
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles(() => ({
  body: { gap: space.x3 },
}));
