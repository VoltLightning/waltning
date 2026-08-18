/**
 * The accounts, with their balances.
 *
 * No cache, no retry, no refetch-on-focus: those are decisions about the
 * offline replica (§14.3) and the `link` state machine, neither of which
 * exists. A hand-rolled half of either would have to be unpicked before the
 * real one lands.
 */

import { useEffect, useState } from "react";
import type { ApiClient } from "../../../shared/api/index.ts";

export type Account =
  Awaited<ReturnType<ApiClient["op"]["get_accounts"]["query"]>> extends readonly (infer A)[]
    ? A
    : never;

export type AccountsState =
  | { status: "loading" }
  | { status: "ready"; accounts: Account[] }
  | { status: "failed"; error: Error };

export function useAccounts(api: ApiClient): AccountsState {
  const [state, setState] = useState<AccountsState>({ status: "loading" });

  useEffect(() => {
    let live = true;
    api.op.get_accounts
      .query({ includeArchived: false })
      .then((accounts) => {
        if (live) setState({ status: "ready", accounts });
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
  }, [api]);

  return state;
}
