/**
 * `<EntryRow>` — one ledger entry, drawn as whichever row it actually is.
 *
 * A transfer and an expense are two different rows (`TransferRow` states both
 * legs and their rate; `TransactionRow` states a payee and a category), and
 * every list that shows a mixed history has to choose between them. That
 * choice was made in `counterparty-detail-screen.tsx`, which meant the next
 * screen to show a mixed list would have made it again — and the two would
 * have drifted on which fields count as "this is a transfer".
 *
 * **The press belongs to the row, and the row has no `accessibilityLabel`.**
 * One on a wrapping `Pressable` *replaces* the name a reader composes from the
 * content, which is how the ledger came to announce a payee and never the
 * amount, the category or the date — the same defect `net-worth-strip`
 * documents, on the list this app is mostly made of. The content is the name.
 *
 * **The shape is declared here rather than imported.** `packages/ui` never
 * depends on `@waltning/client`, so the row arrives structurally, the way
 * `unsettled-banner` takes its own. What this component needs is a handful of
 * fields, not the client's whole search type.
 */

import type { CurrencyCode, Money } from "@waltning/core/money";
import { useCallback } from "react";
import { useT } from "../../../i18n/provider";
import { TransactionRow } from "../transaction-row/transaction-row";
import { TransferRow } from "../transfer-row/transfer-row";

/** One entry, as the ledger's own reads hand it over. */
export type LedgerEntry = {
  id: string;
  date: string;
  type: "income" | "expense" | "transfer" | "adjustment";
  payee: string;
  categoryName: string | null;
  accountName: string;
  amount: Money;
  currency: CurrencyCode;
  decimals: number;
  isBusiness: boolean;
  brandKey: string | null;
  /** The far leg — all four present together, or this is not a transfer. */
  toAccountName?: string | null;
  toAmount?: Money | null;
  toCurrency?: CurrencyCode | null;
  toDecimals?: number | null;
  /**
   * §6.6's three roles. Named as a union rather than `string` so the i18n key
   * this builds is one the catalogue is known to hold — a widened role would
   * make `counterparties.role.${role}` a key nobody can prove exists.
   */
  counterpartyRole?: "debt" | "contribution" | "reference" | null;
};

export type EntryRowProps = {
  row: LedgerEntry;
  onPress: (id: string) => void;
  /**
   * Name the account the entry sits in. The ledger does, because it lists
   * across all of them; a counterparty's own history does not, because the
   * question there is who, not where.
   */
  withAccount?: boolean;
};

export function EntryRow({ row, onPress, withAccount }: EntryRowProps) {
  const t = useT();
  const handlePress = useCallback(() => onPress(row.id), [onPress, row.id]);
  /**
   * `debt` earns no tag: it is what the debt screens are *for*, so saying it
   * on every row states the obvious. Any other role is worth a word.
   */
  const roleTag =
    row.counterpartyRole && row.counterpartyRole !== "debt"
      ? t(`counterparties.role.${row.counterpartyRole}`)
      : undefined;

  if (row.type === "transfer" && row.toAccountName && row.toAmount && row.toCurrency) {
    return (
      <TransferRow
        date={row.date}
        fromAccountName={row.accountName}
        toAccountName={row.toAccountName}
        amount={row.amount}
        currency={row.currency}
        decimals={row.decimals}
        toAmount={row.toAmount}
        toCurrency={row.toCurrency}
        toDecimals={row.toDecimals ?? row.decimals}
      />
    );
  }
  return (
    <TransactionRow
      date={row.date}
      payee={row.payee}
      category={row.categoryName}
      amount={row.amount}
      currency={row.currency}
      decimals={row.decimals}
      {...(withAccount === true ? { account: row.accountName } : {})}
      type={row.type}
      isBusiness={row.isBusiness}
      brandKey={row.brandKey}
      {...(roleTag === undefined ? {} : { roleTag })}
      onPress={handlePress}
    />
  );
}
