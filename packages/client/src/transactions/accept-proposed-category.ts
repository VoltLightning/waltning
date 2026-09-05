/**
 * `acceptProposedCategory` — H1's own guard, shared: D2's proposal auto-fills
 * a draft's category only when it is one the picker would actually offer.
 *
 * **The phone had this; the desk bar did not, and regressed it.**
 * `quick-add-screen.tsx`'s own H1-b comment: "Save would have sent an income
 * row carrying an expense category, invisibly." A proposal absent from the
 * offered `categories` — archived, or a stale id from history a category was
 * later deleted under — reads identically to a wrong-kind one: neither is a
 * category the picker would ever hand back, so neither may fill a chip that
 * silently disagrees with what the chip's own sheet would show.
 *
 * **Membership is what proves "not archived."** Every caller's own
 * `categories` list already excludes archived rows (the replica's
 * `listCategories`/`snapshot.categories`) — this function does not read an
 * `archived` field itself, because requiring one would make it possible to
 * pass a list that still carries them and silently mean something else. A
 * proposal naming an id outside the list is refused the same way a proposal
 * naming no id at all would be: `undefined` either way to this function.
 *
 * **A pure predicate, not a hook.** `quick-add-screen.tsx` and
 * `use-command-bar.ts` each derive `categoryAutoFilled` from their own other
 * state (`composerCategoryId`/`parsed.categoryId` already real picks always
 * win, `categoryProposalDismissed`'s own Undo) — this only answers "is the
 * proposal itself acceptable," which is the one part of that condition both
 * callers computed differently before this existed.
 */

import type { CategoryProposal } from "@waltning/core/capture/payee-memory";
import { PROPOSAL_DISPLAY_THRESHOLD } from "@waltning/core/capture/payee-memory";

/** The one shape this needs from a category — `PhoneCategory`'s own two fields that matter here. */
export type AcceptProposedCategoryCandidate = { id: string; kind: "income" | "expense" };

export function acceptProposedCategory(
  proposal: CategoryProposal | undefined,
  categories: readonly AcceptProposedCategoryCandidate[],
  kind: "income" | "expense",
): boolean {
  // `CategoryProposal` is itself `{...} | null` (`proposeCategory`'s own
  // return type) — `undefined` is this hook/screen's own "nothing typed yet"
  // on top of that, so both are checked here rather than leaving either
  // caller to normalise one into the other first.
  if (proposal === undefined || proposal === null) return false;
  if (proposal.confidence < PROPOSAL_DISPLAY_THRESHOLD) return false;
  const category = categories.find((candidate) => candidate.id === proposal.categoryId);
  return category !== undefined && category.kind === kind;
}
