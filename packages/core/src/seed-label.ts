/**
 * Whether a category's name is still the starter's own — the first half of the
 * display rule, and the half that does not need a language.
 *
 * **A starter category reads in the app's language until the person renames
 * it.** Every seeded row carries `seed:<key>` (`external_id`) and the seed's
 * canonical English name as `name`. A rename changes `name`, never
 * `external_id`, so the pair says which it is without a column of its own:
 * while `name` still equals the canonical name the row is the starter's and
 * its text is the catalogue's (`taxonomy.<key>`); once they differ the text is
 * the person's and is shown exactly as stored.
 *
 * Renaming a row to exactly its canonical English name makes it the starter's
 * again and it translates — the two are indistinguishable, and the stored text
 * is the same either way.
 *
 * Pure and in `core` because both engines and every surface need the same
 * answer; the words themselves are `packages/ui`'s catalogues.
 */

import { expenseTree, incomeTree, topLevelLeaves } from "./taxonomy.ts";

const SEED_PREFIX = "seed:";

/** Seed key → the canonical English name the seed stores. */
export const seedNames: ReadonlyMap<string, string> = new Map([
  ...[...incomeTree, ...expenseTree].flatMap((group) => [
    [group.key, group.name] as const,
    ...group.leaves.map((leaf) => [leaf.key, leaf.name] as const),
  ]),
  ...topLevelLeaves.map((leaf) => [leaf.key, leaf.name] as const),
]);

/**
 * The seed key whose translation this row should show, or `null` when the row
 * is not a starter category or has been renamed.
 */
export function translatableSeedKey(row: {
  name: string;
  externalId?: string | null | undefined;
}): string | null {
  const tag = row.externalId;
  if (tag === null || tag === undefined || !tag.startsWith(SEED_PREFIX)) return null;
  const key = tag.slice(SEED_PREFIX.length);
  return seedNames.get(key) === row.name ? key : null;
}
