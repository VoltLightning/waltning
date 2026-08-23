import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Button } from "../primitives/button";
import { face } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, type } from "../tokens.ts";

export type CreateAccountFormProps = {
  currency: "USD";
  onCancel: () => void;
  onSave: (name: string) => void;
};

export function CreateAccountForm({ currency, onCancel, onSave }: CreateAccountFormProps) {
  const [name, setName] = useState("");
  const [focused, setFocused] = useState(false);
  const styles = useStyles();
  const trimmed = name.trim();
  return (
    <View style={styles.root}>
      <Text style={styles.label}>Name</Text>
      <TextInput
        accessibilityLabel="Name"
        maxLength={120}
        value={name}
        onChangeText={setName}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, focused ? styles.focused : null]}
      />
      <Text style={styles.label}>Currency</Text>
      <Text style={styles.currency}>{currency}</Text>
      <View style={styles.actions}>
        <Button label="Cancel" onPress={onCancel} variant="ghost" />
        <Button
          label="Save"
          onPress={() => onSave(trimmed)}
          disabled={!trimmed}
          variant="primary"
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: space.xl },
  label: { color: t.textMuted, fontSize: type.kicker.fontSize, ...face.ui(700) },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: radius.sm,
    color: t.text,
    paddingHorizontal: space.xl,
  },
  focused: { outlineWidth: focus.width, outlineColor: t.focusRing, outlineOffset: focus.offset },
  currency: { color: t.text, fontSize: type.body.fontSize },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.xl },
}));
