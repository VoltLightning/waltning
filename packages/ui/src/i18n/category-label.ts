/**
 * What a category is called on screen — the display rule, in one function.
 *
 * A starter category whose stored name is still the seed's canonical one reads
 * from the catalogue's `taxonomy` block in the app's language; anything else —
 * a renamed starter, a category the person made — reads as stored. Which case a
 * row is in is `@waltning/core/seed-label`'s answer; this only fetches the
 * words, so a language change re-labels every starter at once.
 *
 * Every place that draws a category name calls this (or `useCategoryLabel`,
 * which binds the current translator), so the rule has one implementation.
 */

import { translatableSeedKey } from "@waltning/core/seed-label";
import type { TFunction } from "i18next";
import { en } from "./en.ts";

type SeedKey = keyof typeof en.taxonomy;

function isCatalogued(key: string): key is SeedKey {
  return Object.hasOwn(en.taxonomy, key);
}

/** The two fields the rule reads; every category-shaped row has them. */
export type CategoryNamed = {
  name: string;
  externalId?: string | null | undefined;
};

export function categoryLabel(t: TFunction, category: CategoryNamed): string {
  const key = translatableSeedKey(category);
  if (key === null || !isCatalogued(key)) return category.name;
  return t(`taxonomy.${key}`);
}
