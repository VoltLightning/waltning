/**
 * A fresh ledger is anchored to the currency of the device's region — a German
 * phone is EUR-anchored, so its first EUR account needs no rate (§7.0, S29).
 *
 * **Only a ledger nobody has touched.** The anchor (the pivot) can change
 * while the ledger holds no transaction (`change_pivot`, S29a), and it does so
 * here **once, at first start, before any account exists**. Four things must
 * all hold, and each keeps this from overriding a decision:
 *
 * - the platform names a region currency and the ledger holds it;
 * - the ledger still has the **seed's** anchor — a person who has already
 *   changed the anchor on an empty ledger has decided, and is not reverted at
 *   the next start;
 * - no account exists (and so no transaction can);
 * - no transaction exists.
 *
 * Otherwise nothing happens: an existing ledger keeps its anchor, because the
 * phone cannot re-rate history (S17 §7). The write is the registry's own
 * `change_pivot`, audited like any other.
 */

import type { CurrencyCode } from "@waltning/core/money";

/** The slice of the phone ledger this needs — structural, so `currencies` imports no other module. */
export type AnchorLedger = {
  getSnapshot: () => {
    accounts: { readonly length: number };
    currencies: readonly { code: CurrencyCode; isPivot: boolean }[];
  };
  searchTransactions: (filter: Record<string, never>) => { total: { count: number } };
  changePivot: (draft: { code: string }) => object;
};

export type AnchorOutcome = "anchored" | "kept";

export function anchorToRegion(
  ledger: AnchorLedger,
  region: CurrencyCode | null,
  seed: CurrencyCode,
): AnchorOutcome {
  if (region === null) return "kept";
  const { accounts, currencies } = ledger.getSnapshot();
  const pivot = currencies.find((currency) => currency.isPivot)?.code;
  if (pivot !== seed || region === pivot) return "kept";
  if (!currencies.some((currency) => currency.code === region)) return "kept";
  if (accounts.length > 0) return "kept";
  if (ledger.searchTransactions({}).total.count > 0) return "kept";
  const result = ledger.changePivot({ code: region });
  return "fieldErrors" in result ? "kept" : "anchored";
}
