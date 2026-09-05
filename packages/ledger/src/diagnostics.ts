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
      /**
       * The one refusal a session turns into an action rather than a plain
       * failure: `PreJournalStoreError` (`migrate.ts`), caught in `start()`.
       * `stage` is always one of the two migration steps because that is the
       * only place the error is thrown from; `store` names which chain of
       * the pair was refused, though both are deleted together (§14.6 — the
       * replica and the outbox are only consistent as a pair).
       */
      scope: "ledger_startup";
      phase: "rebuild";
      stage: "migrate_outbox" | "migrate_replica";
      store: "replica" | "outbox";
      error: LedgerDiagnosticError;
    }
  | {
      scope: "local_write";
      phase: "start";
      boundary: "validate";
      operation: string;
    }
  | {
      scope: "local_write";
      phase: "success";
      boundary: "validate";
      operation: string;
    }
  | {
      scope: "local_write";
      phase: "failure";
      boundary: "validate";
      operation: string;
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
