/**
 * JSON, typed.
 *
 * `Record<string, unknown>` is the usual stand-in for "some JSON", and it is
 * the thing this project now avoids: it accepts values that are not JSON at
 * all — functions, symbols, class instances — and then every read needs a cast
 * to get anything back out. These types say what JSON actually is, so the
 * compiler rejects a `Date` in a tool schema instead of discovering it when a
 * model provider rejects the request.
 */

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

/**
 * A JSON Schema document, as far as this codebase cares. Structurally a JSON
 * object; the alias exists so signatures say what they mean.
 */
export type JsonSchema = JsonObject;
