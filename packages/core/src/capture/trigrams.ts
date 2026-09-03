/**
 * Trigram similarity over folded text.
 *
 * `computations.md` §13 uses Postgres's `pg_trgm` for the server-side search
 * index; this is the same algorithm run client-side for D2's on-device
 * payee→category kNN, not a reimplementation of §13's search feature. Padding
 * matches `pg_trgm`'s convention — two blanks before the string, one after —
 * so a short word's edges still contribute trigrams.
 */

const LEAD_PAD = "  ";
const TRAIL_PAD = " ";

export function trigrams(s: string): ReadonlySet<string> {
  const padded = `${LEAD_PAD}${s}${TRAIL_PAD}`;
  const grams = new Set<string>();
  for (let i = 0; i <= padded.length - 3; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const gram of a) {
    if (b.has(gram)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
