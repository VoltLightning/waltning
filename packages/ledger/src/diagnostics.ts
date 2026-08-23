/** Safe, structured diagnostics for the phone ledger's storage boundaries. */

import {
  type DiagnosticError,
  type DiagnosticSink,
  describeDiagnosticError,
  emitDiagnostic,
} from "@waltning/core/diagnostics";

export type LedgerDiagnosticError = DiagnosticError;

export type LedgerStartupStage =
  | "open"
  | "migrate_outbox"
  | "migrate_replica"
  | "bootstrap_currency"
  | "recover"
  | "initial_read"
  | "release_copies"
  | "ready";

export type LedgerDiagnosticEvent =
  | {
      scope: "ledger_startup";
      phase: "start" | "success";
      stage: "open" | "ready";
    }
  | {
      scope: "ledger_startup";
      phase: "failure";
      stage: LedgerStartupStage;
      error: LedgerDiagnosticError;
    }
  | {
      scope: "local_write";
      phase: "start";
      boundary: "outbox" | "replica";
      operation: string;
      seq?: number;
    }
  | {
      scope: "local_write";
      phase: "success";
      boundary: "outbox" | "replica";
      operation: string;
      seq: number;
    }
  | {
      scope: "local_write";
      phase: "failure";
      boundary: "outbox" | "replica";
      operation: string;
      seq?: number;
      error: LedgerDiagnosticError;
    };

export type LedgerDiagnostics = DiagnosticSink<LedgerDiagnosticEvent>;

export const describeLedgerError = describeDiagnosticError;

/** A broken diagnostic transport must never make a ledger operation fail. */
export function emitLedgerDiagnostic(
  diagnostics: LedgerDiagnostics | undefined,
  event: LedgerDiagnosticEvent,
): void {
  emitDiagnostic(diagnostics, event);
}
