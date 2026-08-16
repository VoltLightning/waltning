/**
 * `create_counterparty` — the write half of the vertical slice.
 *
 * Gated, audited, and **not** offline-eligible. The last part is the
 * interesting one and it is not obvious: creating a counterparty seems like
 * something a phone could queue. It cannot, because uniqueness is on the
 * *normalized* name (`counterparties_name_uq`), so two devices offline for a
 * week both create "Marek" and one drain fails on a constraint after the user
 * has already attached transactions to it. Naming a person is cheap to defer
 * and expensive to merge.
 */

import { defineOperation } from "@waltning/core";
import { z } from "zod";
import { insertCounterparty } from "../../services/counterparties.ts";
import type { OperationContext } from "../context.ts";

export const createCounterparty = defineOperation({
  name: "create_counterparty",
  kind: "write",
  autoEligible: false,
  offlineEligible: false,
  opVersion: 1,
  audit: { entity: "counterparties", action: "created" },
  description:
    "Create a person or company you transact with — someone you lend to, borrow from, " +
    "or who contributes to a shared account. Use this only when no existing counterparty " +
    "matches; names are unique ignoring case and surrounding whitespace.",
  input: z.object({
    name: z.string().trim().min(1).max(120),
    kind: z.enum(["person", "company"]).default("person"),
    settlementCurrency: z.string().length(3).toUpperCase().optional(),
    contact: z.string().trim().max(200).optional(),
    note: z.string().trim().max(2000).default(""),
  }),
  handler: (input, ctx: OperationContext) => insertCounterparty(ctx.db, input),
});
