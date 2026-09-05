/**
 * `<SharedGroup>` — S16 §3, §4: *"visually distinct but not diminished."*
 *
 * A jointly-owned account is an ordinary account that belongs to a different
 * total (§6.7) — so this renders at the same size, weight and subtotal
 * treatment as any of the register's kind groups (`Card`, the same as
 * `KindGroup`), and is set apart by two marks *added* rather than by anything
 * taken away: a 2 px `accent` left edge (`edge="accent"`) and a `Shared` tag
 * beside the title — which is why the title is *Jointly owned* rather than
 * *Shared* a second time; a title repeating its own tag spends one mark
 * twice. Its own card alone is not the distinction — that is what every
 * kind group has — which is why one card among identical cards needed a mark
 * before "visually distinct" was true of the render rather than only of the
 * spec. A negative balance in here gets no warning treatment; it is an
 * ordinary fact about a shared account, not a signal.
 *
 * **One subtotal per currency, never across two** (`money.sum` — the same
 * rule `create-phone-ledger.ts`'s per-currency subtotals hold for the whole
 * ledger, restated for one group).
 */

import type * as money from "@waltning/core/money";
import { useCallback } from "react";
import { View } from "react-native";
import { Amount } from "../fx/amount";
import { useT } from "../i18n/provider";
import { Card } from "../shell/card";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
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

  const action = (
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
  );

  return (
    <Card
      title={t("accounts.sharedHeading")}
      tag={t("accounts.shared")}
      action={action}
      edge="accent"
    >
      {accounts.map((account) => (
        <SharedAccountRow key={account.id} account={account} onSelect={onSelectAccount} />
      ))}
    </Card>
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

const useStyles = makeStyles(() => ({
  subtotals: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
}));
