/**
 * The tRPC client.
 *
 * Takes its base URL rather than resolving one, for two reasons: `base-url.ts`
 * imports `react-native`, which a Node test cannot, and a client that reads
 * configuration during construction is a client no test can point somewhere
 * else. `app/` passes the resolved URL in.
 *
 * **Not batched.** `httpLink`, not `httpBatchLink`. Batching would merge
 * unrelated calls into one HTTP request, and Rule 0's verdict is per *response*
 * — one captive reply would then invalidate several calls at once, with no way
 * to say which. The batching win is a round trip on a tailnet; the cost is that
 * the most important check in the system gets a coarser subject.
 */

import { createTRPCClient, httpLink } from "@trpc/client";
import type { AppRouter } from "@waltning/api/router-type";
import { type RuleZeroOptions, ruleZeroFetch } from "@waltning/core";

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(baseUrl: string, ruleZero: RuleZeroOptions = {}) {
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: `${baseUrl}/trpc`,
        fetch: ruleZeroFetch(ruleZero),
      }),
    ],
  });
}
