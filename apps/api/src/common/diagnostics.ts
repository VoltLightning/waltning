/** Structured API events whose shape cannot carry request or ledger payloads. */

import {
  type DiagnosticError,
  type DiagnosticSink,
  describeDiagnosticError,
  emitDiagnostic,
} from "@waltning/core/diagnostics";
import type { OperationKind } from "@waltning/core/registry/operation";
import type { Actor } from "../registry/context.ts";

type HttpIdentity = {
  requestId: string;
  method: string;
  path: string;
};

type RegistryIdentity = {
  requestId: string;
  operation: string;
  kind: OperationKind;
  actor: Actor;
};

export type ApiDiagnosticEvent =
  | ({ scope: "http_request"; phase: "start" } & HttpIdentity)
  | ({
      scope: "http_request";
      phase: "response";
      status: number;
      durationMs: number;
    } & HttpIdentity)
  | ({
      scope: "http_request";
      phase: "failure";
      durationMs: number;
      error: DiagnosticError;
    } & HttpIdentity)
  | ({ scope: "registry_operation"; phase: "start" } & RegistryIdentity)
  | ({ scope: "registry_operation"; phase: "success"; durationMs: number } & RegistryIdentity)
  | ({
      scope: "registry_operation";
      phase: "failure";
      durationMs: number;
      error: DiagnosticError;
    } & RegistryIdentity)
  | {
      scope: "server";
      phase: "started";
      build: string;
      hostname: string;
      port: number;
    };

export type ApiDiagnostics = DiagnosticSink<ApiDiagnosticEvent>;

export function emitApiDiagnostic(
  diagnostics: ApiDiagnostics | undefined,
  event: ApiDiagnosticEvent,
): void {
  emitDiagnostic(diagnostics, event);
}

export const describeApiError = describeDiagnosticError;

export function diagnosticDuration(startedAt: number, endedAt: number): number {
  return Math.max(0, Math.round(endedAt - startedAt));
}
