/** Platform-neutral diagnostics primitives shared by clients, storage and API. */

export type DiagnosticError = {
  name: string;
  message: string;
  /**
   * `true` when `message` is this module's own description of the thrown
   * value rather than words the thrower wrote — `[Object thrown with …]`,
   * `[null thrown]`. A flag rather than a look at the text: the driver this
   * app vendors throws `[importAssetDatabaseAsync] Failed to fetch …`, and a
   * `ZodError`'s message is `JSON.stringify` over its issues, so a leading
   * bracket is not the marker it looks like.
   */
  authored?: true;
  stack?: string;
  code?: string | number;
  cause?: DiagnosticError;
};

export type DiagnosticSink<Event> = (event: Event) => void;

const MAX_CAUSE_DEPTH = 8;
/** A message is evidence, not a transcript — long ones are truncated, never dropped. */
const MAX_MESSAGE_LENGTH = 300;
/**
 * Preserve causal errors, and the error-shaped fields of a thrown non-`Error`,
 * without inspecting arbitrary object *values*, which may contain ledger data.
 * URL queries are stripped because tRPC GET inputs live there and native
 * network errors sometimes repeat the complete URL.
 *
 * **`code` is read off any thrown object; `name` and `message` only from one
 * that proves it is an error.** A `code` is a field a ledger record does not
 * have, so reading it is reading the error. `name` and `message` are not
 * self-evidencing in the same way — a record can be called `name` and hold a
 * counterparty — so they are trusted only when a `code` or a `stack` sits
 * beside them, and otherwise the value is described by `describeShape`, which
 * prints a field name only from a fixed list and counts the rest. Both of
 * those functions carry the argument in full.
 *
 * Not everything that throws is an `Error`, and the ones that are not are the
 * ones worth handling well: a `catch` binding is `unknown` by construction, a
 * rejected promise carries whatever was passed to `reject`, and JSON off a
 * wire is whatever the far side wrote.
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
 * **Every site whose string reaches a screen, and no others.** Besides the two
 * platform ledgers those are `packages/ledger/src/migrate.ts` (a migration
 * refusal, on this very startup screen), the three refusal readers in
 * `create-phone-ledger.ts`, `use-transaction-search.ts` and
 * `packages/client/src/query/use-query.ts` — all routed through here.
 *
 * Five `String(error)` sites remain, and all five are log or tooling paths
 * where the worst case is a line in a console: `packages/ledger/src/recover.ts`
 * (a stored halt reason), `apps/api/src/infra/db.ts`, `tools/e2e/src/smoke.ts`,
 * `tools/e2e/specs/00-smoke.spec.ts` and `packages/ui/visual/stories.spec.ts`.
 * Nothing lints for the shape, so this is a rule about where the output goes,
 * not one a test enforces.
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

/**
 * `code` fills in where the thrower said nothing, and never decorates what it
 * did say.
 *
 * A `DOMException` carries its legacy numeric code — `7` for
 * `NoModificationAllowedError` — and appending that to a sentence someone is
 * meant to read puts a bare number on a screen for no reader's benefit
 * (`design-system/08` §8.2: never a bare code). Where there is no sentence,
 * the code is the most identifying thing there is, so it is kept.
 *
 * "Said nothing" is `authored` — a flag this module sets on its own
 * descriptions — plus an empty message. It was a leading `[`, which read like
 * a safe marker and is not one: `expo-sqlite`'s own worker throws
 * `[importAssetDatabaseAsync] Failed to fetch asset database: …`, and a
 * `ZodError`'s message is `JSON.stringify` over its issues.
 */
function presentableMessage(described: DiagnosticError): string {
  const code = described.code === undefined ? "" : ` (${described.code})`;
  if (described.message.length === 0) return `${described.name} with no message${code}`;
  return described.authored ? `${described.message}${code}` : described.message;
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
  if (caught === null) return { name: "ThrownValue", message: "[null thrown]", authored: true };
  if (caught === undefined)
    return { name: "ThrownValue", message: "[undefined thrown]", authored: true };
  if (typeof caught === "string") {
    // An empty message renders as an empty line on a failure screen — the
    // tag, the title, a blank, and a button — so it is named instead.
    return caught.length > 0
      ? { name: "ThrownValue", message: boundedMessage(caught) }
      : { name: "ThrownValue", message: "[empty string thrown]", authored: true };
  }
  if (typeof caught !== "object" && typeof caught !== "function") {
    // Numbers, booleans, bigints and symbols render themselves in full and
    // hold no fields, so the value is the whole of what there is to say.
    return {
      name: "ThrownValue",
      message: `[${typeof caught} thrown: ${String(caught)}]`,
      authored: true,
    };
  }
  return describeThrownObject(caught);
}

/**
 * Read through `in` narrowing rather than an index signature or a cast: the
 * compiler gives each field its own narrowed type from the `typeof` beside it,
 * so no declaration here claims to know what a thrown value holds.
 *
 * **`name` and `message` are read only from a value that proves it is an
 * error, and `code` or `stack` is the proof.** `describeShape` below declines
 * to decide from a key's *syntax* whether it is schema or a label; a key's
 * *spelling* is no better. A record can be called `name` and hold "Acme", and
 * a record can be called `message` and hold a sentence about someone's money —
 * so a plain object carrying only those two is indistinguishable from data and
 * is described by its shape instead. A `code` (string or number) or a `stack`
 * (string) is a field a ledger record does not have, and reading the pair
 * behind it is reading an error.
 *
 * Nothing in this system is narrowed by that: every throw crossing the SQLite
 * worker boundary is normalised to an `Error` and rebuilt as one on the far
 * side, so this branch is for values from third-party code, and the cost of
 * being wrong about one of those is a shape description instead of a sentence.
 */
function describeThrownObject(caught: object): DiagnosticError {
  const code =
    "code" in caught && (typeof caught.code === "string" || typeof caught.code === "number")
      ? caught.code
      : undefined;
  const errorShaped = code !== undefined || ("stack" in caught && typeof caught.stack === "string");

  const name =
    errorShaped && "name" in caught && typeof caught.name === "string" && caught.name.length > 0
      ? caught.name
      : "ThrownValue";
  const spoken =
    errorShaped &&
    "message" in caught &&
    typeof caught.message === "string" &&
    caught.message.length > 0
      ? boundedMessage(caught.message)
      : null;

  return {
    name,
    message: spoken ?? describeShape(caught),
    ...(spoken === null ? { authored: true as const } : {}),
    ...(code !== undefined ? { code } : {}),
  };
}

/**
 * The field names on an error-shaped value, closed. A key is printed **only**
 * if it is one of these, so a printed key is never derived from data.
 */
const REPORTABLE_KEYS: ReadonlySet<string> = new Set([
  "cause",
  "code",
  "detail",
  "errno",
  "error",
  "message",
  "name",
  "reason",
  "stack",
  "status",
  "statusCode",
  "type",
]);

/**
 * What was thrown, without saying what was in it: the constructor's name, the
 * field names from a fixed list, and a count of everything else.
 *
 * **A shape test on the key is not enough, and that was the earlier bug.** The
 * claim that a name is schema and a value is the ledger holds for an object
 * someone wrote a type for; it does not hold for a dictionary *keyed* by data.
 * A regex over key syntax cannot separate `accountName` from `Acme` — most
 * counterparty and account labels in a ledger are one ASCII word, and one
 * ASCII word is a plain identifier, so `{ "Acme": "duplicate" }` printed the
 * name. An allowlist can separate them, because it does not ask what the key
 * looks like: a key that prints is one of twelve, and none of the twelve can
 * be a label.
 *
 * An array is only ever counted, its indices being noise.
 */
function describeShape(caught: object): string {
  const label = constructorNameOf(caught);
  if (Array.isArray(caught)) return `[Array(${caught.length}) thrown]`;
  const keys = Object.keys(caught);
  if (keys.length === 0) return `[${label} thrown, no fields]`;
  const named = keys.filter((key) => REPORTABLE_KEYS.has(key));
  const rest = keys.length - named.length;
  if (named.length === 0) return `[${label} thrown with ${rest} field(s)]`;
  return `[${label} thrown with ${named.join(", ")}${rest > 0 ? `, +${rest} other field(s)` : ""}]`;
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
