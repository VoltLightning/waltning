/**
 * **An amount is positive, and only an `adjustment` may sign.**
 *
 * `transactions_amount_positive` (`packages/db/drizzle/
 * 0012_fx_rates_derived_and_amount_guards.sql`) is `amount_original > 0 OR
 * type = 'adjustment'`, and `createTransactionInput` carries the same rule with
 * the same exemption. The two operations that can *move* the column afterwards
 * — `update_transaction` and `set_transaction_lines` — cannot state it in their
 * schemas: `transactionPatch` and `setTransactionLinesInput` never see the
 * row's `type`, so neither knows whether a sign is legal. Their executors do,
 * and this is the one function they share.
 *
 * **What it prevents is not a caught error.** `money.signed` negates an
 * expense, so an `amount_original` of `-10.00` on one reads back as **+10.00**:
 * a spend that raises the account balance, in every figure derived from it,
 * with nothing thrown and nothing logged. Zero is refused with it — `money.
 * margin` throws "amountPivot is zero" for every FX figure on such a row.
 *
 * **Called from `validate`, not only `apply`.** Postgres refuses these rows
 * outright, so a queued entry carrying one is an intent no server will ever
 * accept — `architecture/14` §14.6's stuck device. The replica's own
 * `transactions_amount_positive_*` triggers (`migrate.ts`) are the backstop
 * beneath this, and they raise a bare `SqliteError`: a refusal with no field,
 * no message a person can act on, and — because it is not a `LocalRefusal` —
 * one that rolls the replica back while the outbox entry stays. That is the
 * shape of failure this function exists to reach first.
 */

import * as money from "@waltning/core/money";
import { LocalRefusal } from "./executor.ts";

/**
 * @param subject the column this is about, fully qualified for the message —
 *   `"update_transaction: amount_original"`, or a line's own path.
 * @param type the *parent transaction's* type, which is what carries the
 *   exemption. A line has no type of its own; it belongs to the payment.
 */
export function assertAmountPositive(subject: string, amount: string, type: string): void {
  if (type === "adjustment") return;
  if (money.dec(amount).gt(0)) return;
  throw new LocalRefusal(
    `${subject} is ${amount} — amounts are positive and non-zero; \`type\` carries direction (§7.2), and only an adjustment signs (transactions_amount_positive)`,
  );
}
