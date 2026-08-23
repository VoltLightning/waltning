/** Platform-neutral diagnostics primitives shared by clients, storage and API. */

export type DiagnosticError = {
  name: string;
  message: string;
  stack?: string;
  code?: string | number;
  cause?: DiagnosticError;
};

export type DiagnosticSink<Event> = (event: Event) => void;

const MAX_CAUSE_DEPTH = 8;

/**
 * Preserve causal errors without inspecting arbitrary object fields, which may
 * contain ledger data. URL queries are stripped because tRPC GET inputs live
 * there and native network errors sometimes repeat the complete URL.
 */
export function describeDiagnosticError<Caught>(
  caught: Caught,
  seen: ReadonlySet<Error> = new Set(),
  depth = 0,
): DiagnosticError {
  if (!(caught instanceof Error)) {
    return { name: "ThrownValue", message: safeThrownMessage(caught) };
  }
  if (seen.has(caught)) {
    return { name: caught.name, message: "[cause cycle]" };
  }
  if (depth >= MAX_CAUSE_DEPTH) {
    return { name: caught.name, message: "[cause chain truncated]" };
  }

  const nextSeen = new Set(seen);
  nextSeen.add(caught);
  const code = codeOf(caught);
  const cause = caught.cause;

  return {
    name: caught.name,
    message: redactUrlQueries(caught.message),
    ...(caught.stack ? { stack: redactUrlQueries(caught.stack) } : {}),
    ...(code !== undefined ? { code } : {}),
    ...(cause !== undefined ? { cause: describeDiagnosticError(cause, nextSeen, depth + 1) } : {}),
  };
}

/** Diagnostics are evidence about an operation, never part of its outcome. */
export function emitDiagnostic<Event>(
  diagnostics: DiagnosticSink<Event> | undefined,
  event: Event,
): void {
  if (!diagnostics) return;
  try {
    diagnostics(event);
  } catch {
    // A failed log destination must not make the observed operation fail.
  }
}

function codeOf(error: Error): string | number | undefined {
  if (!("code" in error)) return undefined;
  const code = error.code;
  return typeof code === "string" || typeof code === "number" ? code : undefined;
}

function safeThrownMessage<Caught>(caught: Caught): string {
  if (caught === null) return "[null thrown]";
  if (caught === undefined) return "[undefined thrown]";
  if (typeof caught !== "object" && typeof caught !== "function") {
    return `[${typeof caught} thrown]`;
  }
  return Object.prototype.toString.call(caught);
}

function redactUrlQueries(value: string): string {
  return value.replace(/(https?:\/\/[^\s?#]+)\?[^\s]*/gu, "$1?[redacted]");
}
