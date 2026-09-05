/**
 * `resolveFieldErrorMessage` — `create_transaction`'s own refusal, resolved
 * to plain text. Shared by every screen that saves a `QuickAddDraft`-shaped
 * draft (the phone's `quick-add-screen.tsx`, the desk's own command bar in
 * `tabs-shell.tsx`), so a refusal reads the same sentence wherever it lands
 * rather than each caller re-deriving it.
 *
 * **Lives here, not `packages/client`.** Resolving a `messageKey` needs
 * `useT()`, which is `packages/ui`'s (`architecture/11`: `client` and `ui` are
 * siblings, and `packages/client` cannot call a hook). The error shape below
 * is a structural duplicate of `packages/client`'s own `FieldError` — the
 * same escape `primitives/field-errors.ts` already takes for `FieldErrorMap`
 * — narrowed to the three fields this function actually reads, so a caller's
 * real `FieldError` (carrying `path` too) still passes it without a cast.
 */

import type { useT } from "../i18n/provider";

export type FieldErrorMessage = {
  message: string;
  messageKey?: string;
  params?: Record<string, string>;
};

/** `create_transaction`'s own field paths — everything else lands at form level. */
export const KNOWN_PATHS = [
  "amountOriginal",
  "accountId",
  "categoryId",
  "payee",
  "date",
  "note",
  "isBusiness",
  "counterpartyId",
  "counterpartyRole",
];

/**
 * A refusal's own text, resolving the one `messageKey` the controller sets
 * (`transactions.needsRate`, on an uncapturable account) through `useT()`.
 */
export function resolveFieldErrorMessage(
  t: ReturnType<typeof useT>,
  error: FieldErrorMessage,
): string {
  if (error.messageKey === "transactions.needsRate") {
    return t("transactions.needsRate", { currency: error.params?.["currency"] ?? "" });
  }
  if (error.messageKey === "transactions.tooManyDecimals") {
    return t("transactions.tooManyDecimals", {
      currency: error.params?.["currency"] ?? "",
      decimals: error.params?.["decimals"] ?? "",
    });
  }
  if (error.messageKey === "transactions.sharedNeverBusiness") {
    return t("transactions.sharedNeverBusiness");
  }
  if (error.messageKey === "transactions.categoryKindMismatch") {
    const kind =
      error.params?.["type"] === "income" ? t("transactions.income") : t("transactions.expense");
    return t("transactions.categoryKindMismatch", { type: kind });
  }
  if (error.messageKey === "transactions.categoryUnavailable") {
    return t("transactions.categoryUnavailable");
  }
  return error.message;
}
