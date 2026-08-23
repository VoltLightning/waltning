/**
 * The accounts, with their balances.
 *
 * Two lines of actual subject — which operation, which arguments. Everything
 * else was the state machine, and it lives in `use-query.ts` now.
 */

import { type Query, useQuery } from "../query/use-query.ts";
import type { ApiClient } from "../transport/client.ts";

/**
 * Indexed access, not `T extends readonly (infer A)[] ? A : never`.
 *
 * The conditional form was here and it fails in the wrong place: if
 * `get_accounts` ever returns a page instead of a bare array — exactly what
 * already happened to `list_transactions` — the type silently becomes `never`
 * and the error surfaces at whichever component first touches a field, reading
 * `Property 'code' does not exist on type 'never'`. That names neither the
 * operation nor the change that caused it.
 *
 * `[number]` fails at this line instead, which is where the shape actually
 * changed. `architecture/10` catalogues the conditional form under *"`never` as
 * a placeholder relocates a type problem rather than removing it"*.
 */
export type Account = Awaited<ReturnType<ApiClient["op"]["get_accounts"]["query"]>>[number];

export function useAccounts(api: ApiClient): Query<Account[]> {
  return useQuery(() => api.op.get_accounts.query({ includeArchived: false }), [api]);
}
