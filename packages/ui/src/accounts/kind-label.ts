/**
 * Each `AccountKind`'s name, as a key into `accounts`'s messages.
 *
 * Here rather than inside a component because two screens name kinds side by
 * side — S16's register sections and S04's breakdown — and a kind called one
 * thing in one and another in the other is the drift this exists to prevent.
 */

import type { AccountKind } from "@waltning/core/registry/inputs";
import type { Messages } from "../i18n/en.ts";

export const KIND_LABEL_KEY: Record<AccountKind, keyof Messages["accounts"]> = {
  cash: "kindCash",
  bank: "kindBank",
  card: "kindCard",
  loan_receivable: "kindLoanReceivable",
  loan_payable: "kindLoanPayable",
  clearing: "kindClearing",
  investment: "kindInvestment",
  deposit: "kindDeposit",
  other: "kindOther",
};
