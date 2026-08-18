/**
 * The most recent transactions.
 *
 * Deliberately only the first page. Paging is a real interaction — a list that
 * loads more on scroll needs the `link` state to know whether "no more" means
 * the end of the ledger or the end of what the replica covers (§0, class R),
 * and getting that wrong shows a short ledger as a complete one.
 */

import { useEffect, useState } from "react";
import type { ApiClient } from "../../../shared/api/index.ts";

type Page = Awaited<ReturnType<ApiClient["op"]["list_transactions"]["query"]>>;
export type Transaction = Page["rows"][number];

export type TransactionsState =
  | { status: "loading" }
  | { status: "ready"; transactions: Transaction[]; hasMore: boolean }
  | { status: "failed"; error: Error };

export function useTransactions(api: ApiClient, limit = 20): TransactionsState {
  const [state, setState] = useState<TransactionsState>({ status: "loading" });

  useEffect(() => {
    let live = true;
    api.op.list_transactions
      .query({ limit, cursor: null })
      .then((page) => {
        if (live) {
          setState({ status: "ready", transactions: page.rows, hasMore: page.nextCursor !== null });
        }
      })
      .catch((error: unknown) => {
        if (live) {
          setState({
            status: "failed",
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      });
    return () => {
      live = false;
    };
  }, [api, limit]);

  return state;
}
