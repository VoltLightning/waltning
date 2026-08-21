/**
 * Runtime globals the phone does not have.
 *
 * **Imported for its side effects, first, before anything can write a row.**
 * That is unusual and it is the point: `randomId()` reads `globalThis.crypto`
 * at call time, and the first call is an insert. A polyfill installed later
 * than that is a polyfill installed too late.
 *
 * `crypto.randomUUID` exists in Node and in every browser. **React Native does
 * not provide it** — searched, zero mentions in `react-native` or `expo` — so
 * on the device the id column's default and the outbox entry id would both
 * have thrown at the first local write.
 *
 * `expo-crypto` supplies the same function with the same guarantees. Assigned
 * onto the global rather than imported at each use, because the two call sites
 * are in `packages/schema` and `packages/ledger`, which must not name a
 * platform (`architecture/11`) — the shared schema reaching for an Expo module
 * is the direction the whole seam exists to forbid.
 */

import { randomUUID } from "expo-crypto";

const existing = globalThis.crypto as (Crypto & { randomUUID?: () => string }) | undefined;

if (typeof existing?.randomUUID !== "function") {
  const crypto = existing ?? ({} as Crypto);

  Object.defineProperty(crypto, "randomUUID", {
    value: randomUUID,
    configurable: true,
    writable: true,
  });

  if (!existing) {
    Object.defineProperty(globalThis, "crypto", { value: crypto, configurable: true });
  }
}
