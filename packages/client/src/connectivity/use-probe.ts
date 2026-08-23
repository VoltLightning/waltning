/**
 * Is the API reachable, and is what answered actually ours?
 *
 * Lived inside `app/index.tsx` as a hook defined in a route file, which made it
 * two things at once: untestable, because `vitest.config.ts` collects
 * the src glob and `app/` is a sibling of `src/` rather than a child; and
 * uninjectable, because it closed over the module singleton instead of taking a
 * client. Both were properties of *where it was written* (`architecture/11` §4).
 *
 * It was briefly kept in the app on the grounds that the `link` state machine
 * (`architecture/09`) will eventually need NetInfo on native and
 * `navigator.onLine` on web. That is placement by anticipation, which is the
 * same mistake as placement by count: this hook names no platform *today*, so
 * it is shared today. When the machine needs a platform read, the read goes in
 * `platform.ts` and is **passed in** — the pattern `createApiClient(baseUrl)`
 * already uses for exactly this reason.
 */

import { CaptiveResponseError } from "@waltning/core/rule-zero-fetch";
import { useQuery } from "../query/use-query.ts";
import type { ApiClient } from "../transport/client.ts";

export type Probe =
  | { status: "probing" }
  | { status: "reached"; build: string }
  /** Something answered and it was not us. Deliberately not "offline". */
  | { status: "not-ours"; reason: string }
  | { status: "unreachable"; message: string };

export function useProbe(api: ApiClient): Probe {
  const result = useQuery(() => api.ping.query(), [api]);

  switch (result.status) {
    case "loading":
      return { status: "probing" };
    case "ready":
      return { status: "reached", build: result.data.build };
    case "failed":
      // The distinction Rule 0 exists to make, preserved because `useQuery`
      // keeps the `Error` rather than flattening it to a message. The copy of
      // this logic that used to live in the route file had already lost it.
      return result.error instanceof CaptiveResponseError
        ? { status: "not-ours", reason: result.error.reason }
        : { status: "unreachable", message: result.error.message };
  }
}

/** What the connection block says. Separated so a test can read it. */
export function describeProbe(probe: Probe, stale: (build: string) => boolean): string {
  switch (probe.status) {
    case "probing":
      return "probing…";
    case "reached":
      return stale(probe.build)
        ? `server is on build ${probe.build} — this page is stale, reload`
        : `reached · build ${probe.build}`;
    case "not-ours":
      return `response was not ours (${probe.reason}) — status not consulted`;
    case "unreachable":
      return `no answer — ${probe.message}`;
  }
}
