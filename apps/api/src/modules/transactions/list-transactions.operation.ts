/**
 * `list_transactions` — the ledger, newest first.
 *
 * Class R rather than F: a replica can serve this, but **only over a date range
 * it covers completely** (`computations.md` §0). The device knows its own
 * watermark; this operation does not, which is why it is offline-eligible for
 * the read and the decision about *coverage* belongs to the caller.
 */

import { zAccountingDate, zId } from "@waltning/core/zod";
import { z } from "zod";
import type { OperationContext } from "../../registry/context.ts";
import { defineOperation } from "../../registry/define.ts";
import { listTransactions, type TransactionPage } from "./transactions.service.ts";

export type { TransactionPage, TransactionRow } from "./transactions.service.ts";

export const listTransactionsOperation = defineOperation({
  name: "list_transactions",
  kind: "read",
  autoEligible: true,
  offlineEligible: true,
  opVersion: 1,
  description:
    "List transactions newest first, with the account and category of each. Amounts are signed: " +
    "expenses and the source leg of a transfer are negative, income is positive. Page with the " +
    "returned cursor rather than an offset. Soft-deleted transactions are never included.",
  input: z.object({
    // Bounded so no caller can ask for the whole ledger by accident; the Pi has
    // 4 GB and the phone renders this into a list.
    limit: z.number().int().min(1).max(200).default(50),
    cursor: z
      // Branded at the boundary. A cursor is echoed back from a previous
      // response, so it reads as internal — and arrives in a request body like
      // everything else, which means a caller can send anything at all.
      .object({ date: zAccountingDate, id: zId<"transactions">() })
      .nullable()
      .default(null),
  }),
  handler: (input, ctx: OperationContext): Promise<TransactionPage> =>
    listTransactions(ctx.db, input.limit, input.cursor),
});
