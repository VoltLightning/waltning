/**
 * `search_transactions` — the ledger, filtered and newest first.
 *
 * **Renamed from `list_transactions`** (L, fix round 1): `operations.md` and
 * S10 both name this operation `search_transactions`; `list_transactions`
 * was the name it shipped under before the registry compilation caught the
 * mismatch. Same operation, same class, the spec's own name.
 *
 * Class R rather than F: a replica can serve this, but **only over a date range
 * it covers completely** (`computations.md` §0). The device knows its own
 * watermark; this operation does not, which is why it is offline-eligible for
 * the read and the decision about *coverage* belongs to the caller.
 *
 * **`text` is not an input here, and the schema is `.strict()`.** §13's
 * trigram match needs `pg_trgm` and a GIN index — a migration, and this
 * branch holds none — so there is nothing server-side for a `text` to do.
 * Accepting it and ignoring it would be the worst of the three options: a
 * caller filtering on "toner" would get back every row in the date range,
 * correctly shaped, silently unfiltered, and the running total beside it
 * would be the total of the wrong set. A plain `z.object()` is no better,
 * because it *strips* unknown keys rather than refusing them, which is the
 * same silence one layer earlier. `.strict()` makes `text` a validation
 * error that names the field, so the caller learns the filter is not
 * available instead of trusting an answer to a question the server never
 * asked. It goes back in with the migration that makes it real.
 */

import { zAccountingDate, zId } from "@waltning/core/zod";
import { z } from "zod";
import type { OperationContext } from "../../registry/context.ts";
import { defineOperation } from "../../registry/define.ts";
import { searchTransactions, type TransactionPage } from "./transactions.service.ts";

export const searchTransactionsOperation = defineOperation({
  name: "search_transactions",
  kind: "read",
  autoEligible: true,
  offlineEligible: true,
  opVersion: 1,
  description:
    "Search transactions, newest first, with the account and category of each. Amounts are " +
    "signed: expenses and the source leg of a transfer are negative, income is positive. Filter " +
    "by accountIds, categoryIds, scope (all/mine/shared/business), a from/to date range, or a " +
    "counterparty. Page with the returned cursor rather than an offset. Soft-deleted " +
    "transactions are never included. There is no free-text filter yet: sending one is an " +
    "error rather than an ignored field, so a text search is never answered with unfiltered rows.",
  input: z
    .object({
      accountIds: z.array(zId<"accounts">()).optional(),
      categoryIds: z.array(zId<"categories">()).optional(),
      scope: z.enum(["all", "mine", "shared", "business"]).default("all"),
      from: zAccountingDate.optional(),
      to: zAccountingDate.optional(),
      counterpartyId: zId<"counterparties">().optional(),
      counterpartyRole: z.enum(["debt", "contribution", "reference"]).optional(),
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
    })
    .strict(),
  handler: (input, ctx: OperationContext): Promise<TransactionPage> =>
    searchTransactions(
      ctx.db,
      {
        accountIds: input.accountIds,
        categoryIds: input.categoryIds,
        scope: input.scope,
        from: input.from,
        to: input.to,
        counterpartyId: input.counterpartyId,
        counterpartyRole: input.counterpartyRole,
      },
      input.limit,
      input.cursor,
    ),
});
