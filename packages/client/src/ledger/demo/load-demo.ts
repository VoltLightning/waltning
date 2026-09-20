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

import { accountingDate, addDays } from "@waltning/core/date";
import type { FieldError } from "../../transport/field-errors/field-errors.ts";
import type {
  ConvertCategoryDraft,
  CreateAccountDraft,
  CreateCategoryDraft,
  QuickAddDraft,
} from "../create-phone-ledger/create-phone-ledger.ts";
import {
  DEMO_ACCOUNTS,
  DEMO_CATEGORIES,
  DEMO_MONTHS,
  demoRates,
  demoSpan,
  demoTransactions,
} from "./demo-plan.ts";

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
  /**
   * A rate for a currency the ledger does not keep its books in.
   *
   * Returns a count rather than an id, so it does not go through `accepted`.
   */
  setManualRate: (draft: {
    base: string;
    quote: string;
    from: string;
    to: string;
    rate: string;
    today: string;
  }) => { written: number } | { fieldErrors: readonly FieldError[] };
  /** What the device already has, so nothing is created twice. */
  existingCategories: readonly { id: string; name: string }[];
  /**
   * **The currency this ledger actually keeps its books in.**
   *
   * Read from the device, never assumed. `set_manual_rate` refuses any base
   * that is not the pivot, and a phone that has never synced bootstraps
   * `currencies.ts`'s default — which is USD, not the PLN the plan was written
   * around. Every rate was refused for it, and the six refusals surfaced as
   * 532 transactions declined for `needsRate`.
   */
  pivot: string;
};

export type DemoOutcome = {
  /** Rate rows written, one per day per pair. */
  rates: number;
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

/**
 * The span, cut into ranges `set_manual_rate` will accept.
 *
 * **One shorter than the cap**, not equal to it: the range is inclusive at
 * both ends, so a `from`/`to` exactly 366 days apart is 367 days of rows. The
 * off-by-one is the kind that passes every test written against a span under a
 * year and fails only on the ledger nobody generated until later.
 *
 * Exported so the arithmetic can be checked without a device.
 */
export function rateWindows(from: string, to: string): readonly { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  let start = from;
  while (start <= to) {
    // `demoSpan` hands back plain strings; the brand is checked here rather
    // than assumed, so a malformed span throws where it is written instead of
    // producing windows nobody can explain.
    const end: string = addDays(accountingDate(start), MAX_RATE_WINDOW_DAYS - 1);
    const stop = end > to ? to : end;
    out.push({ from: start, to: stop });
    if (stop >= to) break;
    start = addDays(accountingDate(stop), 1);
  }
  return out;
}

/** L11's own cap, restated where the loader has to respect it. */
const MAX_RATE_WINDOW_DAYS = 366;

export function loadDemo(
  target: DemoTarget,
  today: string,
  months: number = DEMO_MONTHS,
): DemoOutcome {
  const outcome: DemoOutcome = {
    rates: 0,
    accounts: 0,
    categories: 0,
    transactions: 0,
    refused: 0,
  };

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

  // ── rates, before anything that needs valuing ─────────────────────────
  // A currency with no rate is not `capturable` and every transaction in it is
  // declined before the write, so the rates for the whole span go in first and
  // a row two years back values the same way a row from this morning does.
  //
  // **In windows, because `set_manual_rate` caps a range at 366 days** (L11:
  // the operation writes one `manual` row per day, so an unbounded range is an
  // unbounded write). The demo is 26 months. One call for the whole span was
  // refused outright — and the refusal is silent in the only way that matters,
  // because what the reader then sees is not *the rates failed* but **532
  // transactions refused for `needsRate`**, one cause presenting as five
  // hundred unrelated symptoms.
  const span = demoSpan(today, months);
  for (const rate of demoRates(target.pivot)) {
    for (const range of rateWindows(span.from, span.to)) {
      try {
        const result = target.setManualRate({
          base: target.pivot,
          quote: rate.quote,
          from: range.from,
          to: range.to,
          rate: rate.rate,
          today,
        });
        if ("fieldErrors" in result) outcome.refused += 1;
        else outcome.rates += result.written;
      } catch {
        outcome.refused += 1;
      }
    }
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
