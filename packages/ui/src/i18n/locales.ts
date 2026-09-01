/**
 * Which languages ship, and how a device's preference becomes one of them.
 *
 * **Deliberately free of i18next and of React.** Everything here is a pure
 * function over strings, so the two decisions that are easy to get wrong — which
 * language a device gets, and how a figure is punctuated in it — are testable
 * without mounting anything. `provider.tsx` holds the framework; this file holds
 * the choices.
 */

import { en, type Messages } from "./en.ts";
import { pl } from "./pl.ts";

/** A language this app ships a complete catalogue for. */
export type Locale = "en" | "pl";

/**
 * **`en` first, and it is the fallback.** Not because English is the important
 * one — the ledger is mostly złoty — but because `en.ts` is the file the type is
 * derived from, so it is the only catalogue that cannot be incomplete.
 */
export const LOCALES = ["en", "pl"] as const satisfies readonly Locale[];

export const catalogues: Record<Locale, Messages> = { en, pl };

/**
 * The decimal mark, **by language**.
 *
 * `design-system/04` §4.1 fixes the *group* separator at U+00A0 for every
 * language and gives the reason: a comma group with a dot decimal is ambiguous
 * in both conventions this product meets, and a space group is ambiguous in
 * neither. That argument settles the group separator and leaves the decimal
 * mark open — and once the groups are spaces, `12 480,20` and `12 480.20` are
 * each unambiguous, so the mark is free to follow the reader.
 *
 * Which is to say it *must*: `12 480.20` is not how a Polish reader writes a
 * figure, and a finance app that punctuates money in someone else's convention
 * is wrong on the one screen it exists for.
 *
 * **Not `Intl.NumberFormat`.** That would take the group separator with it and
 * silently overturn a decision §4.1 states in prose — and Hermes's
 * `NumberFormat` differs between Android and iOS, which is a way for the same
 * ledger to render differently on two phones.
 */
const DECIMAL_MARK: Record<Locale, "." | ","> = { en: ".", pl: "," };

export function decimalMark(locale: Locale): "." | "," {
  return DECIMAL_MARK[locale];
}

/** Whether a string is a language this app ships. */
export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * A device's ordered language preferences onto a language that ships.
 *
 * **Matched on the primary subtag.** A device set to `pl-PL` gets Polish, and
 * so does one set to plain `pl`; there is no regional catalogue to choose
 * between and pretending otherwise would drop a match for a tag that is a
 * perfectly good answer.
 *
 * **Order is the device's, not ours.** Someone whose phone lists Polish then
 * English wants Polish; scanning `LOCALES` in our own order would hand them
 * English because English happens to be listed first here.
 *
 * Falls back to `en` on an empty list or an unshipped language — a real state
 * on a device set to a language nobody has translated, and the one case where
 * rendering *something* beats rendering keys.
 */
export function resolveLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const primary = tag.split("-")[0]?.toLowerCase() ?? "";
    if (isLocale(primary)) return primary;
  }
  return "en";
}
