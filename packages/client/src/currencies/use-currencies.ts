/**
 * The currencies configured in this ledger.
 *
 * This file and `use-accounts.ts` were byte-identical modulo the domain noun —
 * 33 lines each. What was actually different between them is now the whole file.
 */

import { type Query, useQuery } from "../query/use-query.ts";
import type { ApiClient } from "../transport/client.ts";

/** Indexed access rather than a `never` fallback — see `use-accounts.ts`. */
export type Currency = Awaited<ReturnType<ApiClient["op"]["get_currencies"]["query"]>>[number];

export function useCurrencies(api: ApiClient): Query<Currency[]> {
  return useQuery(() => api.op.get_currencies.query({ includeArchived: false }), [api]);
}
