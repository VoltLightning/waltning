/**
 * The currency of a region, for the one place a device's region matters: the
 * display currency a ledger opens in when nothing has been chosen (§7.0).
 *
 * **Pure, and only the regions the reference list can answer for.** A phone
 * reports its region's currency itself (`expo-localization`); a browser
 * reports a language tag and nothing more, so this table is what turns the tag's
 * region into a currency there. A region outside it answers `null`, and the
 * caller falls on the pivot — the same answer as a region the ledger does not
 * hold a currency for.
 */

import { type CurrencyCode, currencyCode } from "@waltning/core/money";

const EURO_REGIONS = [
  "AD",
  "AT",
  "BE",
  "BG",
  "CY",
  "DE",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MC",
  "ME",
  "MT",
  "NL",
  "PT",
  "SI",
  "SK",
  "SM",
  "VA",
  "XK",
] as const;

const OTHER_REGIONS: Readonly<Record<string, string>> = {
  BY: "BYN",
  GB: "GBP",
  GE: "GEL",
  PL: "PLN",
  RU: "RUB",
  US: "USD",
};

const BY_REGION: ReadonlyMap<string, string> = new Map([
  ...EURO_REGIONS.map((region): [string, string] => [region, "EUR"]),
  ...Object.entries(OTHER_REGIONS),
]);

/**
 * The region of a BCP-47 tag — `de-DE` → `DE`. A tag naming none (`de`) takes
 * the language's likely region (`Intl.Locale.maximize`: `de` → `DE`), where the
 * engine has it; `null` otherwise.
 */
export function regionOfTag(tag: string): string | null {
  const named = /^[a-z]{2,3}(?:[-_][A-Za-z]{4})?[-_]([A-Za-z]{2}|\d{3})(?:[-_]|$)/.exec(tag)?.[1];
  if (named !== undefined) return named.toUpperCase();
  try {
    return new Intl.Locale(tag).maximize().region ?? null;
  } catch {
    // `Intl.Locale` is absent in some engines and throws on a malformed tag.
    return null;
  }
}

/** The currency a region uses, or `null` for a region this table does not know. */
export function currencyOfRegion(region: string | null): CurrencyCode | null {
  if (region === null) return null;
  const code = BY_REGION.get(region.toUpperCase());
  return code === undefined ? null : currencyCode(code);
}

/**
 * `de-DE` → EUR. **The first tag only** — the person's own first language is
 * the one whose region answers; a later tag is a fallback language, and its
 * region is not where they are.
 */
export function currencyOfTags(tags: readonly string[]): CurrencyCode | null {
  const first = tags[0];
  return first === undefined ? null : currencyOfRegion(regionOfTag(first));
}
