/**
 * `<CreateCategorySheet>` — S19's own `create_category`.
 *
 * **The same write S06's sheet already makes**, offered from the screen that
 * manages the taxonomy rather than only from the one that spends it: on a
 * fresh ledger, S19 showed a search field over nothing and no way to put
 * anything under it.
 *
 * **Kind is asked, not inferred.** S06's sheet is opened *from a capture*,
 * which already knows whether money is going out or coming in, so it filters
 * the tree to one half and never has to ask. Nothing here knows that — a
 * category created from Settings belongs to whichever side the person says.
 *
 * **The parent is optional, and that is not a shortcut.** `TAXONOMY.md` R1
 * makes a node a group or a leaf, never both, and a ledger whose taxonomy is
 * empty has no group to create the first leaf under. Left unchosen the write
 * creates a top-level category; `convert_leaf_group` is what turns it into a
 * group afterwards. The controller refuses anything this permits and should
 * not — it is the authority, not this picker (`MoveCategorySheet`'s own note).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { RadioGroup } from "../primitives/radio";
import { Select, type SelectOption } from "../primitives/select";
import { TextField } from "../primitives/text-field";
import { BottomSheet } from "../shell/bottom-sheet";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type CreateCategoryGroup = { id: string; name: string; kind: "income" | "expense" };

export type CreateCategoryDraft = {
  name: string;
  kind: "income" | "expense";
  parentId: string | null;
};

export type CreateCategorySheetProps = {
  visible: boolean;
  /** Every group the taxonomy holds, both kinds — narrowed here by the kind chosen. */
  groups: readonly CreateCategoryGroup[];
  /** The refusal from the last attempt — a sibling collision lands on the name field. */
  error?: string;
  onSave: (draft: CreateCategoryDraft) => void;
  onDismiss: () => void;
};

export function CreateCategorySheet({
  visible,
  groups,
  error,
  onSave,
  onDismiss,
}: CreateCategorySheetProps) {
  const t = useT();
  const styles = useStyles();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [parentId, setParentId] = useState<string | null>(null);

  // Re-seeds on every open — one instance is reused across every create, and
  // a `useState` initializer alone would keep the last attempt's draft.
  useEffect(() => {
    if (visible) {
      setName("");
      setKind("expense");
      setParentId(null);
    }
  }, [visible]);

  const kindOptions = useMemo(
    (): readonly [
      { value: "income" | "expense"; label: string },
      { value: "income" | "expense"; label: string },
    ] => [
      { value: "expense", label: t("transactions.expense") },
      { value: "income", label: t("transactions.income") },
    ],
    [t],
  );

  const options: readonly SelectOption[] = useMemo(
    () =>
      groups
        .filter((group) => group.kind === kind)
        .map((group) => ({ value: group.id, label: group.name })),
    [groups, kind],
  );

  const handleKindChange = useCallback((value: string) => {
    setKind(value === "income" ? "income" : "expense");
    // A group of the other kind is not a legal parent (`reparent_category`
    // refuses across kinds), so the pick does not survive the switch.
    setParentId(null);
  }, []);

  const trimmed = name.trim();
  const handleSave = useCallback(
    () => onSave({ name: trimmed, kind, parentId }),
    [kind, onSave, parentId, trimmed],
  );

  if (!visible) return null;

  return (
    <BottomSheet visible={visible} title={t("categories.newCategory")} onDismiss={onDismiss}>
      <View style={styles.body}>
        <TextField
          label={t("common.name")}
          value={name}
          onChangeText={setName}
          maxLength={120}
          {...(error === undefined ? {} : { error })}
          autoFocus
        />
        <RadioGroup
          label={t("categories.kind")}
          options={kindOptions}
          value={kind}
          onChange={handleKindChange}
        />
        <Select
          label={t("categories.moveTargetLabel")}
          placeholder={t("categories.noParent")}
          options={options}
          value={parentId}
          onChange={setParentId}
          searchable
        />
        <Button
          label={t("common.save")}
          onPress={handleSave}
          variant="primary"
          disabled={trimmed === ""}
        />
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles(() => ({
  body: { gap: space.x3 },
}));
