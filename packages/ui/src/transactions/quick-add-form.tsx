import * as money from "@waltning/core/money";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { AmountField, parseAmount } from "../fx/amount-field";
import { Button } from "../primitives/button";
import { Chip } from "../primitives/chip";
import { face } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space, type } from "../tokens.ts";

export type QuickAddAccount = { id: string; name: string; currency: "USD" };
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
  const [amount, setAmount] = useState(parseAmount(initialAmount) ?? "");
  const [accountId, setAccountId] = useState<string | null>(
    accounts.some((account) => account.id === initialAccountId) ? (initialAccountId ?? null) : null,
  );
  const styles = useStyles();
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
    if (accountId) onSave({ amount, accountId });
  }, [accountId, amount, onSave]);

  return (
    <View style={styles.root}>
      <AmountField
        label="Amount"
        currency="USD"
        initial={initialAmount}
        onChange={handleAmountChange}
      />
      <Text style={styles.label}>Account</Text>
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
      <Button label="Create account…" onPress={handleCreateAccount} variant="secondary" />
      <View style={styles.actions}>
        <Button label="Cancel" onPress={onCancel} variant="ghost" />
        <Button
          label="Save"
          onPress={handleSave}
          disabled={!positive || !accountId}
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

function AccountChoice({ account, selected, onSelect }: AccountChoiceProps) {
  const handleSelect = useCallback(() => onSelect(account.id), [account.id, onSelect]);
  return (
    <Chip
      placeholder="Account"
      value={selected ? `${account.name} · selected` : account.name}
      onPress={handleSelect}
      machineFilled={false}
    />
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: space.x3 },
  label: { color: t.textMuted, fontSize: type.kicker.fontSize, ...face.ui(700) },
  accounts: { gap: space.md },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.xl },
}));
