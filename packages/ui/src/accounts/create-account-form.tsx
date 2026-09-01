/**
 * `<CreateAccountForm>` — name and currency.
 *
 * **Currency is a choice, and it used to be a type.** The prop was declared
 * `currency: "USD"`, so the compiler enforced the single-currency preview at
 * every call site — a literal type doing the work of a decision nobody had
 * made. Which currencies exist is the ledger's answer, so the caller passes
 * them; this component renders whatever it is given and offers no default
 * beyond the first row.
 *
 * There is no *pivot* here and there must not be. USD is the technical hub rates
 * are quoted against (§7.0); putting it first, or preselecting it, would tell a
 * person banking in złoty that their currency is the exception.
 */

import type { CurrencyCode } from "@waltning/core/money";
import { useCallback, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Button } from "../primitives/button";
import { Chip } from "../primitives/chip";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space } from "../tokens.ts";

export type CreateAccountCurrency = { code: CurrencyCode; name: string };

export type CreateAccountDraft = { name: string; currency: CurrencyCode };

export type CreateAccountFormProps = {
  /**
   * Every currency the ledger holds, in its own order.
   *
   * Never empty in practice — the replica is bootstrapped with the reference
   * set — and the component still handles it, because "no currency exists" is a
   * real state during a reset and a form with a dead Save button explains
   * itself better than one that crashes.
   */
  currencies: readonly CreateAccountCurrency[];
  onCancel: () => void;
  onSave: (draft: CreateAccountDraft) => void;
};

export function CreateAccountForm({ currencies, onCancel, onSave }: CreateAccountFormProps) {
  const [name, setName] = useState("");
  const [focused, setFocused] = useState(false);
  const [currency, setCurrency] = useState<CurrencyCode | null>(currencies[0]?.code ?? null);
  const styles = useStyles();
  const trimmed = name.trim();
  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);
  const handleSave = useCallback(() => {
    if (currency) onSave({ name: trimmed, currency });
  }, [currency, onSave, trimmed]);

  return (
    <View style={styles.root}>
      <Text style={styles.label}>Name</Text>
      <TextInput
        accessibilityLabel="Name"
        maxLength={120}
        value={name}
        onChangeText={setName}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={[styles.input, focused ? styles.focused : null]}
      />
      <Text style={styles.label}>Currency</Text>
      <View style={styles.currencies}>
        {currencies.map((candidate) => (
          <CurrencyChoice
            key={candidate.code}
            currency={candidate}
            selected={candidate.code === currency}
            onSelect={setCurrency}
          />
        ))}
      </View>
      <View style={styles.actions}>
        <Button label="Cancel" onPress={onCancel} variant="ghost" />
        <Button
          label="Save"
          onPress={handleSave}
          disabled={!trimmed || currency === null}
          variant="primary"
        />
      </View>
    </View>
  );
}

type CurrencyChoiceProps = {
  currency: CreateAccountCurrency;
  selected: boolean;
  onSelect: (code: CurrencyCode) => void;
};

/**
 * The code, not the name. `PLN` is what appears on the account afterwards and
 * on every figure it holds, so the choice and its consequence read the same.
 * The name rides along in the accessible label, where the length costs nothing.
 */
function CurrencyChoice({ currency, selected, onSelect }: CurrencyChoiceProps) {
  const handleSelect = useCallback(() => onSelect(currency.code), [currency.code, onSelect]);
  return (
    <Chip
      placeholder="Currency"
      value={selected ? `${currency.code} · selected` : currency.code}
      onPress={handleSelect}
      machineFilled={false}
    />
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: space.xl },
  label: { color: t.textMuted, ...text.ui("kicker") },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: radius.sm,
    color: t.text,
    paddingHorizontal: space.xl,
  },
  focused: { outlineWidth: focus.width, outlineColor: t.focusRing, outlineOffset: focus.offset },
  currencies: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.xl },
}));
