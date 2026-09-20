/**
 * Fill a device's ledger with `demo-plan.ts`'s invented data.
 *
 * **Through the controller, not into the replica.** Every account, category
 * and transaction is created by the same method a person's taps call, so the
 * rows that arrive have been through the executors: brand matching, the
 * outbox, and every refusal a real write can make. Writing rows directly
 * would produce data that behaves differently from data you entered, which
 * is the one thing a fixture must not do.
 *
 * **Additive, and it never deletes.** Clearing a ledger is `reset()` — a
 * different button, with a confirmation, that closes the store and deletes
 * both files. A loader that also wiped would make "load" mean two things, and
 * the destructive one would be the one nobody confirmed.
 *
 * **Refusals are counted, not thrown.** A demo that stopped halfway through
 * on one refused row would leave a ledger nobody can reason about. Each
 * refusal is collected and reported, so a run that partly failed says so.
 */

import type { FieldError } from "../../transport/field-errors/field-errors.ts";
import type {
  ConvertCategoryDraft,
  CreateAccountDraft,
  CreateCategoryDraft,
  QuickAddDraft,
} from "../create-phone-ledger/create-phone-ledger.ts";
import { DEMO_ACCOUNTS, DEMO_CATEGORIES, DEMO_MONTHS, demoTransactions } from "./demo-plan.ts";

/**
 * Only what this loader calls.
 *
 * Typed against the controller's own draft types rather than a hand-copied
 * shape: the first version restated the fields and drifted from
 * `QuickAddDraft` on the same day, which is exactly the seam `CLAUDE.md` warns
 * about. A test drives it with three functions and a list.
 */
export type DemoTarget = {
  createAccount: (
    draft: CreateAccountDraft,
  ) => { id: string } | { fieldErrors: readonly FieldError[] };
  createCategory: (
    draft: CreateCategoryDraft,
  ) => { id: string } | { fieldErrors: readonly FieldError[] };
  createTransaction: (
    draft: QuickAddDraft,
  ) => { id: string; deferred?: boolean } | { fieldErrors: readonly FieldError[] };
  /**
   * **The only way to make a group.** `create_category` always writes a leaf
   * — it never sets `isLeaf: false` — so a group is a leaf that has been
   * converted, and hanging a child off an unconverted one is refused by
   * `TAXONOMY.md` R1: a category is a group or a leaf, never both.
   */
  convertCategory: (
    draft: ConvertCategoryDraft,
  ) => { id: string } | { fieldErrors: readonly FieldError[] };
  /** What the device already has, so nothing is created twice. */
  existingCategories: readonly { id: string; name: string }[];
};

export type DemoOutcome = {
  accounts: number;
  categories: number;
  transactions: number;
  /** Rows the executors refused. Zero on a healthy run. */
  refused: number;
};

/**
 * The id a call produced, or `null` for any refusal.
 *
 * **Both channels, because the executors use both.** A controller returns
 * `{ fieldErrors }` for a validation refusal and *throws* `LocalRefusal` for
 * one the replica makes — and the thrown half is what turned a single refused
 * category into an uncaught error and a red box over the whole app. A loader
 * that stops halfway leaves a ledger nobody can reason about, so every call
 * goes through here.
 */
function accepted<T extends { id: string } | { fieldErrors: readonly FieldError[] }>(
  call: () => T,
): string | null {
  try {
    const result = call();
    return "id" in result ? result.id : null;
  } catch {
    return null;
  }
}

export function loadDemo(
  target: DemoTarget,
  today: string,
  months: number = DEMO_MONTHS,
): DemoOutcome {
  const outcome: DemoOutcome = { accounts: 0, categories: 0, transactions: 0, refused: 0 };

  // ── categories ────────────────────────────────────────────────────────
  // Matched by name against what the device already holds, because a device
  // that has synced has the real taxonomy and a second "Groceries" beside it
  // would be the fixture seeding a competing tree.
  const categoryIds = new Map<string, string>();
  for (const existing of target.existingCategories) categoryIds.set(existing.name, existing.id);

  for (const category of DEMO_CATEGORIES) {
    if (categoryIds.has(category.name)) continue;
    const parentId = category.group === null ? null : (categoryIds.get(category.group) ?? null);
    // A leaf whose group was refused would be created at the root, which is
    // the taxonomy drifting rather than a missing row.
    if (category.group !== null && parentId === null) {
      outcome.refused += 1;
      continue;
    }

    const id = accepted(() =>
      target.createCategory({ name: category.name, kind: category.kind, parentId }),
    );
    if (id === null) {
      outcome.refused += 1;
      continue;
    }

    // A group is a converted leaf. Done before its children exist, because
    // the conversion refuses a category that already has any.
    if (category.group === null) {
      if (accepted(() => target.convertCategory({ id, to: "group" })) === null) {
        outcome.refused += 1;
        continue;
      }
    }

    categoryIds.set(category.name, id);
    outcome.categories += 1;
  }

  // ── accounts ──────────────────────────────────────────────────────────
  const accountIds = new Map<string, string>();
  for (const account of DEMO_ACCOUNTS) {
    const id = accepted(() =>
      target.createAccount({
        name: account.name,
        currency: account.currency,
        kind: account.kind,
        ownership: "own",
        isBusiness: false,
        openingBalance: account.openingBalance,
        openingDate: null,
        memo: "",
        groupId: null,
      }),
    );
    if (id === null) {
      outcome.refused += 1;
      continue;
    }
    accountIds.set(account.ref, id);
    outcome.accounts += 1;
  }

  // ── transactions ──────────────────────────────────────────────────────
  for (const row of demoTransactions(today, months)) {
    const accountId = accountIds.get(row.account);
    if (accountId === undefined) {
      outcome.refused += 1;
      continue;
    }
    const id = accepted(() =>
      target.createTransaction({
        type: row.type,
        amount: row.amount,
        accountId,
        categoryId: categoryIds.get(row.category) ?? null,
        date: row.date,
        payee: row.payee,
        note: "",
        isBusiness: false,
        counterpartyId: null,
        counterpartyRole: null,
      }),
    );
    if (id === null) outcome.refused += 1;
    else outcome.transactions += 1;
  }

  return outcome;
}
