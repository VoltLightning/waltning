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

/**
 * **`Intl.PluralRules`, which Hermes does not ship.** Hermes implements `Intl`
 * by calling into the platform's own ICU, and its published support table names
 * `Collator`, `NumberFormat`, `DateTimeFormat` and `getCanonicalLocales` — not
 * `PluralRules` and not `Locale`. i18next builds its plural resolver from
 * `Intl.PluralRules`, so without these the first message that takes a `count`
 * throws on the device and nowhere else.
 *
 * It matters more than an English-only app would suggest: **Polish has four
 * plural categories** where English has two, so the failure this prevents is
 * not a crash but a sentence that is quietly ungrammatical for the language
 * most of this ledger is written in.
 *
 * `/polyfill` rather than `/polyfill-force` — it installs only where the
 * runtime has none, so the browser and Node keep their own implementations and
 * only Hermes gets ours. The locale data is per-language and must be imported
 * for each: a language with no data resolves as English.
 *
 * Order is required. `Locale` is built on `getCanonicalLocales`, and
 * `PluralRules` on both.
 *
 * The `.js` suffixes are the packages' own `exports` map — `"./polyfill.js"`
 * is the declared subpath and `"./polyfill"` resolves to nothing.
 */
import "@formatjs/intl-getcanonicallocales/polyfill.js";
import "@formatjs/intl-locale/polyfill.js";
import "@formatjs/intl-pluralrules/polyfill.js";
import "@formatjs/intl-pluralrules/locale-data/en.js";
import "@formatjs/intl-pluralrules/locale-data/pl.js";
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
