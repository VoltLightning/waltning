/**
 * `get_currencies` — the read half of the vertical slice.
 *
 * Offline-eligible and auto-eligible: it is a read of reference data the phone
 * already replicates, so neither the outbox nor the approval gate has anything
 * to say about it.
 */

import { z } from "zod";
import type { OperationContext } from "../../registry/context.ts";
import { defineOperation } from "../../registry/define.ts";
import { listCurrencies } from "./currencies.service.ts";

export const getCurrencies = defineOperation({
  name: "get_currencies",
  kind: "read",
  autoEligible: true,
  offlineEligible: true,
  opVersion: 1,
  description:
    "List the currencies configured in this ledger, with their symbol, decimal places, " +
    "and whether each is the pivot currency that stored FX rates are quoted against. " +
    "Archived currencies are excluded unless includeArchived is true.",
  input: z.object({
    includeArchived: z.boolean().default(false),
  }),
  handler: (input, ctx: OperationContext) => listCurrencies(ctx.db, input.includeArchived),
});
