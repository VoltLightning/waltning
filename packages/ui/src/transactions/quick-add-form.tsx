import type { CurrencyCode } from "@waltning/core/money";
import * as money from "@waltning/core/money";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { AmountField, parseAmount } from "../fx/amount-field";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { Chip } from "../primitives/chip";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

/**
 * `currency` was declared `"USD"`, which made the compiler the enforcer of a
 * single-currency preview at every call site. It is the account's own currency,
 * and the amount field takes it from whichever account is selected — an expense
 * is denominated by the account it leaves.
 */
export type QuickAddAccount = {
  id: string;
  name: string;
  currency: CurrencyCode;
  /**
   * Whether an expense against this account can be valued.
   *
   * `false` when the ledger holds no exchange rate for the account's currency,
   * which is the ordinary state of a phone that has never synced (§14.6). The
   * account is shown either way — hiding it would read as *this account is
   * gone* rather than *not into this one, yet* — and picking it explains why.
   */
  capturable: boolean;
};
export type QuickAddFormProps = {
  accounts: readonly QuickAddAccount[];
  initialAmount?: string;
  initialAccountId?: string;
  onCancel: () => void;
  onCreateAccount: (draft: { amount: string; accountId: string | null }) => void;
  onSave: (draft: { amount: string; accountId: string }) => void;
};

export function QuickAddForm({
  accounts,
  initialAmount = "",
  initialAccountId,
  onCancel,
  onCreateAccount,
  onSave,
}: QuickAddFormProps) {
  const t = useT();
  const [amount, setAmount] = useState(parseAmount(initialAmount) ?? "");
  const [accountId, setAccountId] = useState<string | null>(
    accounts.some((account) => account.id === initialAccountId) ? (initialAccountId ?? null) : null,
  );
  const styles = useStyles();
  const selected = accounts.find((account) => account.id === accountId);
  const blocked = selected !== undefined && !selected.capturable;
  let positive = false;
  try {
    positive = amount !== "" && money.dec(amount).gt(0);
  } catch {
    positive = false;
  }
  const handleAmountChange = useCallback((next: string | null) => setAmount(next ?? ""), []);
  const handleCreateAccount = useCallback(
    () => onCreateAccount({ amount, accountId }),
    [accountId, amount, onCreateAccount],
  );
  const handleSave = useCallback(() => {
    if (accountId && !blocked) onSave({ amount, accountId });
  }, [accountId, amount, blocked, onSave]);

  return (
    <View style={styles.root}>
      {/* No account chosen yet, so no currency is known — and a placeholder
          currency here would be a figure labelled in something the money is
          not. The field carries the label alone until one is picked. */}
      <AmountField
        label={t("transactions.amount")}
        {...(selected ? { currency: selected.currency } : {})}
        initial={initialAmount}
        onChange={handleAmountChange}
      />
      <Text style={styles.label}>{t("transactions.account")}</Text>
      <View style={styles.accounts}>
        {accounts.map((account) => (
          <AccountChoice
            key={account.id}
            account={account}
            selected={account.id === accountId}
            onSelect={setAccountId}
          />
        ))}
      </View>
      {/* Under the picker, not under Save: the reason belongs to the choice
          that caused it, and Save being dim is the consequence rather than the
          thing to explain. */}
      {blocked ? (
        <Text style={styles.blocked}>
          {t("transactions.needsRate", { currency: selected.currency })}
        </Text>
      ) : null}
      <Button label={t("accounts.create")} onPress={handleCreateAccount} variant="secondary" />
      <View style={styles.actions}>
        <Button label={t("common.cancel")} onPress={onCancel} variant="ghost" />
        <Button
          label={t("common.save")}
          onPress={handleSave}
          disabled={!positive || !accountId || blocked}
          variant="primary"
        />
      </View>
    </View>
  );
}

type AccountChoiceProps = {
  account: QuickAddAccount;
  selected: boolean;
  onSelect: (accountId: string) => void;
};

/**
 * An uncapturable account is still selectable, and that is deliberate. Making
 * the chip `disabled` would say *this account is unavailable* with no way to
 * ask why; letting it be chosen puts the reason on the screen the moment
 * someone wonders.
 */
function AccountChoice({ account, selected, onSelect }: AccountChoiceProps) {
  const t = useT();
  const handleSelect = useCallback(() => onSelect(account.id), [account.id, onSelect]);
  return (
    <Chip
      placeholder={t("transactions.account")}
      value={selected ? t("common.chipSelected", { value: account.name }) : account.name}
      onPress={handleSelect}
      machineFilled={false}
    />
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.x3 },
  label: { color: theme.textMuted, ...text.ui("kicker") },
  accounts: { gap: space.md },
  blocked: { color: theme.textMuted, ...text.ui("caption") },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.xl },
}));
