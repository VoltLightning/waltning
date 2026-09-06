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
/** A message is evidence, not a transcript — long ones are truncated, never dropped. */
const MAX_MESSAGE_LENGTH = 300;
/** How many field *names* a shape description lists before it says "+n more". */
const MAX_SHAPE_KEYS = 12;

/**
 * Preserve causal errors, and the three error-shaped fields of a thrown
 * non-`Error`, without inspecting arbitrary object *values*, which may contain
 * ledger data. URL queries are stripped because tRPC GET inputs live there and
 * native network errors sometimes repeat the complete URL.
 *
 * **`name` · `message` · `code` are read off a thrown object; nothing else
 * is.** The web SQLite worker rejects with a plain `{ code, message }` rather
 * than an `Error`, and `Object.prototype.toString` rendered every one of them
 * as `[object Object]` — which reached the startup failure screen as the whole
 * explanation of why the ledger would not open. Those three names mean the
 * same thing on every error-like value in the language, so reading them is not
 * inspection of someone's data; it is reading the error. When they are absent
 * the fallback names the value's constructor and its field *names* — a shape,
 * never a value, because a field called `accountName` is schema and what is
 * inside it is the ledger.
 *
 * A thrown string is its own message by construction — there is no other field
 * it could be — so it is carried through the same bounding and redaction an
 * `Error`'s message gets, rather than reported as the bare fact that a string
 * was thrown.
 */
export function describeDiagnosticError<Caught>(
  caught: Caught,
  seen: ReadonlySet<Error> = new Set(),
  depth = 0,
): DiagnosticError {
  if (!(caught instanceof Error)) {
    return describeThrownValue(caught);
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
    message: boundedMessage(caught.message),
    ...(caught.stack ? { stack: redactUrlQueries(caught.stack) } : {}),
    ...(code !== undefined ? { code } : {}),
    ...(cause !== undefined ? { cause: describeDiagnosticError(cause, nextSeen, depth + 1) } : {}),
  };
}

/**
 * A caught value as an `Error`, keeping whatever the thrower said.
 *
 * `new Error(String(caught))` is the shape this replaces, and it is where
 * `[object Object]` reached a user-facing screen: the web SQLite worker
 * rejects with a plain object, `String` renders it as that constant, and a
 * failure screen then explained nothing at all. Routing through
 * `describeDiagnosticError` means one description of a thrown value, used both
 * by the logs and by whatever renders the failure.
 */
export function errorFromThrown<Caught>(caught: Caught): Error {
  if (caught instanceof Error) return caught;
  const described = describeDiagnosticError(caught);
  const error = new Error(described.message);
  error.name = described.name;
  return error;
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

function describeThrownValue<Caught>(caught: Caught): DiagnosticError {
  if (caught === null) return { name: "ThrownValue", message: "[null thrown]" };
  if (caught === undefined) return { name: "ThrownValue", message: "[undefined thrown]" };
  if (typeof caught === "string") return { name: "ThrownValue", message: boundedMessage(caught) };
  if (typeof caught !== "object" && typeof caught !== "function") {
    // Numbers, booleans, bigints and symbols render themselves in full and
    // hold no fields, so the value is the whole of what there is to say.
    return { name: "ThrownValue", message: `[${typeof caught} thrown: ${String(caught)}]` };
  }
  return describeThrownObject(caught);
}

/**
 * Read through `in` narrowing rather than an index signature or a cast: the
 * compiler gives each field its own narrowed type from the `typeof` beside it,
 * so no declaration here claims to know what a thrown value holds.
 */
function describeThrownObject(caught: object): DiagnosticError {
  const name =
    "name" in caught && typeof caught.name === "string" && caught.name.length > 0
      ? caught.name
      : "ThrownValue";
  const message =
    "message" in caught && typeof caught.message === "string" && caught.message.length > 0
      ? boundedMessage(caught.message)
      : describeShape(caught);
  const code =
    "code" in caught && (typeof caught.code === "string" || typeof caught.code === "number")
      ? caught.code
      : undefined;

  return { name, message, ...(code !== undefined ? { code } : {}) };
}

/**
 * What was thrown, without saying what was in it: the constructor's name and
 * the field names, never a field value.
 */
function describeShape(caught: object): string {
  const label = constructorNameOf(caught);
  const keys = Object.keys(caught);
  if (keys.length === 0) return `[${label} thrown, no fields]`;
  const shown = keys.slice(0, MAX_SHAPE_KEYS);
  const rest = keys.length - shown.length;
  return `[${label} thrown with ${shown.join(", ")}${rest > 0 ? `, +${rest} more` : ""}]`;
}

/** `"object"` for a null-prototype value, which has no constructor to name. */
function constructorNameOf(value: object): string {
  if (!("constructor" in value)) return "object";
  const ctor = value.constructor;
  return typeof ctor === "function" && ctor.name.length > 0 ? ctor.name : "object";
}

function boundedMessage(value: string): string {
  const redacted = redactUrlQueries(value);
  return redacted.length <= MAX_MESSAGE_LENGTH
    ? redacted
    : `${redacted.slice(0, MAX_MESSAGE_LENGTH)}…`;
}

function redactUrlQueries(value: string): string {
  return value.replace(/(https?:\/\/[^\s?#]+)\?[^\s]*/gu, "$1?[redacted]");
}
