/**
 * Minting a row id, without assuming a runtime that has one.
 *
 * **`crypto.randomUUID()` does not exist on the phone.** It was called directly
 * in two places — the SQLite `id` column default and the outbox entry id — and
 * both run only on the device. React Native does not define a `crypto` global,
 * and Expo's polyfills do not add one: searched, zero mentions in either
 * package. So every local write that omitted an id would have thrown at the
 * first insert.
 *
 * It typechecked because `tsc` walks up to the workspace root's
 * `node_modules/@types` and finds `@types/node`, which declares the global that
 * Node has and the phone does not. The CLI passed; the editor, resolving from
 * the package, was right to complain.
 *
 * This is the one place that reads the global, so there is one place to
 * polyfill and one error to read when nobody has.
 */

/** How a runtime mints a UUID. Injected where a caller has one; read from the global otherwise. */
export type IdGenerator = () => string;

/**
 * A UUID, from whatever the runtime provides.
 *
 * **Throws with instructions rather than falling back**, and the alternative is
 * worse than it looks: a `Math.random` fallback would keep the app running
 * while producing ids that are not collision-resistant — and these ids are the
 * **idempotency keys** the server deduplicates on (`architecture/08` C22). Two
 * captures colliding means one write silently discarded as a replay of the
 * other.
 *
 * Node and every browser have this. React Native does not, which is what the
 * message says, because the person reading it will be looking at a phone.
 */
export function randomId(): string {
  const generate = globalThis.crypto?.randomUUID;

  if (typeof generate !== "function") {
    throw new Error(
      "no crypto.randomUUID in this runtime — React Native does not provide one. " +
        "Install a polyfill at the app entry point before anything writes a row.",
    );
  }

  // `.call` because `randomUUID` is a method on `crypto` and reading it off the
  // object loses the receiver in some runtimes.
  return generate.call(globalThis.crypto);
}

/** Whether this runtime can mint an id at all, for a startup check that wants to say so early. */
export const canMintIds = (): boolean => typeof globalThis.crypto?.randomUUID === "function";
