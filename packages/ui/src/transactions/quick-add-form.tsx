import { money } from "@waltning/core";
import { useState } from "react";
import { Text, View } from "react-native";
import { AmountField, parseAmount } from "../fx/amount-field";
import { Button } from "../primitives/button";
import { Chip } from "../primitives/chip";
import { face, makeStyles } from "../theme/index.ts";
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

  return (
    <View style={styles.root}>
      <AmountField
        label="Amount"
        currency="USD"
        initial={initialAmount}
        onChange={(next) => setAmount(next ?? "")}
      />
      <Text style={styles.label}>Account</Text>
      <View style={styles.accounts}>
        {accounts.map((account) => (
          <Chip
            key={account.id}
            placeholder="Account"
            value={account.id === accountId ? `${account.name} · selected` : account.name}
            onPress={() => setAccountId(account.id)}
            machineFilled={false}
          />
        ))}
      </View>
      <Button
        label="Create account…"
        onPress={() => onCreateAccount({ amount, accountId })}
        variant="secondary"
      />
      <View style={styles.actions}>
        <Button label="Cancel" onPress={onCancel} variant="ghost" />
        <Button
          label="Save"
          onPress={() => accountId && onSave({ amount, accountId })}
          disabled={!positive || !accountId}
          variant="primary"
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: space.x3 },
  label: { color: t.textMuted, fontSize: type.kicker.fontSize, ...face.ui(700) },
  accounts: { gap: space.md },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.xl },
}));
