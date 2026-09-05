/**
 * `useCommandBar` — DESK2's own state for `screens/S05-quick-add.md`'s "Web
 * — ≥1024px" section: one line of text, resolved live by D1's grammar
 * (`parseCapture`) and D2's category memory, saved through the same
 * `createTransaction` the phone's own quick-add draft calls
 * (`create-phone-ledger.ts`'s `QuickAddDraft`).
 *
 * **Fixed to `type: "expense"`.** S05 §9's own decision — Quick add is an
 * expense composer, and a transfer or an income entry gets its own composer
 * (`+` long-press on the phone) — holds here too: the bar has no type
 * toggle, and nothing in D1's grammar resolves the other two, so every save
 * through it is an expense.
 *
 * **`parse` arrives as a parameter, not a closed-over import.** The caller
 * already has the ledger's accounts, categories, today's date and a default
 * account (`useLastUsedAccount` — the same four-hour window the phone
 * composer applies) to build `CaptureContext` from; this hook stays free of
 * all of it; a test can hand it a stub that returns a fixed `CaptureParse`
 * for a fixed string, and a real caller closes `parseCapture` over its own
 * context.
 *
 * **D2's category proposal is the phone's own call, not a second one.**
 * `quick-add-screen.tsx` folds the typed payee and runs it against
 * `listPayeeHistory()`; `acceptProposedCategory` (this domain's own shared
 * guard) decides whether it auto-applies — a proposal must name a category
 * among the ones offered (never archived, since that list already excludes
 * them) and of the right kind, or the chip stays unfilled and asks. A payee
 * typed here and a payee typed on the phone earn the same category the same
 * way, refused the same way too.
 *
 * **No model path.** A line D1 cannot resolve stays a `CaptureParse` with
 * `ok: false` — this hook never spends a model call on it, and `submit` is a
 * no-op until the grammar itself resolves the line (`screens/S05-quick-add.
 * md` §3: the slow path is offered, never taken, and this arc does not build
 * the offer).
 */

import type { CaptureParse } from "@waltning/core/capture/grammar";
import { fold } from "@waltning/core/capture/names";
import type { CategoryProposal, PayeeHistoryRow } from "@waltning/core/capture/payee-memory";
import { proposeCategory } from "@waltning/core/capture/payee-memory";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FieldError } from "../transport/field-errors.ts";
import {
  type AcceptProposedCategoryCandidate,
  acceptProposedCategory,
} from "./accept-proposed-category.ts";

/**
 * The user-owned subset of `create-phone-ledger.ts`'s own `QuickAddDraft`
 * this bar ever fills — a structural duplicate, not an import: `transactions/`
 * and `ledger/` are sibling modules within `packages/client/src`
 * (`architecture/11`'s "no module imports a sibling module" holds inside a
 * package too), and the app file that owns both `useLedgerController()` and
 * this hook is where the two are meant to meet. `type` is narrowed to the one
 * value this bar ever saves (`use-command-bar.ts`'s own file doc), which is
 * what keeps a real `QuickAddDraft` accepted here without a cast — every
 * field `QuickAddDraft` requires beyond these is optional there.
 */
export type CommandBarDraft = {
  type: "expense";
  amount: string;
  accountId: string;
  categoryId: string | null;
  payee: string;
  date: string;
  note: string;
  isBusiness: boolean;
  counterpartyId: string | null;
  counterpartyRole: "debt" | "contribution" | "reference" | null;
};

/**
 * The two controller methods this hook ever calls — a structural duplicate of
 * `PhoneLedgerController`'s own two, for the same reason `CommandBarDraft`
 * above is one rather than an import.
 */
export type CommandBarController = {
  createTransaction: (
    draft: CommandBarDraft,
  ) => { id: string; deferred?: boolean } | { fieldErrors: readonly FieldError[] };
  listPayeeHistory: () => readonly PayeeHistoryRow[];
};

export type CommandBarState = {
  /** The line as typed — `TextInput`'s own controlled value. */
  text: string;
  setText: (text: string) => void;
  /** `null` on an empty bar — there is nothing to say about a line not yet begun. */
  parse: CaptureParse | null;
  /**
   * The draft's effective category — a real match from the grammar, or (D2)
   * an accepted proposal applied on the draft's behalf (`acceptProposedCategory`).
   * `null` either while nothing has resolved, while a proposal sits below
   * the display threshold, or while it names a category outside the ones
   * offered — the same "suggestion, not a value" rule `quick-add-screen.tsx`
   * keeps.
   */
  categoryId: string | null;
  /** D2's own proposal, for a caller to render machine-filled or low-confidence. `undefined` before a payee resolves. */
  categoryProposal: CategoryProposal | undefined;
  /** True only while `categoryId` is the proposal's own id, applied without a pick. */
  categoryAutoFilled: boolean;
  /** Esc on the highlighted category chip (M3/P2) — dismisses an applied proposal without discarding the line. */
  undoCategory: () => void;
  /** `create_transaction`'s own refusal, raw — a caller resolves `messageKey` through `useT()` and maps it onto fields; this hook cannot (`architecture/11`: `client` and `ui` are siblings). */
  fieldErrors: readonly FieldError[] | undefined;
  /** Enter — a no-op while `parse` is not `{ ok: true }` (D1's own refusal already says why under the bar). */
  submit: () => void;
  /** Esc — clears the line and any refusal, exactly like starting over. */
  discard: () => void;
};

export function useCommandBar(
  controller: CommandBarController,
  parse: (text: string) => CaptureParse,
  categories: readonly AcceptProposedCategoryCandidate[],
): CommandBarState {
  const [text, setTextState] = useState("");
  const [fieldErrors, setFieldErrors] = useState<readonly FieldError[] | undefined>(undefined);
  // H1/M3 — the phone's own `categoryProposalDismissed`, moved here: Esc on
  // a highlighted proposal is this bar's Undo (§8's P2), and the same reset
  // rule holds — a *different* payee earns its own proposal a fresh chance
  // rather than inheriting a dismissal that was never about it.
  const [categoryProposalDismissed, setCategoryProposalDismissed] = useState(false);

  const setText = useCallback((next: string) => {
    setTextState(next);
    // A fresh keystroke retires the previous attempt's refusal — B1's own
    // rule (`field-errors.ts`) is that a refusal answers the line it was
    // typed against, never the next one.
    setFieldErrors(undefined);
  }, []);

  const parsed = useMemo(() => (text.trim() === "" ? null : parse(text)), [parse, text]);

  const payee = parsed?.ok === true ? parsed.payee : "";
  // `fold` is idempotent (`names.ts`) — memoised on the folded payee, not the
  // raw one, the same reason `quick-add-screen.tsx` keys its own proposal off
  // `payeeFold`: a keystroke `fold` collapses away must not re-run the
  // replica read behind `listPayeeHistory()`.
  const payeeFold = useMemo(() => fold(payee), [payee]);
  const categoryProposal = useMemo(() => {
    if (parsed?.ok !== true || payeeFold.trim() === "") return undefined;
    return proposeCategory(payeeFold, controller.listPayeeHistory()) ?? undefined;
  }, [controller, parsed, payeeFold]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: payeeFold is the trigger; the effect body reads no value from it.
  useEffect(() => {
    setCategoryProposalDismissed(false);
  }, [payeeFold]);

  const categoryAutoFilled =
    parsed?.ok === true &&
    parsed.categoryId === null &&
    !categoryProposalDismissed &&
    acceptProposedCategory(categoryProposal, categories, "expense");
  const categoryId =
    parsed?.ok === true
      ? (parsed.categoryId ?? (categoryAutoFilled ? (categoryProposal?.categoryId ?? null) : null))
      : null;

  const undoCategory = useCallback(() => setCategoryProposalDismissed(true), []);

  const discard = useCallback(() => {
    setTextState("");
    setFieldErrors(undefined);
  }, []);

  const submit = useCallback(() => {
    if (parsed?.ok !== true) return;
    const draft: CommandBarDraft = {
      type: "expense",
      amount: parsed.amount,
      accountId: parsed.accountId,
      categoryId,
      payee: parsed.payee,
      date: parsed.date,
      note: "",
      isBusiness: false,
      counterpartyId: null,
      counterpartyRole: null,
    };
    const result = controller.createTransaction(draft);
    if ("fieldErrors" in result) {
      setFieldErrors(result.fieldErrors);
      return;
    }
    setFieldErrors(undefined);
    // A save clears the bar — the next line starts from nothing, the same as
    // pressing Enter on a real form (`screens/S05-quick-add.md` §3's "one
    // line, one Enter").
    setTextState("");
  }, [categoryId, controller, parsed]);

  return {
    text,
    setText,
    parse: parsed,
    categoryId,
    categoryProposal,
    categoryAutoFilled,
    undoCategory,
    fieldErrors,
    submit,
    discard,
  };
}
