/**
 * `nearMatches` — S15 §9.1's near-duplicate guard, computed client-side.
 *
 * **Trigram similarity over folded names, threshold 0.3, top three ranked.**
 * `jaccard`/`trigrams` are D1's own algorithm (`@waltning/core/capture/trigrams`),
 * the same one `pg_trgm` runs server-side (`computations.md` §13) — this is not
 * a second implementation, it is that algorithm run over the replica's own
 * counterparty list rather than a query the phone cannot make offline.
 *
 * S15 §9.1's own prose names `Ania` finding `Nina` — under this exact,
 * `pg_trgm`-padded algorithm the two share no trigram at all (an anagram of
 * letters is not overlapping substrings), so `near-matches.test.ts` exercises
 * the same "typed a near-duplicate spelling" case with a pair the algorithm
 * genuinely scores above the floor (a doubled-letter typo) rather than
 * asserting a number this implementation cannot produce.
 *
 * **Pure.** Takes the snapshot's counterparties and the recorded-distinct pairs
 * already read; returns ranked candidates. `CounterpartyForm` decides when to
 * call it (on name blur) and what to do with the answer (`MatchWarning`) — this
 * module knows nothing about a screen.
 *
 * **A recorded-distinct pair is skipped, not merely deprioritised.** S15 §9.1:
 * "the dismissal is recorded per pair and the question is never asked again" —
 * a pair once told apart never resurfaces, at any score.
 */

import { fold } from "@waltning/core/capture/names";
import { jaccard, trigrams } from "@waltning/core/capture/trigrams";

export type NearMatchCandidate = {
  id: string;
  name: string;
};

export type NearMatch<T extends NearMatchCandidate> = {
  candidate: T;
  score: number;
};

/** S15 §9.1: "tuned loose" — deliberately generous, because a false positive costs one tap. */
export const NEAR_MATCH_THRESHOLD = 0.3;

/** S15 §9.1: "top three ranked". */
export const NEAR_MATCH_LIMIT = 3;

export type NearMatchesOptions = {
  /** Edit mode only — the record being edited never matches itself. */
  excludeId?: string;
  /**
   * Pairs `record_distinct_counterparties` already recorded, either order.
   * Meaningless without `excludeId` (a brand-new draft has recorded no pairs
   * yet, since it has no id for one to name) — passing pairs with no
   * `excludeId` filters nothing, which is the correct no-op for create mode.
   */
  distinctPairs?: readonly (readonly [string, string])[];
};

/**
 * `name` against `candidates` — folded trigram similarity, `excludeId` and any
 * counterparty already recorded distinct from it dropped before ranking,
 * ranked desc by score, capped at three.
 */
export function nearMatches<T extends NearMatchCandidate>(
  name: string,
  candidates: readonly T[],
  options: NearMatchesOptions = {},
): readonly NearMatch<T>[] {
  const trimmed = name.trim();
  if (trimmed === "") return [];

  const { excludeId, distinctPairs = [] } = options;
  const isRecordedDistinct = (candidateId: string): boolean =>
    excludeId !== undefined &&
    distinctPairs.some(
      ([a, b]) => (a === excludeId && b === candidateId) || (b === excludeId && a === candidateId),
    );

  const needle = trigrams(fold(trimmed));

  return candidates
    .filter((candidate) => candidate.id !== excludeId && !isRecordedDistinct(candidate.id))
    .map((candidate) => ({ candidate, score: jaccard(needle, trigrams(fold(candidate.name))) }))
    .filter((match) => match.score >= NEAR_MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, NEAR_MATCH_LIMIT);
}
