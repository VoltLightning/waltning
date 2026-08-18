/**
 * The tRPC client.
 *
 * Takes its base URL rather than resolving one. A client that read
 * configuration during construction would be a client no test could point
 * somewhere else, and — the reason that matters now — resolving the URL means
 * reading `Platform.OS`, `__DEV__` or `import.meta.env`, which are the three
 * things this package may not name (`architecture/11`). Each app resolves its
 * own and passes it in.
 *
 * An earlier version of this note claimed `base-url.ts` imports `react-native`.
 * It never did — it had no imports at all, which is precisely why it belonged
 * beside this file in a package rather than inside the iOS app.
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
