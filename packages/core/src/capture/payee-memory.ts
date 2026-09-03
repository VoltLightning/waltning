import type { AccountingDate } from "../date.ts";
import { jaccard, trigrams } from "./trigrams.ts";

/**
 * Case- and diacritic-fold a payee string for comparison.
 *
 * D2 depends on D1's `fold()` (`packages/core/src/capture/names.ts`). D1 had
 * not merged when this module was written, so this is a local copy —
 * de-duplicate against D1's `fold` in the rebase once both land.
 */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const MIN_SIMILARITY = 0.2;
const DEFAULT_K = 7;

export type PayeeHistoryRow = {
  payee: string;
  categoryId: string;
  date: AccountingDate;
};

export type CategoryProposal = {
  categoryId: string;
  confidence: number;
  basis: "exact" | "neighbours";
  neighbours: readonly { payee: string; similarity: number }[];
} | null;

/**
 * `computations.md` §14: not self-reported. An exact fold match to a prior
 * payee reuses its most recent category at confidence 1 — no retrieval
 * needed. Otherwise, trigram kNN (§13's algorithm, run client-side) over the
 * folded payee history: confidence is the plurality category's share of the
 * *k* nearest neighbours at similarity ≥ 0.2, never the model's own claim.
 * The 0.85 display threshold from §14 is the screen's to apply — this
 * function only returns the number.
 */
export function proposeCategory(
  payee: string,
  history: readonly PayeeHistoryRow[],
  k: number = DEFAULT_K,
): CategoryProposal {
  if (!Number.isInteger(k) || k < 1) {
    throw new Error(`proposeCategory k must be a positive integer, got ${k}`);
  }
  if (history.length === 0) return null;

  const target = fold(payee);
  // A blank or whitespace-only payee has no meaningful trigrams — padding
  // alone would make it look identical to any other blank history row (both
  // fold to the single all-space gram), a confident-looking match on nothing.
  if (target.trim().length === 0) return null;

  const exactMatches = history.filter((row) => fold(row.payee) === target);
  if (exactMatches.length > 0) {
    const mostRecent = mostRecentBy(exactMatches, (row) => row.date);
    return { categoryId: mostRecent.categoryId, confidence: 1, basis: "exact", neighbours: [] };
  }

  const targetGrams = trigrams(target);
  const scored = history
    .map((row) => ({ row, similarity: jaccard(targetGrams, trigrams(fold(row.payee))) }))
    .filter(({ similarity }) => similarity >= MIN_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity || compareDate(b.row.date, a.row.date));

  if (scored.length === 0) return null;

  const nearest = scored.slice(0, k);
  const byCategory = new Map<string, { count: number; bestRank: number }>();
  nearest.forEach(({ row }, rank) => {
    const entry = byCategory.get(row.categoryId);
    if (entry) {
      entry.count += 1;
    } else {
      byCategory.set(row.categoryId, { count: 1, bestRank: rank });
    }
  });

  let winner: { categoryId: string; count: number; bestRank: number } | null = null;
  for (const [categoryId, { count, bestRank }] of byCategory) {
    if (!winner || count > winner.count || (count === winner.count && bestRank < winner.bestRank)) {
      winner = { categoryId, count, bestRank };
    }
  }
  if (!winner) return null;

  return {
    categoryId: winner.categoryId,
    confidence: winner.count / nearest.length,
    basis: "neighbours",
    neighbours: nearest.map(({ row, similarity }) => ({ payee: row.payee, similarity })),
  };
}

function mostRecentBy<T>(rows: readonly T[], date: (row: T) => AccountingDate): T {
  return rows.reduce((latest, row) => (compareDate(date(row), date(latest)) > 0 ? row : latest));
}

function compareDate(a: AccountingDate, b: AccountingDate): number {
  return a === b ? 0 : a > b ? 1 : -1;
}
