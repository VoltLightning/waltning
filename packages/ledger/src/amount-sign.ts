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

/**
 * **A line signs no more than its parent — but zero is a line a receipt has.**
 *
 * §12 stores a line as a magnitude, so `-10.00` in a set that sums correctly
 * is a category reading back with its sign flipped in §6's figures: the same
 * argument as above, one column over.
 *
 * **Zero is not.** The parent's zero is refused because `amount_original` is
 * the FX pivot and `money.margin` throws on a zero one — with the caveat that
 * `adjustment` is exempt from that rule here *and* in `createTransactionInput`,
 * so a zero adjustment is creatable on both engines and will throw in every FX
 * figure. That is a real gap and it is not this function's: the exemption is
 * `transactions_amount_positive`'s own shape (`> 0 OR type = 'adjustment'`),
 * and narrowing it belongs in a migration, not in a device-side helper that
 * would then refuse rows the server accepts.
 *
 * A line is never a pivot, and a receipt routinely carries a `0.00` row — a
 * loyalty item, a free refill, a rounding line. Refusing it rejected the whole
 * breakdown for a line the shop printed, and neither engine has a CHECK here
 * to appeal to: `transaction_lines` carries none. Being stricter than the
 * server is the safe direction only where the strictness is right.
 */
export function assertLineMagnitude(subject: string, amount: string, type: string): void {
  if (type === "adjustment") return;
  if (money.dec(amount).gte(0)) return;
  throw new LocalRefusal(
    `${subject} is ${amount} — a line is a magnitude (§12); \`type\` carries direction (§7.2), and only an adjustment signs`,
  );
}
