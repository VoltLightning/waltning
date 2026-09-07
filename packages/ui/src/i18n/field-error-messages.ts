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

import type { useT } from "./provider";

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
  // L-b — `zAccountingDate`'s calendar refusal. Zod produces an English
  // literal and nothing else could translate it: the schema is `packages/core`
  // and cannot reach a catalogue, so the controller tags the issue with a key
  // (`create-phone-ledger.ts`) and this is where the key becomes a sentence.
  if (error.messageKey === "transactions.badDate") {
    return t("transactions.badDate");
  }
  /**
   * **Any other key the catalogue holds, resolved rather than passed through.**
   *
   * Six screens grew their own copy of this function — accounts, the account
   * editor, transfers, the counterparty editor, transaction detail, currencies
   * — each listing two or three keys of its own and ending in the same
   * `return error.message`. They were not variations on a policy; they were
   * six people reaching the same place by hand, and a seventh screen would
   * have written a seventh.
   *
   * The branches above stay because each *shapes* its parameters — a
   * currency, a decimal count, an income/expense word chosen before
   * interpolation. Everything else needs only the key and whatever params came
   * with it, which is one line. `defaultValue` is what keeps a key the
   * catalogue does not hold from rendering as its own dotted name: the
   * controller's English falls through instead, which is what every one of
   * those six copies did.
   */
  if (error.messageKey !== undefined) {
    return t(error.messageKey, { ...error.params, defaultValue: error.message });
  }
  return error.message;
}
