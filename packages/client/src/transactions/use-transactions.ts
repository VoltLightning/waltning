/**
 * The most recent transactions.
 *
 * Deliberately only the first page. Paging is a real interaction: a list that
 * loads more on scroll needs the `link` state to know whether "no more" means
 * the end of the ledger or the end of what the replica covers (§0, class R), and
 * getting that wrong shows a short ledger as a complete one.
 *
 * This is the hook whose deps genuinely change, so it is the one where the
 * cancellation flag in `useQuery` guards an out-of-order response rather than
 * only an unmount.
 */

import { type Query, useQuery } from "../query/index.ts";
import type { ApiClient } from "../transport/index.ts";

type Page = Awaited<ReturnType<ApiClient["op"]["list_transactions"]["query"]>>;
export type Transaction = Page["rows"][number];

export type TransactionFeed = { transactions: Transaction[]; hasMore: boolean };

export function useTransactions(api: ApiClient, limit = 20): Query<TransactionFeed> {
  return useQuery(async () => {
    const page = await api.op.list_transactions.query({ limit, cursor: null });
    // Derived here rather than carried as a state field: `hasMore` is a fact
    // about the response, not a fourth thing the state machine has to know.
    return { transactions: page.rows, hasMore: page.nextCursor !== null };
  }, [api, limit]);
}
