/**
 * The inputs both engines validate against.
 *
 * §14.7 is *"two engines, one definition"*: the phone runs SQLite now and a
 * later backend will make Postgres authoritative, so the same write is
 * validated by the device's local executor and eventually by the server's
 * handler. **Two schemas that agree today is not the same property as one
 * schema.** They agree until someone widens a `max()` on one side, and the
 * failure surfaces only after the phone has shown the row as saved.
 *
 * So the schema lives here rather than beside the handler. `packages/ledger`
 * must never import `apps/api` (`tests/architecture.test.ts` enforces the
 * direction), which leaves `core` as the only place both can reach — and
 * `operation.ts` already made this argument for the operation *shape*: the
 * declaration is a contract both sides depend on, and only the handler is the
 * server's business.
 *
 * **What is deliberately not here.** A field derived while materialising a
 * row is not an input, and putting it here would make the capture caller assert
 * it. §14.6's reference-rate rule is the sharpest case and it cost four bugs;
 * every omission below names the executor or later server step that owns the
 * column instead.
 *
 * One file for two operations rather than one per domain: the project's *"no
 * abstraction before the third use"* rule. It splits when a third domain
 * arrives and the file stops being readable in one screen, not before.
 */

import { z } from "zod";
import { type AccountingDate, daysBetween } from "../date.ts";
import type { Id } from "../id.ts";
import { type CurrencyCode, type Decimal, dec, type Money, type TxnType } from "../money.ts";
import {
  zAccountingDate,
  zCurrencyCode,
  zFee,
  zId,
  zMoney,
  zPivotPerUnit,
  zUnitsPerPivot,
} from "../zod.ts";

/* ── the enumerations, restated ──────────────────────────────────────────── */

/**
 * **These are copies of `packages/schema/src/enums.ts`, and the copy is forced.**
 *
 * `packages/schema` imports `@waltning/core` for `money.toMoney`, so core
 * importing schema back is a cycle; and core's dependency floor is decimal.js
 * and zod, asserted as a set in `tests/architecture.test.ts`. There is no
 * import that would work.
 *
 * `TXN_TYPE` is pinned against `core`'s own `TxnType` in `inputs.test.ts` —
 * through the parsed output, so it is the schema that is checked and not a
 * restatement of it. `ACCOUNT_KIND`, `OWNERSHIP`, `TXN_SOURCE` and
 * `COUNTERPARTY_ROLE` have no core-side counterpart to pin against — the real
 * fix is moving the value sets down into `core` and having `schema` import
 * them, which is a change to `packages/schema` and belongs in its own diff.
 */
/** Exported so a `kind` picker can enumerate the same values the input accepts. */
export const ACCOUNT_KIND = [
  "cash",
  "bank",
  "card",
  "loan_receivable",
  "loan_payable",
  "clearing",
  "investment",
  "deposit",
  "other",
] as const;

/** §6.7 — a shared account is ordinary; it just belongs to a different total. */
const OWNERSHIP = ["own", "shared"] as const;

const TXN_TYPE = ["income", "expense", "transfer", "adjustment"] as const;

/** S29 writes migrated rows as `migration`; the receipt and voice paths differ too. */
const TXN_SOURCE = ["manual", "import", "receipt", "agent", "migration"] as const;

/** §6.6 — naming a counterparty is not the same as owing them. */
const COUNTERPARTY_ROLE = ["debt", "contribution", "reference"] as const;

/** §6.6 — a person or a company; `O15`'s ageing applies to companies only. */
const COUNTERPARTY_KIND = ["person", "company"] as const;

/* ── create_account ──────────────────────────────────────────────────────── */

/**
 * `create_account` (`operations.md`, *Accounts* — structural, never auto).
 *
 * **The id is an input, not a return value.** `architecture/08` H13: *"client
 * ids are the identity; names are display."* A phone that mints the id can
 * retry a queued write carrying the same one, so the drain is idempotent by
 * construction rather than by a dedupe heuristic over `name` — which is the
 * thing that would have to decide whether two offline devices meant one
 * account or two.
 */
export const createAccountInput = z
  .object({
    id: zId<"accounts">(),

    name: z.string().trim().min(1).max(120),

    /**
     * Defaulted rather than required, matching the column. Money Manager left
     * `ZTYPE = 0` on all 68 accounts (§6.3), so `other` is the honest value for
     * an account nobody has classified — not a hole to be filled later.
     */
    kind: z.enum(ACCOUNT_KIND).default("other"),

    /**
     * Required, and the reason is a trigger: §6.5 guarantees
     * `transactions.currency = accounts.currency`, which is what makes
     * `computations.md` §2 a plain sum rather than a per-row conversion. An
     * account with no currency has no balance.
     */
    currency: zCurrencyCode,

    /** Optional — `create_group` owns groups, and an ungrouped account is fine. */
    groupId: zId<"accountGroups">().optional(),

    ownership: z.enum(OWNERSHIP).default("own"),

    /**
     * `.prefault`, **not** `.default`, and the difference is the bug.
     *
     * Zod 4's `.default()` short-circuits: the value is handed back untouched
     * when the field is absent, so a raw `"0"` would arrive as `"0"` while
     * every supplied amount arrives as `"0.00000000"` — unbranded, at the wrong
     * scale, from the same field. `.prefault` feeds the default *through*
     * `zMoney`, so the absent case and the present case are the same value.
     */
    openingBalance: zMoney.prefault("0"),

    /** §8.0 — the migration carries balances and their as-of date, not history. */
    openingDate: zAccountingDate.optional(),

    memo: z.string().trim().max(2000).default(""),

    isBusiness: z.boolean().default(false),

    /**
     * §6.5's idempotency key, under a partial unique index. S29 runs the
     * migration repeatedly against a fresher `.mmbak`; without this the second
     * run duplicates all 68 accounts.
     */
    externalId: z.string().trim().min(1).max(200).optional(),

    // Not here, on purpose:
    //   `expected_balance`  — `reconcile_account` writes it against a balance
    //                         you observed (S16 §5). There is no balance to
    //                         reconcile against at creation.
    //   `archived`          — `archive_account`. Creating something already
    //                         archived is not a state anyone wants.
    //   `sort`              — `reorder_accounts`.
    //   `version`, `created_at`, `updated_at` — the row's own bookkeeping.
  })
  /**
   * `accounts_shared_not_business` (§6.5), refused here as well as by the CHECK.
   *
   * The CHECK is the guarantee; this is the *error*. §6.7: shared money is
   * *"never business, never reportable"* — and an offline-eligible write whose
   * payload is guaranteed to fail at drain is the worst version of that, since
   * the phone reports it as saved and the refusal arrives days later with no
   * field to attach it to.
   */
  .refine((a) => a.ownership === "own" || !a.isBusiness, {
    path: ["isBusiness"],
    message: "a shared account is never business — §6.7, accounts_shared_not_business",
  });

export type CreateAccountInput = z.output<typeof createAccountInput>;
export type AccountKind = CreateAccountInput["kind"];

/* ── transaction shape ───────────────────────────────────────────────────── */

/**
 * The fields two `type`-shape CHECKs (§6.5) read: `transactions_transfer_shape`
 * and `transactions_category_shape`. Every column, never a patch — "toAmount
 * is absent" only means something once you know what the *row* is about to
 * read after a write, not what one caller happened to send.
 */
export type TransactionShape = {
  type: TxnType;
  categoryId?: Id<"categories"> | null | undefined;
  toAccountId?: Id<"accounts"> | null | undefined;
  toAmount?: Money | null | undefined;
  toCurrency?: CurrencyCode | null | undefined;
};

export type TransactionShapeIssue = { field: keyof TransactionShape; message: string };

/**
 * M4 — `dec(raw)`, safe for a `raw` that already failed its own `zMoney`
 * regex. `superRefine` still runs even when a sibling field-level check has
 * already failed (Zod does not short-circuit one check on another's issue),
 * so the value a `.superRefine` sees here can still be the malformed raw
 * string a schema's own output type claims cannot exist. `dec()` — `Decimal`'s
 * own constructor — throws on that. `undefined` rather than throwing:
 * a malformed value already has its own issue from the field's regex, so a
 * caller checking `safeDec(raw)?.foo` simply has nothing further to add.
 */
function safeDec(raw: string): Decimal | undefined {
  try {
    return dec(raw);
  } catch {
    return undefined;
  }
}

/**
 * The two `type`-shape CHECKs, checked once and read by both writers.
 *
 * `create_transaction`'s `.superRefine` below and `update_transaction`'s
 * executor (`packages/ledger`) both call this — the first on a whole new
 * row, the second on the row a patch would produce — because a duplicated
 * copy of `transactions_transfer_shape` and `transactions_category_shape` is
 * exactly how a create path and a patch path drift: the create schema was
 * refusing a category on a transfer years before an executor existed that
 * could patch `type`'s partner fields without ever going through it.
 *
 * Returns every violation rather than throwing, so a Zod `.superRefine` can
 * turn each into a field-level issue at the edge, and a SQLite executor —
 * which has no Zod context to add an issue to — can turn the same list into
 * one error naming every offending key.
 */
export function transactionShapeIssues(row: TransactionShape): TransactionShapeIssue[] {
  const issues: TransactionShapeIssue[] = [];
  const isTransfer = row.type === "transfer";
  const present = <T>(v: T | null | undefined): v is T => v !== undefined && v !== null;

  for (const field of ["toAccountId", "toAmount", "toCurrency"] as const) {
    if (present(row[field]) === isTransfer) continue;
    issues.push({
      field,
      message: isTransfer
        ? "a transfer stores both legs — §7.5 stores the destination amount rather than deriving it"
        : "only a transfer has a destination leg (transactions_transfer_shape)",
    });
  }

  if (present(row.categoryId) && row.type !== "income" && row.type !== "expense") {
    issues.push({
      field: "categoryId",
      message: "only income and expense carry a category (transactions_category_shape)",
    });
  }

  return issues;
}

/* ── create_transaction ──────────────────────────────────────────────────── */

/**
 * `create_transaction` — *"the core write. One payment event, one row (§6.10)"*.
 *
 * The operation S05, S07, S08, S31 and S29 all write through, which is why the
 * shape has to carry a transfer's second leg and a migrated row's provenance
 * without becoming four schemas. §6.10: the unit is **the payment**, not the
 * thing bought — a fuel-and-coffee card tap is one row with an optional line
 * breakdown underneath, and the breakdown is `set_transaction_lines`.
 *
 * **No rate is required from the caller, and that is the design.** §14.6: the
 * local executor resolves the replica's provisional `fx_rate`, and a later
 * backend resolves the canonical date-correct value. The destination rate and
 * tax rates are not inferred from a capture hint. Doing that froze valuations
 * that were not re-derivable — most visibly a cross-currency transfer whose
 * destination amount was pre-filled from the cached reference rate, so both
 * legs valued to the same pivot and §7.5's margin came out *identically zero*
 * for every transfer ever recorded, indistinguishable from a fee-free one.
 */
export const createTransactionInput = z
  .object({
    id: zId<"transactions">(),

    /**
     * Required, and **not** defaulted to today. `todayIn` needs a zone
     * (`date.ts`), and this schema has none — C28 is the bug where a capture at
     * 01:00 in Warsaw is dated yesterday, permanently. The caller holds the
     * zone; the contract refuses to guess it.
     */
    date: zAccountingDate,

    type: z.enum(TXN_TYPE),

    accountId: zId<"accounts">(),

    /**
     * Positive, with `adjustment` as the sole exception — §7.2 stores direction
     * in `type`, and `computations.md` §1 records that an adjustment carries its
     * own sign, because reconciling an account *downward* is the ordinary use.
     * Refused below rather than here, so the message can name the type.
     */
    amountOriginal: zMoney,

    /** §7.1 — this *is* the account's currency; the §6.5 trigger enforces it. */
    currency: zCurrencyCode,

    /**
     * Income and expense only (`transactions_category_shape`). A transfer moves
     * money between two of your own accounts and categorising it would double
     * count it against the same spend total.
     */
    categoryId: zId<"categories">().optional(),

    /** §6.6. Paired with the role by `transactions_counterparty_role_shape`. */
    counterpartyId: zId<"counterparties">().optional(),
    counterpartyRole: z.enum(COUNTERPARTY_ROLE).optional(),

    /* The destination leg — a transfer, and only a transfer (§7.5). */
    toAccountId: zId<"accounts">().optional(),
    toAmount: zMoney.optional(),
    toCurrency: zCurrencyCode.optional(),

    /**
     * **Pivot per unit — you multiply by it.** `fx_rates.rate` is the
     * reciprocal, units per pivot, and you divide by that one
     * (`computations.md` §4). Both are called *rate* in prose and the confusion
     * produced a 14.1× error, which is why `PivotPerUnit` and `UnitsPerPivot`
     * are separate brands and `rate.type-test.ts` asserts the swap does not
     * compile.
     *
     * Optional, and present only when you are asserting a rate that actually
     * applied — §7.6 level 1, *"enter the rate your bank actually applied"*,
     * which travels as an explicit agreement rather than as the phone's cache.
     * Absent is the ordinary case and the server resolves it at commit.
     * `fx_rate_estimated` is not an input either way: it is set by whichever
     * side does the valuing — the phone, locally, from `readNearestRate`'s
     * own step (carry-forward vs. reaching past it); the server again at
     * drain, from its own resolution against the row's date — never
     * asserted by the caller.
     */
    fxRate: zPivotPerUnit.optional(),

    /**
     * The **reference** rate for `to_currency`, in the same pivot-per-unit
     * direction (§7.5). Never the realized rate: `to_amount ÷ amount_original`
     * is derived at read time and storing it here collapses the margin to zero.
     */
    toFxRate: zPivotPerUnit.optional(),

    /**
     * The bank's *stated* fee, distinct from the rate margin (§7.5, S31). `FX
     * Cost` reports them as separate lines because a fee is avoidable by
     * choosing another route and a margin is not.
     */
    fee: zFee.optional(),

    payee: z.string().trim().max(200).default(""),
    note: z.string().trim().max(2000).default(""),

    /** §13.1. Gated per-field by the operation's `taxSensitiveFields`, not here. */
    isBusiness: z.boolean().default(false),

    /** §6.8 — a one-off that would otherwise distort every period average. */
    isCapital: z.boolean().default(false),

    /** S29 §5 writes migrated rows with `source = migration`. */
    source: z.enum(TXN_SOURCE).default("manual"),

    /** §6.5's partial unique index — what makes re-running the migration safe. */
    externalId: z.string().trim().min(1).max(200).optional(),

    // Not here, on purpose:
    //   `fx_rate_estimated`     — set by whichever side values the row, never
    //                             asserted by the caller: the phone locally
    //                             (`readNearestRate`'s step 2, carry-forward
    //                             exhausted or nothing held), the server
    //                             again at drain iff no published rate exists
    //                             for that date (§7.6, §14.6).
    //   `recurring_id`, `occurrence_date`
    //                           — `materialize_occurrence` posts one, and
    //                             `link_occurrence` stamps a row you already
    //                             entered by hand. C8's fix is both of those,
    //                             not a field on the ordinary capture path.
    //   `debt_amount`, `debt_currency`
    //                           — `settle_debt`. S14 used to call this
    //                             operation and that was the defect:
    //                             `create_transaction` has no notion of a
    //                             residual and no channel to return one.
    //   `counterparty_tax_id`, `document_ref`, `ksef_id`
    //                           — S22 O2: they exist from day one so opting
    //                             into VAT later is not a migration, and
    //                             nothing writes them yet.
    //   `ryczalt_rate`, `ryczalt_activity`, `tax_fx_*`
    //                           — server-resolved at commit (§14.6, §13.6).
    //   `deleted_at`            — `delete_transaction`, soft (§6.9).
  })
  .superRefine((t, ctx) => {
    /**
     * `transactions_amount_positive`. Stated as *"negative only for
     * adjustment"* rather than as an absolute floor, because the CHECK reads
     * `> 0 or type = 'adjustment'` and a schema that refused every negative
     * would make reconciling an account downward impossible.
     *
     * **H4 — zero is refused too, adjustment excepted.** `money.margin`
     * divides by `amount_pivot`, and a zero `amount_original` on any other
     * type makes that division undefined — an income or expense of nothing
     * is not a payment event (§6.10) and was never a value this column
     * needed to hold.
     */
    // M4 — `safeDec`, not `dec`: `superRefine` still runs even when
    // `amountOriginal` already failed `zMoney`'s own regex, and `dec()`
    // throws on that (see `safeDec`'s own comment, above).
    if (t.type !== "adjustment" && safeDec(t.amountOriginal)?.lte(0) === true) {
      ctx.addIssue({
        code: "custom",
        path: ["amountOriginal"],
        message:
          "amounts are positive and non-zero; `type` carries direction (§7.2) — only an adjustment signs",
      });
    }

    /**
     * The transfer-shape and category-shape CHECKs, read from the one
     * function `update_transaction`'s executor also calls — see
     * `transactionShapeIssues` above for why a shared function rather than a
     * second copy.
     */
    const isTransfer = t.type === "transfer";
    for (const issue of transactionShapeIssues(t)) {
      ctx.addIssue({ code: "custom", path: [issue.field], message: issue.message });
    }

    /** `to_fx_rate` follows the destination leg it values, when it is supplied. */
    if (!isTransfer && t.toFxRate !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["toFxRate"],
        message: "only a transfer has a destination leg to value (transactions_to_fx_rate_shape)",
      });
    }

    /**
     * `transactions_transfer_distinct`. S31 §6 refuses this *inline* — the
     * mistake is a mis-tap on the second picker and the field it belongs to is
     * on screen.
     */
    if (t.toAccountId !== undefined && t.toAccountId === t.accountId) {
      ctx.addIssue({
        code: "custom",
        path: ["toAccountId"],
        message: "a transfer needs two different accounts (transactions_transfer_distinct)",
      });
    }

    // H3 — `<= 0`, not `< 0`: a zero destination amount is a transfer that
    // moves nothing into the other leg, refused the same as a negative one
    // (transactions_to_amount_positive, now `> 0`).
    // M4 — `safeDec`, the same guard `amountOriginal` above needs: `superRefine`
    // still runs even when `toAmount` already failed `zMoney`'s own regex, and
    // `dec()` throws on that (see `safeDec`'s own comment, above).
    if (t.toAmount !== undefined && safeDec(t.toAmount)?.lte(0) === true) {
      ctx.addIssue({
        code: "custom",
        path: ["toAmount"],
        message: "the destination amount is positive (transactions_to_amount_positive)",
      });
    }

    // H3 — a negative fee used to store: `zMoney` alone accepts any sign.
    // Zero is never sent here (the screen drops a typed `0` to "no fee"
    // before this is reached), so `<= 0` reads the same as `< 0` in practice
    // — stated as `<= 0` anyway to match `transactions_fee_positive`'s own
    // `fee > 0` exactly, rather than a looser contract the CHECK still
    // refuses.
    if (t.fee !== undefined && dec(t.fee).lte(0)) {
      ctx.addIssue({
        code: "custom",
        path: ["fee"],
        message: "a stated fee is positive (transactions_fee_positive)",
      });
    }

    // `transactions_category_shape` is one of the issues `transactionShapeIssues`
    // already added above. TAXONOMY R1 lives on the leaf check, not here.

    /**
     * `transactions_counterparty_role_shape` — *"a counterparty reference must
     * say what it means, and a role without a counterparty is meaningless"*.
     * The role is what decides whether the row reaches `counterparty_balances`
     * at all (§6.6), so leaving it unsaid is not a smaller claim.
     */
    if ((t.counterpartyId !== undefined) !== (t.counterpartyRole !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: [t.counterpartyId === undefined ? "counterpartyId" : "counterpartyRole"],
        message: "a counterparty and its role travel together (§6.6)",
      });
    }
  });

export type CreateTransactionInput = z.output<typeof createTransactionInput>;

/* ══════════════════════════════════════════════════════════════════════════
 * A3 · accounts and groups — appended in its own block so a rebase against
 * A2's own append (`update_transaction` et al.) is a trivial merge. Nothing
 * above this line is A3's; nothing below is A2's.
 * ════════════════════════════════════════════════════════════════════════ */

/* ── accounts and groups ─────────────────────────────────────────────────── */

/**
 * `update_account` — S16 §5/§7, a patch with a version and nothing else.
 *
 * **`currency` is deliberately absent.** S16 §7: changing an account's
 * currency with transactions present is refused, and with none present it is
 * create-then-archive, not an edit — there is no in-place path for this field
 * to travel through.
 *
 * `openingBalance`/`openingDate` **are** patchable — S16 §5 says editing one is
 * *"an audited write with a confirm"*, not a forbidden one. The confirm is the
 * screen's; this is the write it confirms.
 */
const accountPatch = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    kind: z.enum(ACCOUNT_KIND).optional(),
    groupId: zId<"accountGroups">().nullable().optional(),
    ownership: z.enum(OWNERSHIP).optional(),
    memo: z.string().trim().max(2000).optional(),
    isBusiness: z.boolean().optional(),
    openingBalance: zMoney.optional(),
    openingDate: zAccountingDate.nullable().optional(),
  })
  .strict();

export const updateAccountInput = z
  .object({
    id: zId<"accounts">(),
    version: z.number().int().positive(),
    patch: accountPatch,
  })
  .refine((v) => Object.keys(v.patch).length > 0, {
    message: "a patch must set at least one field",
    path: ["patch"],
  });
export type UpdateAccountInput = z.output<typeof updateAccountInput>;

/** `archive_account` — structural, `operations.md` *Accounts*. Never deletes (§6.9). */
export const archiveAccountInput = z.object({
  id: zId<"accounts">(),
  version: z.number().int().positive(),
});
export type ArchiveAccountInput = z.output<typeof archiveAccountInput>;

/**
 * `reorder_accounts` — the whole ordered list; `sort` becomes each id's
 * index. A repeated id is refused rather than silently ties every duplicate
 * on one `sort` value — the executor writes `sort = index` per id in the
 * list, so two entries for the same account would leave it wherever the
 * later write landed and say nothing about why.
 */
export const reorderAccountsInput = z
  .object({ ids: z.array(zId<"accounts">()).min(1) })
  .refine((v) => new Set(v.ids).size === v.ids.length, {
    message: "ids must be unique",
    path: ["ids"],
  });
export type ReorderAccountsInput = z.output<typeof reorderAccountsInput>;

/**
 * `create_group` — S16 §5, *"nothing in the specification created a group"*
 * until now. `id` is client-minted, matching `create_account` (H13).
 */
export const createGroupInput = z.object({
  id: zId<"accountGroups">(),
  name: z.string().trim().min(1).max(120),
  institution: z.string().trim().max(120).nullable().default(null),
});
export type CreateGroupInput = z.output<typeof createGroupInput>;

/**
 * `update_group` — sets `institution`, which `FX Cost` (`computations.md`
 * §12) totals by. No version column on `account_groups`; there is nothing on
 * the row two devices could race over that a plain update does not already
 * resolve last-write-wins.
 */
export const updateGroupInput = z
  .object({
    id: zId<"accountGroups">(),
    patch: z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        institution: z.string().trim().max(120).nullable().optional(),
      })
      .strict(),
  })
  .refine((v) => Object.keys(v.patch).length > 0, {
    message: "a patch must set at least one field",
    path: ["patch"],
  });
export type UpdateGroupInput = z.output<typeof updateGroupInput>;

/** Same shape and the same duplicate refusal as `reorderAccountsInput`, over `account_groups`. */
export const reorderGroupsInput = z
  .object({ ids: z.array(zId<"accountGroups">()).min(1) })
  .refine((v) => new Set(v.ids).size === v.ids.length, {
    message: "ids must be unique",
    path: ["ids"],
  });
export type ReorderGroupsInput = z.output<typeof reorderGroupsInput>;

/**
 * `archive_group` — S16 §5. Flips `account_groups.archived`, same shape as
 * `archive_account` (§6.9: reference data is archived, never deleted). No
 * `version` here — `account_groups` carries no version column, matching
 * `updateGroupInput`.
 */
export const archiveGroupInput = z.object({ id: zId<"accountGroups">() });
export type ArchiveGroupInput = z.output<typeof archiveGroupInput>;

/**
 * `reconcile_account` — S16 §5, *"I counted, and it says this."*
 *
 * The observed balance and the date it was observed; the executor computes
 * the difference against §2 and writes one `adjustment`. `note` is the
 * reason; `categoryId` defaults to Uncategorized on the server — here it is
 * optional and the executor leaves it unset when absent, which reads as
 * uncategorised in every list, same as any other transaction.
 */
export const reconcileAccountInput = z.object({
  accountId: zId<"accounts">(),
  adjustmentId: zId<"transactions">(),
  observedBalance: zMoney,
  asOf: zAccountingDate,
  note: z.string().trim().max(2000).default(""),
  categoryId: zId<"categories">().optional(),
});
export type ReconcileAccountInput = z.output<typeof reconcileAccountInput>;

/* ── categories ───────────────────────────────────────────────────────────── */

/**
 * Restated from `packages/schema/src/enums.ts` — core cannot import schema
 * (see the note above `ACCOUNT_KIND`). `CATEGORY_KIND` has no core-side brand
 * to pin it against, the same gap that note records for `ACCOUNT_KIND` itself.
 */
const CATEGORY_KIND = ["income", "expense"] as const;

/**
 * `create_category` — `operations.md`: *"the agent proposes; it never creates
 * silently"* (§11.5). This schema is the write either a person or an accepted
 * proposal ends up calling; the gate that keeps the agent from calling it
 * directly lives in the registry operation, not here.
 */
export const createCategoryInput = z.object({
  id: zId<"categories">(),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(CATEGORY_KIND),
  parentId: zId<"categories">().nullable().default(null),
  isEarnings: z.boolean().default(false),
  icon: z.string().trim().max(64).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
});
export type CreateCategoryInput = z.output<typeof createCategoryInput>;
export type CategoryKind = CreateCategoryInput["kind"];

/** `rename_category` — J12: names are not identifiers, and renaming propagates. */
export const renameCategoryInput = z.object({
  id: zId<"categories">(),
  version: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
});
export type RenameCategoryInput = z.output<typeof renameCategoryInput>;

/** `reparent_category` — J12: refused across `kind`, refused into a cycle. */
export const reparentCategoryInput = z.object({
  id: zId<"categories">(),
  version: z.number().int().positive(),
  parentId: zId<"categories">().nullable(),
});
export type ReparentCategoryInput = z.output<typeof reparentCategoryInput>;

/** `convert_leaf_group` — leaf⇄group, refused where it would strand a row. */
export const convertLeafGroupInput = z.object({
  id: zId<"categories">(),
  version: z.number().int().positive(),
  to: z.enum(["leaf", "group"]),
});
export type ConvertLeafGroupInput = z.output<typeof convertLeafGroupInput>;

/**
 * `merge_categories` — J12: *"not reversible in one step"*. Every transaction
 * and line on `loserId` moves to `winnerId`, then `loserId` is archived.
 */
export const mergeCategoriesInput = z
  .object({ loserId: zId<"categories">(), winnerId: zId<"categories">() })
  .refine((v) => v.loserId !== v.winnerId, {
    message: "a category cannot merge into itself",
    path: ["winnerId"],
  });
export type MergeCategoriesInput = z.output<typeof mergeCategoriesInput>;

/** `archive_category` — `TAXONOMY.md` R2: a leaf with history keeps it and stops being offerable. */
export const archiveCategoryInput = z.object({
  id: zId<"categories">(),
  version: z.number().int().positive(),
});
export type ArchiveCategoryInput = z.output<typeof archiveCategoryInput>;

/* ════════════════════════════════════════════════════════════════════════
 * A2 · transaction operations — the phone half
 *
 * `update_transaction`, `delete_transaction`, `set_transaction_lines`,
 * `supersede_transaction`, `categorize_batch`. `attach_receipt` is not here:
 * a receipt is an object in MinIO the phone never holds, so the operation has
 * no local executor and no local input.
 * ════════════════════════════════════════════════════════════════════════ */

/* ── update_transaction ─────────────────────────────────────────────────── */

/**
 * **A patch, not a row.** `architecture/14` §14.2: a write carries the version
 * it last read and only the fields it sets. Everything in `patch` is optional;
 * an empty patch is refused because a write that changes nothing is a bug
 * wearing a no-op. The fields that are *not* here are deliberate: `id`,
 * `version`, `source`, `createdAt` are never patched, and `type` changes are
 * a supersede, not an edit.
 */
const transactionPatch = z
  .object({
    date: zAccountingDate.optional(),
    accountId: zId<"accounts">().optional(),
    amountOriginal: zMoney.optional(),
    categoryId: zId<"categories">().nullable().optional(),
    counterpartyId: zId<"counterparties">().nullable().optional(),
    counterpartyRole: z.enum(COUNTERPARTY_ROLE).nullable().optional(),
    toAccountId: zId<"accounts">().nullable().optional(),
    toAmount: zMoney.nullable().optional(),
    toCurrency: zCurrencyCode.nullable().optional(),
    fxRate: zPivotPerUnit.optional(),
    toFxRate: zPivotPerUnit.nullable().optional(),
    fee: zFee.nullable().optional(),
    payee: z.string().trim().max(200).optional(),
    note: z.string().trim().max(2000).optional(),
    isBusiness: z.boolean().optional(),
    isCapital: z.boolean().optional(),
  })
  .strict();

export const updateTransactionInput = z
  .object({
    id: zId<"transactions">(),
    version: z.number().int().positive(),
    patch: transactionPatch,
  })
  .refine((v) => Object.keys(v.patch).length > 0, {
    message: "a patch must set at least one field",
    path: ["patch"],
  })
  .superRefine((v, ctx) => {
    // M2 — the same `> 0` refine `create_transaction` carries: a patch that
    // sets `to_amount` follows `transactions_to_amount_positive` too, not
    // only a fresh row. `null` clears the field and is never a violation.
    if (
      v.patch.toAmount !== undefined &&
      v.patch.toAmount !== null &&
      dec(v.patch.toAmount).lte(0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["patch", "toAmount"],
        message: "the destination amount is positive (transactions_to_amount_positive)",
      });
    }
    // H3 — same for `fee`: `transactions_fee_positive` binds a patched row
    // exactly as it binds a fresh one.
    if (v.patch.fee !== undefined && v.patch.fee !== null && dec(v.patch.fee).lte(0)) {
      ctx.addIssue({
        code: "custom",
        path: ["patch", "fee"],
        message: "a stated fee is positive (transactions_fee_positive)",
      });
    }
  });
export type UpdateTransactionInput = z.output<typeof updateTransactionInput>;

/* ── delete_transaction ─────────────────────────────────────────────────── */

/** Soft, always. `operations.md`: deletion is the one thing you cannot un-notice. */
export const deleteTransactionInput = z.object({
  id: zId<"transactions">(),
  version: z.number().int().positive(),
});
export type DeleteTransactionInput = z.output<typeof deleteTransactionInput>;

/* ── set_transaction_lines ──────────────────────────────────────────────── */

const transactionLine = z.object({
  id: zId<"transactionLines">(),
  description: z.string().trim().min(1).max(200),
  amount: zMoney,
  quantity: z
    .string()
    .regex(/^\d+(\.\d{1,3})?$/)
    .optional(),
  categoryId: zId<"categories">().optional(),
});

/**
 * The optional breakdown (§10.3). The whole set replaces the old one — a
 * line-by-line patch would need a merge rule nobody can state. The sum of
 * line amounts equalling the transaction is enforced in the executor, where
 * the transaction's amount is known.
 */
export const setTransactionLinesInput = z.object({
  transactionId: zId<"transactions">(),
  version: z.number().int().positive(),
  lines: z.array(transactionLine).max(200),
});
export type SetTransactionLinesInput = z.output<typeof setTransactionLinesInput>;

/* ── supersede_transaction ──────────────────────────────────────────────── */

/**
 * An import row replaces a manual entry (S02). The replacement is a full
 * `create_transaction` input; the old row is soft-deleted and the new one
 * records which it superseded. The receipt reattachment `operations.md`
 * mentions is server-side.
 */
export const supersedeTransactionInput = z
  .object({
    supersedesId: zId<"transactions">(),
    supersedesVersion: z.number().int().positive(),
    replacement: createTransactionInput,
  })
  /**
   * The replacement is a new row. Allowing `replacement.id === supersedesId`
   * would have the executor soft-delete a row and then upsert onto that same
   * id — `insertTransaction`'s upsert never touches `deleted_at`, so the
   * "replacement" would land already deleted, an outcome nothing downstream
   * of this schema expects.
   */
  .refine((v) => v.replacement.id !== v.supersedesId, {
    path: ["replacement", "id"],
    message: "the replacement must be a different row from the one it supersedes",
  });
export type SupersedeTransactionInput = z.output<typeof supersedeTransactionInput>;

/* ── categorize_batch ───────────────────────────────────────────────────── */

/** The bulk path. One category over many ids; a `DiffCard` states the count. */
export const categorizeBatchInput = z.object({
  transactionIds: z
    .array(zId<"transactions">())
    .min(1)
    .max(5000)
    /**
     * **Deduped, not refused.** A batch built by merging two selections, or
     * a multi-select that double-registers a tap, names the same id twice
     * with no different intent behind it — the same "twice is once"
     * idempotency an executor's own upsert already gives a replayed entry
     * (`create-account.executor.ts`). A `.refine` that rejected duplicates
     * would make a harmless batch fail for a reason nobody watching the
     * screen could see; deduping here means the executor's affected-row
     * count — one row per distinct id — is never compared against an
     * inflated total.
     */
    .transform((ids) => Array.from(new Set(ids))),
  categoryId: zId<"categories">(),
});
export type CategorizeBatchInput = z.output<typeof categorizeBatchInput>;

/* ════════════════════════════════════════════════════════════════════════
 * end A2 block
 * ════════════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════════════
 * E3 · FX — §4/§4a figures, rates on the replica, the seven local operations
 *
 * `add_currency` `archive_currency` `set_rate_source` `set_pinned`
 * `change_pivot` `set_manual_rate` `clear_manual_rate`. `sync_fx_rates`,
 * `force_sync` and `backfill_fx_rates` are not here — they fetch from a
 * central bank, and arc 2's sync brings them to the phone
 * (`2026-09-04-wave-4-shared.md`).
 * ════════════════════════════════════════════════════════════════════════ */

/* ── FX ───────────────────────────────────────────────────────────────────── */

/**
 * Restated from `packages/schema/src/enums.ts` — core cannot import schema
 * (see the note above `ACCOUNT_KIND`). `FX_SOURCE` has no core-side brand to
 * pin it against, the same gap that note records for `ACCOUNT_KIND` itself.
 */
const FX_SOURCE = ["nbp", "ecb", "nbrb", "nbg", "manual", "carried_forward"] as const;

/**
 * `add_currency` — §7.0 *"Add a currency"*. `id`-less: a currency's identity
 * is its ISO code, not a client-minted uuid, so the executor's `mints`
 * returns the code itself rather than a fresh id.
 *
 * **Refuses an existing code, archived or not.** §7.0: archiving hides a
 * currency from pickers without deleting its history — creating a second row
 * for the same code would fork that history rather than restore it, so the
 * executor's refusal for the archived case names un-archiving as the fix
 * even though no `unarchive_currency` operation exists yet in this arc (a
 * gap named rather than filled silently, matching the project's own rule for
 * one).
 */
export const addCurrencyInput = z.object({
  code: zCurrencyCode,
  name: z.string().trim().min(1).max(120),
  symbol: z.string().trim().max(8).default(""),
  symbolPosition: z.enum(["P", "S"]).default("P"),
  decimals: z.number().int().min(0).max(8).default(2),
  rateSource: z.enum(FX_SOURCE).nullable().default(null),
  pinned: z.boolean().default(false),
});
export type AddCurrencyInput = z.output<typeof addCurrencyInput>;

/**
 * `archive_currency` — S17 §6 *Gated*. Refused by the executor for the pivot
 * and for any currency a live account or transaction still references; SQLite
 * has no cross-table trigger in the replica's DDL, so that guarantee is the
 * executor's alone here and the server-side trigger is its mirror, not its
 * replacement.
 */
export const archiveCurrencyInput = z.object({
  code: zCurrencyCode,
  version: z.number().int().positive(),
});
export type ArchiveCurrencyInput = z.output<typeof archiveCurrencyInput>;

/** `set_rate_source` — §7.7, per-currency provider selection. */
export const setRateSourceInput = z.object({
  code: zCurrencyCode,
  version: z.number().int().positive(),
  rateSource: z.enum(FX_SOURCE).nullable(),
});
export type SetRateSourceInput = z.output<typeof setRateSourceInput>;

/** `set_pinned` — §7.0, which currencies appear in the header toggle. */
export const setPinnedInput = z.object({
  code: zCurrencyCode,
  version: z.number().int().positive(),
  pinned: z.boolean(),
});
export type SetPinnedInput = z.output<typeof setPinnedInput>;

/**
 * `change_pivot` — §7.0 *"genuinely rare, and the one heavy operation
 * left"*. **Refused by the executor while any transaction exists**: a phone
 * alone has no mechanism to re-rate history the way a backend's backfill
 * would, so this is the first-run step (S29a) or nothing. No `version` —
 * the refusal is on the ledger's *shape* (whether a transaction exists at
 * all), not on this row's own conflict token.
 */
export const changePivotInput = z.object({ code: zCurrencyCode });
export type ChangePivotInput = z.output<typeof changePivotInput>;

/**
 * The two rate-range operations share a range check: the destination is
 * never before the source, matching `updated_at`-style ordering everywhere
 * else in the registry.
 */
const rateRange = { from: zAccountingDate, to: zAccountingDate };
const rateRangeOrdered = <T extends { from: string; to: string }>(v: T) => v.from <= v.to;
const RATE_RANGE_ISSUE = {
  message: "the range must not end before it starts",
  path: ["to"],
};

/** L11 — a manual rate range caps at a year (366, leap-inclusive): unbounded, one `manual` row per day writes as many rows as the range is long. */
const MAX_MANUAL_RATE_RANGE_DAYS = 366;
const manualRateRangeWithinCap = (v: { from: AccountingDate; to: AccountingDate }) =>
  daysBetween(v.from, v.to) + 1 <= MAX_MANUAL_RATE_RANGE_DAYS;
const MANUAL_RATE_RANGE_ISSUE = {
  message: `a manual rate range cannot exceed ${MAX_MANUAL_RATE_RANGE_DAYS} days`,
  path: ["to"],
};

/**
 * `set_manual_rate` — §7.6 level 2, *"correct a bad or missing provider
 * figure… a range writes one `manual` row per day across it"*. `base` must
 * be the ledger's pivot currency — checked in the executor, which is the
 * only place that knows which currency that is; every rate is quoted
 * `(base = pivot, quote = X)` and there is no other shape to write.
 *
 * `overwriteManual` carries the screen's second confirmation (S18 §8) as
 * data: the input is the answer to *"replace the existing manual entry?"*,
 * not a prompt this schema could ask on its own.
 *
 * **H1 — `today` is the caller's, same reason `createTransactionInput.date`
 * is required rather than defaulted.** This schema has no zone of its own
 * (`date.ts`), so it cannot compute "today" itself; the caller holds the
 * device date and passes it, and `to <= today` is checked against exactly
 * that value rather than a server clock a phone-only write has no access to.
 */
export const setManualRateInput = z
  .object({
    base: zCurrencyCode,
    quote: zCurrencyCode,
    ...rateRange,
    rate: zUnitsPerPivot,
    overwriteManual: z.boolean().default(false),
    today: zAccountingDate,
  })
  .refine((v) => v.base !== v.quote, {
    message: "a rate needs two different currencies",
    path: ["quote"],
  })
  .refine(rateRangeOrdered, RATE_RANGE_ISSUE)
  .refine(manualRateRangeWithinCap, MANUAL_RATE_RANGE_ISSUE)
  .refine((v) => v.to <= v.today, {
    message: "a manual rate cannot be set for a date that has not happened yet",
    path: ["to"],
  });
export type SetManualRateInput = z.output<typeof setManualRateInput>;

/** `clear_manual_rate` — §7.6's undo: deletes `manual` rows only, never a synced one. */
export const clearManualRateInput = z
  .object({ base: zCurrencyCode, quote: zCurrencyCode, ...rateRange })
  .refine(rateRangeOrdered, RATE_RANGE_ISSUE);
export type ClearManualRateInput = z.output<typeof clearManualRateInput>;

/**
 * `update_currency` — S17 §9.2: cosmetic fields only. `symbol`,
 * `symbolPosition`, `decimals` are how a figure in this currency renders
 * (`<Amount>`'s own affix and decimal places) and nothing else references
 * them — never `code`, never `rateSource`/`pinned`/`isPivot`, each of which
 * already has its own named operation (`set_rate_source`, `set_pinned`,
 * `change_pivot`) precisely because each carries a guarantee this patch does
 * not: a rate source changes what a sync fetches, a pivot changes what every
 * `fx_rates` row is quoted against. Compare-and-swap on `version`, matching
 * every other structural currency write.
 */
const currencyPatch = z
  .object({
    symbol: z.string().trim().max(8).optional(),
    symbolPosition: z.enum(["P", "S"]).optional(),
    decimals: z.number().int().min(0).max(8).optional(),
  })
  .strict();

export const updateCurrencyInput = z
  .object({
    code: zCurrencyCode,
    version: z.number().int().positive(),
    patch: currencyPatch,
  })
  .refine((v) => Object.keys(v.patch).length > 0, {
    message: "a patch must set at least one field",
    path: ["patch"],
  });
export type UpdateCurrencyInput = z.output<typeof updateCurrencyInput>;

/* ════════════════════════════════════════════════════════════════════════
 * end E3 block
 * E2 · counterparties and settlement — its own block for the same reason
 * A3's own append is: a rebase against A2's or A3's append stays a
 * line-level merge rather than a symbol-level one.
 * ════════════════════════════════════════════════════════════════════════ */

/* ── counterparties and settlement ───────────────────────────────────────── */

/**
 * `create_counterparty` — §6.6: *"counterparties become first-class
 * entities."* Auto-eligible (`operations.md`), unlike every structural
 * account/category op — naming a person carries no guarantee to break.
 */
export const createCounterpartyInput = z.object({
  id: zId<"counterparties">(),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(COUNTERPARTY_KIND).default("person"),
  /** Their preference, not a system concept (§6.6 cross-currency debt). */
  settlementCurrency: zCurrencyCode.nullable().default(null),
  contact: z.string().trim().max(200).nullable().default(null),
  note: z.string().trim().max(2000).default(""),
});
export type CreateCounterpartyInput = z.output<typeof createCounterpartyInput>;
export type CounterpartyKind = CreateCounterpartyInput["kind"];

/**
 * `update_counterparty` — a patch with a version, same shape as
 * `updateGroupInput`.
 *
 * **`archived` lives on this patch, not a separate operation.**
 * `operations.md`'s counterparties row lists no `archive_counterparty` —
 * unlike an account or a category, archiving one is an ordinary field flip
 * the executor gates (S15 §6: refused while any §7 balance is open), not a
 * structural op of its own.
 */
const counterpartyPatch = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    kind: z.enum(COUNTERPARTY_KIND).optional(),
    settlementCurrency: zCurrencyCode.nullable().optional(),
    contact: z.string().trim().max(200).nullable().optional(),
    note: z.string().trim().max(2000).optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export const updateCounterpartyInput = z
  .object({
    id: zId<"counterparties">(),
    version: z.number().int().positive(),
    patch: counterpartyPatch,
  })
  // R2 L1 — `Object.keys` counts a key that is *present* with value
  // `undefined` (e.g. `{ name: undefined }`, which a caller can construct by
  // spreading an unset draft field), so a patch that sets nothing still
  // passed. Every value must be something other than `undefined`.
  .refine((v) => Object.values(v.patch).some((value) => value !== undefined), {
    message: "a patch must set at least one field",
    path: ["patch"],
  });
export type UpdateCounterpartyInput = z.output<typeof updateCounterpartyInput>;

/**
 * `merge_counterparties` — S15 §9.2. `mergeId` is client-minted (H13), the
 * same reason `create_account`'s `id` is: the id this write mints (the merge
 * record) travels with the queued entry, not a value the server hands back.
 *
 * **`movedTransactionIds` travels on the payload, always (`operations.md`
 * line 130: this is what makes unmerge exact rather than a re-derivation),
 * computed by the controller from the replica it can see at the moment of
 * the merge, rather than recomputed by the executor at apply time** — the
 * same reason `settleDebtInput` never supplies a residual: the set of live
 * transactions naming `loserId` can change between the screen reading it and
 * the write landing (another device's own write, or the phone's own outbox
 * draining out of order), and an executor that ever re-derives "everything
 * currently pointing at the loser" moves a different set than the person
 * saw, or moves something a concurrent write already reassigned.
 * `create-phone-ledger.ts`'s `mergeCounterparties` action pages through
 * `searchTransactions` and supplies exactly this.
 *
 * **Required, not optional (#116 review, M1).** A prior shape let this be
 * omitted "for a fixture with no pre-read to name", which quietly gave the
 * executor licence to fall back to deriving the moved set itself — the
 * *"the recorded ids are what makes unmerge exact"* guarantee has no
 * fallback to fall back to. A fixture now seeds the ids it created before
 * merging them, the same discipline any other caller carries.
 */
export const mergeCounterpartiesInput = z
  .object({
    mergeId: zId<"counterpartyMerges">(),
    winnerId: zId<"counterparties">(),
    loserId: zId<"counterparties">(),
    movedTransactionIds: z.array(zId<"transactions">()),
  })
  .refine((v) => v.winnerId !== v.loserId, {
    message: "a counterparty cannot merge into itself",
    path: ["loserId"],
  });
export type MergeCounterpartiesInput = z.output<typeof mergeCounterpartiesInput>;

/** `unmerge_counterparties` — S15 §9.2, reversing exactly the record named. */
export const unmergeCounterpartiesInput = z.object({
  mergeId: zId<"counterpartyMerges">(),
});
export type UnmergeCounterpartiesInput = z.output<typeof unmergeCounterpartiesInput>;

/**
 * `record_distinct_counterparties` — S15 §9.1's *these are different*
 * decision. Auto-eligible: it records a person's judgement, not a structural
 * change. Unordered here; the executor normalises `a < b` before it writes
 * (`counterparty_distinct_pairs_ordered`).
 */
export const recordDistinctCounterpartiesInput = z
  .object({
    aId: zId<"counterparties">(),
    bId: zId<"counterparties">(),
  })
  .refine((v) => v.aId !== v.bId, {
    message: "a counterparty is not distinct from itself",
    path: ["bId"],
  });
export type RecordDistinctCounterpartiesInput = z.output<typeof recordDistinctCounterpartiesInput>;

/**
 * `settle_debt` — H9's whole resolution. Takes **the amount that changed
 * hands and the debt it discharges — never the residual**, which the server
 * (or, with none yet, the executor itself) derives from live data and
 * returns. S14 previously called `create_transaction`, which has no notion
 * of a residual and no channel to return a corrected one.
 *
 * **No `residual` field exists here, by design** — see the file header's
 * "what is deliberately not here": a residual is computed *from* this write,
 * never supplied *to* it. Supplying one would let a stale client figure
 * overwrite a balance that moved since the sheet opened (`architecture/08`
 * H9).
 *
 * **`type` is verified rather than derived at apply time (R2 H4).** A
 * controller that read the live balance's sign to build this payload
 * (`create-phone-ledger.ts`'s `settleDebt` action) names that same sign
 * here; the phone's own outbox can apply a dependent write out of order, so
 * an executor that always re-derived the sign at apply time could silently
 * disagree with the direction the person was shown. Checked against the
 * live balance and refused on disagreement.
 *
 * **Required, not optional (#116 review, M2).** R2 H4 itself carries `type`
 * to prove the settlement's direction was verified, not assumed — an
 * omitted `type` skipped that verification for exactly the caller least
 * likely to have re-derived it independently. A fixture now reads (or
 * establishes) the balance it settles and carries the sign it expects, the
 * same discipline any other caller carries.
 */
export const settleDebtInput = z
  .object({
    id: zId<"transactions">(),
    counterpartyId: zId<"counterparties">(),
    /** Where the money lands (S14 §3's "Into" field). */
    accountId: zId<"accounts">(),
    date: zAccountingDate,
    /** What actually changed hands. Positive — direction is derived, not entered. */
    amount: zMoney,
    currency: zCurrencyCode,
    /** They owe you (`income`) or you owe them (`expense`) — see above. */
    type: z.enum(["income", "expense"]),
    /** Which balance this discharges, and how much of it — §6.6's settlement table. */
    discharges: z.object({
      currency: zCurrencyCode,
      amount: zMoney,
    }),
    note: z.string().trim().max(2000).default(""),
    categoryId: zId<"categories">().optional(),
    // Not here, on purpose:
    //   `residual`  — derived from the live balance, never supplied (H9, above).
    //   `rate`      — §7.5: `discharges.amount ÷ amount` is derived by the
    //                 screen and never stored (S14 §7).
  })
  .superRefine((v, ctx) => {
    // M4 — `superRefine` still runs even when `amount`/`discharges.amount`
    // already failed `zMoney`'s own field-level regex (Zod does not short-
    // circuit a sibling check on a nested issue), so `v.amount` here can
    // still be the raw, malformed string rather than the `Money` the output
    // type claims. `dec()` throws on that (`Decimal`'s own constructor
    // does), which is exactly the unguarded call M4 exists to close — a
    // malformed figure already has its own issue from `zMoney`'s regex, so
    // this positivity check is simply skipped for it rather than duplicating
    // that refusal or throwing past it.
    if (safeDec(v.amount)?.lte(0) === true) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "the amount that changed hands is positive — direction comes from the balance",
      });
    }
    if (safeDec(v.discharges.amount)?.lte(0) === true) {
      ctx.addIssue({
        code: "custom",
        path: ["discharges", "amount"],
        message: "the discharged amount is positive",
      });
    }
  });
export type SettleDebtInput = z.output<typeof settleDebtInput>;

/* ════════════════════════════════════════════════════════════════════════
 * end E2 block
 * ════════════════════════════════════════════════════════════════════════ */
