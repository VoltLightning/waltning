/**
 * One transaction, as every list that draws rows receives it.
 *
 * **A model in its own file, not in the component that happens to draw it
 * first.** It lived in `entry-row.tsx`, which made every module that needs the
 * *shape* import a module full of JSX — and a plain `.ts` importing a `.tsx`
 * is a compile error under this repo's resolution, so the seam showed up the
 * first time a model file wanted it. The type is shared by `EntryRow`,
 * `LedgerRowItem`, `TransferRow` and the List page's own entry union; the
 * component is shared by none of them.
 */

import type { CurrencyCode, Money } from "@waltning/core/money";

/** One entry, as the ledger's own reads hand it over. */
export type LedgerEntry = {
  id: string;
  date: string;
  type: "income" | "expense" | "transfer" | "adjustment";
  enteredName: string;
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
  obligationRole?: "debt" | "contribution" | "reference" | null;
};
