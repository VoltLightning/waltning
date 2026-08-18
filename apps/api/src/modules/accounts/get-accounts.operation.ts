/**
 * `get_accounts` — every account with its balance.
 *
 * Offline-eligible and auto-eligible: a read of rows the phone replicates, and
 * §2's balance is class F, so the device can fold it from a checkpoint without
 * asking. Neither the outbox nor the approval gate has anything to say about it.
 */

import { z } from "zod";
import type { OperationContext } from "../../registry/context.ts";
import { defineOperation } from "../../registry/define.ts";
import { type AccountSummary, listAccounts } from "./accounts.service.ts";

export type { AccountSummary };

export const getAccounts = defineOperation({
  name: "get_accounts",
  kind: "read",
  autoEligible: true,
  offlineEligible: true,
  opVersion: 1,
  description:
    "List the accounts in this ledger with the current balance of each, in the account's own " +
    "currency. Balances are never summed across currencies — each is denominated in the " +
    "currency of its own account. Archived accounts are excluded unless includeArchived is true.",
  input: z.object({
    includeArchived: z.boolean().default(false),
  }),
  handler: (input, ctx: OperationContext) => listAccounts(ctx.db, input.includeArchived),
});
