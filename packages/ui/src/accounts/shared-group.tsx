/**
 * `<SharedGroup>` — S16 §3, §4: *"visually distinct but not diminished."*
 *
 * A jointly-owned account is an ordinary account that belongs to a different
 * total (§6.7) — so this renders at the same weight as any of the register's
 * kind groups, and the one thing that sets it apart is a rule above it,
 * pulling the section away from the accounts that are only yours. A negative
 * balance in here gets no warning treatment; it is an ordinary fact about a
 * shared account, not a signal.
 *
 * **One subtotal per currency, never across two** (`money.sum` — the same
 * rule `create-phone-ledger.ts`'s per-currency subtotals hold for the whole
 * ledger, restated for one group).
 */

import type * as money from "@waltning/core/money";
import { useCallback } from "react";
import { Text, View } from "react-native";
import { Amount } from "../fx/amount";
import { useT } from "../i18n/provider";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { hairline, space } from "../tokens.ts";
import { BalanceRow } from "./balance-row";
import { subtotalsOf } from "./subtotals.ts";

export type SharedGroupAccount = {
  id: string;
  name: string;
  /** Already translated — S16 §4's `AccountKind` label, resolved by the caller. */
  kind: string;
  balance: money.Money;
  currency: string;
  decimals?: number;
  isBusiness?: boolean;
  /** A clearing account whose balance is not zero (§6.4). */
  unsettled?: boolean;
  /** The last balance a reconciliation recorded (S16 §5) — `null`/absent before the first one. */
  expectedBalance?: money.Money | null;
};

export type SharedGroupProps = {
  accounts: readonly SharedGroupAccount[];
  onSelectAccount: (id: string) => void;
};

export function SharedGroup({ accounts, onSelectAccount }: SharedGroupProps) {
  const t = useT();
  const styles = useStyles();
  const subtotals = subtotalsOf(accounts);

  if (accounts.length === 0) return null;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.label}>{t("accounts.shared")}</Text>
        <View style={styles.subtotals}>
          {subtotals.map((subtotal) => (
            <Amount
              key={subtotal.currency}
              value={subtotal.balance}
              currency={subtotal.currency}
              decimals={subtotal.decimals}
              size="small"
            />
          ))}
        </View>
      </View>
      {accounts.map((account) => (
        <SharedAccountRow key={account.id} account={account} onSelect={onSelectAccount} />
      ))}
    </View>
  );
}

type SharedAccountRowProps = {
  account: SharedGroupAccount;
  onSelect: (id: string) => void;
};

function SharedAccountRow({ account, onSelect }: SharedAccountRowProps) {
  const handlePress = useCallback(() => onSelect(account.id), [account.id, onSelect]);
  return (
    <BalanceRow
      account={account.name}
      kind={account.kind}
      balance={account.balance}
      currency={account.currency}
      {...(account.decimals === undefined ? {} : { decimals: account.decimals })}
      isBusiness={account.isBusiness ?? false}
      unsettled={account.unsettled ?? false}
      expectedBalance={account.expectedBalance ?? null}
      onPress={handlePress}
    />
  );
}

const useStyles = makeStyles((theme) => ({
  root: {
    gap: space.md,
    marginTop: space.xl,
    paddingTop: space.xl,
    borderTopWidth: hairline.width,
    borderTopColor: theme.hairline,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },
  label: { color: theme.textMuted, ...text.ui("kicker"), textTransform: "uppercase" },
  subtotals: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
}));
