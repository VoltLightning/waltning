/**
 * `get_transaction` — S09's whole subject.
 *
 * Offline-eligible and auto-eligible: `transactions` and `transaction_lines`
 * are both shared tables (`architecture/14-local-first.md`), and the phone
 * already computes the identical join from its own replica
 * (`@waltning/ledger`'s `readTransaction`).
 */

import { zId } from "@waltning/core/zod";
import { z } from "zod";
import type { OperationContext } from "../../registry/context.ts";
import { defineOperation } from "../../registry/define.ts";
import { getTransactionById, type TransactionDetail } from "./transactions.service.ts";

export const getTransaction = defineOperation({
  name: "get_transaction",
  kind: "read",
  autoEligible: true,
  offlineEligible: true,
  opVersion: 1,
  description:
    "One transaction by id, with its account and category names and its optional line " +
    "breakdown. The amount is signed: negative for an expense and the source leg of a " +
    "transfer, positive for income. Returns null for a row that does not exist or has been " +
    "soft-deleted.",
  input: z.object({ id: zId<"transactions">() }),
  handler: (input, ctx: OperationContext): Promise<TransactionDetail | null> =>
    getTransactionById(ctx.db, input.id),
});
