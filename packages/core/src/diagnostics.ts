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
 * `new Error(String(caught))` is the shape this replaces — a plain object
 * becomes the constant `[object Object]` and the screen above it then explains
 * nothing. Routing through `describeDiagnosticError` means one description of
 * a thrown value, used both by the logs and by whatever renders the failure.
 *
 * **The two platform ledgers, not every call site.** Nine other places still
 * write `String(error)` — `use-query.ts`, three readers in
 * `create-phone-ledger.ts`, `use-transaction-search.ts`, `recover.ts`,
 * `migrate.ts`, `db.ts` — and nothing lints for the shape. This is the better
 * default, not an enforced invariant, and sweeping them is its own change.
 *
 * **An `Error` is returned unchanged, except that it must say something.** An
 * empty `message` renders as an empty line on a failure screen — the tag, the
 * title, a blank, and a button — which is worse than a code, so a message this
 * function cannot show is replaced by one naming what it had. `code` is
 * appended for the same reason: it is often the only identifying field, and
 * the screen reads the message and nothing else.
 */
export function errorFromThrown<Caught>(caught: Caught): Error {
  const described = describeDiagnosticError(caught);
  const message = presentableMessage(described);
  if (caught instanceof Error) {
    if (message === caught.message) return caught;
    const restated = new Error(message, { cause: caught });
    restated.name = caught.name;
    return restated;
  }
  const error = new Error(message);
  error.name = described.name;
  return error;
}

function presentableMessage(described: DiagnosticError): string {
  const code = described.code === undefined ? "" : ` (${described.code})`;
  if (described.message.length > 0) return `${described.message}${code}`;
  return `${described.name} with no message${code}`;
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
  if (typeof caught === "string") {
    // An empty message renders as an empty line on a failure screen — the
    // tag, the title, a blank, and a button — so it is named instead.
    return {
      name: "ThrownValue",
      message: caught.length > 0 ? boundedMessage(caught) : "[empty string thrown]",
    };
  }
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
 *
 * **A key is only reported when it looks like a declared field.** The claim
 * that a name is schema and a value is the ledger holds for an object someone
 * wrote a type for; it does not hold for a dictionary *keyed* by data —
 * `{ "Some Counterparty": "duplicate" }` would otherwise put a real name into
 * the logs and onto the screen. So a key that is not a plain identifier is
 * counted rather than printed, and an array is only ever counted, its indices
 * being noise.
 */
const SCHEMA_KEY = /^[A-Za-z_$][A-Za-z0-9_$]{0,39}$/u;

function describeShape(caught: object): string {
  const label = constructorNameOf(caught);
  if (Array.isArray(caught)) return `[Array(${caught.length}) thrown]`;
  const keys = Object.keys(caught);
  if (keys.length === 0) return `[${label} thrown, no fields]`;
  const named = keys.filter((key) => SCHEMA_KEY.test(key)).slice(0, MAX_SHAPE_KEYS);
  const rest = keys.length - named.length;
  if (named.length === 0) return `[${label} thrown with ${rest} unnamed field(s)]`;
  return `[${label} thrown with ${named.join(", ")}${rest > 0 ? `, +${rest} more` : ""}]`;
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
