/** Safe client lifecycle events. Payload-bearing values are intentionally absent. */

import {
  type DiagnosticError,
  type DiagnosticSink,
  describeDiagnosticError,
  emitDiagnostic,
} from "@waltning/core/diagnostics";

export type ClientAction =
  | "create_account"
  | "create_expense"
  | "reset_preview"
  | "change_appearance";

export type ClientStateUpdate = "phone_ledger_refresh" | "appearance_hydrate";

type ClientLifecycle<Scope extends string, Name extends object> =
  | ({ scope: Scope; phase: "start" } & Name)
  | ({ scope: Scope; phase: "success" } & Name)
  | ({ scope: Scope; phase: "failure"; error: DiagnosticError } & Name);

export type ClientDiagnosticEvent =
  | ClientLifecycle<"client_action", { action: ClientAction }>
  | ClientLifecycle<"client_state", { update: ClientStateUpdate }>;

export type ClientDiagnostics = DiagnosticSink<ClientDiagnosticEvent>;

export function emitClientDiagnostic(
  diagnostics: ClientDiagnostics | undefined,
  event: ClientDiagnosticEvent,
): void {
  emitDiagnostic(diagnostics, event);
}

export function clientFailure<Caught>(caught: Caught): DiagnosticError {
  return describeDiagnosticError(caught);
}
