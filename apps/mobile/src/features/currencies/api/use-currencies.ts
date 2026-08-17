/**
 * The feature's data access: one operation, one hook.
 *
 * A hook rather than a call the screen makes inline, because the *screen* owns
 * fetching but should not own the shape of a request — `architecture/10` puts
 * `api/` inside the feature for exactly this. What comes back is typed by the
 * server's declaration; nothing here restates `CurrencySummary`.
 *
 * **No cache, no retry, no refetch-on-focus.** Those are decisions about the
 * offline replica (§14.3) and the `link` state machine (`architecture/09`),
 * neither of which exists yet — and a hand-rolled half of either would have to
 * be unpicked before the real one lands.
 */

import { useEffect, useState } from "react";
import type { ApiClient } from "../../../shared/api/index.ts";

export type CurrenciesState =
  | { status: "loading" }
  | { status: "ready"; currencies: Currency[] }
  | { status: "failed"; error: Error };

/** Inferred from the client, so the server's declaration remains the source. */
export type Currency =
  Awaited<ReturnType<ApiClient["op"]["get_currencies"]["query"]>> extends readonly (infer C)[]
    ? C
    : never;

export function useCurrencies(api: ApiClient): CurrenciesState {
  const [state, setState] = useState<CurrenciesState>({ status: "loading" });

  useEffect(() => {
    // Guards against a resolved request writing state after the screen has
    // gone, and against an earlier response overwriting a later one.
    let live = true;

    api.op.get_currencies
      .query({ includeArchived: false })
      .then((currencies) => {
        if (live) setState({ status: "ready", currencies });
      })
      .catch((error: unknown) => {
        // Preserved rather than flattened to a message: a `CaptiveResponseError`
        // means the request was never answered by us, which is a different
        // thing to show than a refusal, and the type is what says which.
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
  }, [api]);

  return state;
}
