/**
 * Name matching: accounts and categories bind by their name (or an alias),
 * case- and diacritic-folded, longest match wins.
 *
 * No fuzzy matching — a typo does not bind (tier 1.5 / D2 adds that). A name
 * binds only when it appears as a whole word or word-run in the text.
 */

export type NameMatch<T> = { value: T; span: [number, number] };

/**
 * The diacritics this product's two languages use (`CaptureContext.locale` is
 * `"en" | "pl"`), each a single code point folded to its plain-ASCII letter.
 * A one-to-one character map, deliberately: `findName` folds the *text* once
 * and matches folded needles against it, and that only produces correct spans
 * on the *original* text if folding never changes a string's length.
 */
const DIACRITICS: Record<string, string> = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
};

/** Case-fold and strip the diacritics above. Length-preserving — see the note on `DIACRITICS`. */
export function fold(s: string): string {
  return s.toLowerCase().replace(/[ąćęłńóśźż]/g, (ch) => DIACRITICS[ch] ?? ch);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether two half-open spans share any character. */
function overlaps(a: readonly [number, number], b: readonly [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/**
 * Find the best-matching candidate's name (or alias) in `text`.
 *
 * **Longest variant wins.** Every candidate's name and aliases are pooled
 * into one list of searchable strings and tried longest-first, so `"Bank A"`
 * matches ahead of a separate `"Bank"` candidate even though both would
 * technically match the same text. Matching is folded and word-boundary
 * anchored, never a substring inside a longer word.
 *
 * `exclude` is a set of spans — typically the amount and its currency token —
 * that a match must not land inside. An occurrence there is treated as if it
 * were not present, and the search continues (another occurrence of the same
 * variant, or the next-longest variant) rather than failing outright.
 */
export function findName<T extends { id: string; name: string; aliases?: readonly string[] }>(
  text: string,
  candidates: readonly T[],
  exclude: readonly [number, number][],
): NameMatch<T> | null {
  const folded = fold(text);

  const variants: { needle: string; value: T }[] = [];
  for (const candidate of candidates) {
    variants.push({ needle: fold(candidate.name), value: candidate });
    for (const alias of candidate.aliases ?? []) {
      variants.push({ needle: fold(alias), value: candidate });
    }
  }
  variants.sort((a, b) => b.needle.length - a.needle.length);

  for (const { needle, value } of variants) {
    if (needle.length === 0) continue;
    const pattern = new RegExp(`\\b${escapeRegExp(needle)}\\b`, "g");
    let match: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: the idiomatic `exec` loop.
    while ((match = pattern.exec(folded))) {
      const span: [number, number] = [match.index, match.index + match[0].length];
      if (!exclude.some((ex) => overlaps(span, ex))) {
        return { value, span };
      }
    }
  }
  return null;
}
