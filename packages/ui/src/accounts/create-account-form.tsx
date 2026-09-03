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
import { Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { Chip } from "../primitives/chip";
import { TextField } from "../primitives/text-field";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type CreateAccountCurrency = { code: CurrencyCode; name: string; symbol: string };

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
  const t = useT();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode | null>(currencies[0]?.code ?? null);
  const styles = useStyles();
  const trimmed = name.trim();
  const handleSave = useCallback(() => {
    if (currency) onSave({ name: trimmed, currency });
  }, [currency, onSave, trimmed]);

  return (
    <View style={styles.root}>
      {/* 120 is the shared operation contract's cap, stated where it binds. */}
      <TextField label={t("common.name")} value={name} onChangeText={setName} maxLength={120} />
      <Text style={styles.label}>{t("accounts.currency")}</Text>
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
        <Button label={t("common.cancel")} onPress={onCancel} variant="ghost" />
        <Button
          label={t("common.save")}
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
 * The code and its symbol, not the name. `PLN` is what appears on the account
 * afterwards and on every figure it holds, so the choice and its consequence
 * read the same; `zł` beside it is the glyph the figures will actually carry,
 * which is how someone who thinks in symbols finds the code. The name rides
 * along in the accessible label, where the length costs nothing.
 */
function CurrencyChoice({ currency, selected, onSelect }: CurrencyChoiceProps) {
  const t = useT();
  const handleSelect = useCallback(() => onSelect(currency.code), [currency.code, onSelect]);
  return (
    <Chip
      placeholder={t("accounts.currency")}
      value={`${currency.code} ${currency.symbol}`}
      selected={selected}
      onPress={handleSelect}
      machineFilled={false}
    />
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.xl },
  label: { color: theme.textMuted, ...text.ui("kicker") },
  currencies: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.xl },
}));
