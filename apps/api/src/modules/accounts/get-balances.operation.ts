/**
 * `get_balances` — §3 net worth, `mine` and `ours`, per currency.
 *
 * Offline-eligible and auto-eligible for the same reason `get_accounts` is:
 * §3 folds §2's balance, which is class F, so the device can compute it from
 * a checkpoint without asking. `packages/db/src/figures/net-worth.ts` is the
 * one implementation — this operation is a thin wrapper over it, not a
 * second one, for the same reason `accounts.service.ts` names for §2.
 */

import { netWorth } from "@waltning/db/figures/net-worth";
import { z } from "zod";
import type { OperationContext } from "../../registry/context.ts";
import { defineOperation } from "../../registry/define.ts";

export const getBalances = defineOperation({
  name: "get_balances",
  kind: "read",
  autoEligible: true,
  offlineEligible: true,
  opVersion: 1,
  description:
    "Net worth, per currency held: mine (own accounts) and ours (own plus shared). Never a " +
    "cross-currency sum — each figure is denominated in the currency of the accounts it totals. " +
    "A loan_receivable account is excluded (lending is an expense already reflected on the " +
    "account it left); a loan_payable account is included, since a debt owed is a real liability.",
  input: z.object({}),
  handler: (_input, ctx: OperationContext) => netWorth(ctx.db),
});
