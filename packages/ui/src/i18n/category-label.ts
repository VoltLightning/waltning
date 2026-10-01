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

import { fold } from "@waltning/core/capture/names";
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

/**
 * What a category's colour is hashed from — the seed tag for a starter, so a
 * language switch never repaints it, and the name otherwise (a name that is not
 * a starter's is never translated, so what is drawn is what is stored).
 */
export function categoryTintKey(category: CategoryNamed): string {
  return category.externalId?.startsWith("seed:") ? category.externalId : category.name;
}

/**
 * What a category search compares: `fold`, plus every other accent dropped, so
 * *offentlicher* finds *Öffentlicher Nahverkehr* and *zywnosc* finds *żywność*.
 * Search-only — `fold` itself backs uniqueness indexes and is not widened.
 */
export function categorySearchFold(s: string): string {
  return fold(s).normalize("NFD").replace(/\p{M}/gu, "").replace(/ß/g, "ss");
}

export function categoryLabel(t: TFunction, category: CategoryNamed): string {
  const key = translatableSeedKey(category);
  if (key === null || !isCatalogued(key)) return category.name;
  return t(`taxonomy.${key}`);
}

/** Category id → the name drawn for it — what a write checks a new name against (`SPEC.md` §6.3). */
export function drawnNamesOf(
  labelOf: (category: CategoryNamed & { id: string }) => string,
  nodes: readonly (CategoryNamed & { id: string })[],
): Record<string, string> {
  return Object.fromEntries(nodes.map((node) => [node.id, labelOf(node)]));
}
