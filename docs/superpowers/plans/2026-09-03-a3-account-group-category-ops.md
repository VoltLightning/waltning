# A3 · Account, group and category operations, the phone half — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fourteen structural operations get a Zod input in `core` and a local executor in `ledger`: `update_account` `archive_account` `reorder_accounts` · `create_group` `update_group` `reorder_groups` `archive_group` · **`reconcile_account`** · `create_category` `rename_category` `reparent_category` `convert_leaf_group` `merge_categories` `archive_category`.

**Architecture:** Identical to A2 — one executor file per op, `defineLocalExecutor`, inputs beside `createAccountInput`. Two ops carry real logic and get their own tasks: `reconcile_account` writes one `adjustment` transaction (S16 §5) and `merge_categories` moves every transaction from the loser to the winner then archives the loser (J12). A new `packages/ledger/src/categories/` folder mirrors the `accounts/`/`transactions/` split and is added to the architecture allowlist.

**Tech Stack:** zod, drizzle-orm (sqlite), `better-sqlite3` via `scratchStores()`.

**Spec:** design §3 A3 · `operations.md` (Accounts, categories, counterparties table) · `screens/S16-accounts.md` §5 (groups, opening balance, reconciling) · `screens/S19-settings-categories.md` · `flows/J12-maintain-categories.md` · `TAXONOMY.md` R2.

**Board cards closed:** *Writes — accounts, groups, reconciliation (9 ops)* (phone half; `create_account` exists) · *Writes — categories (6 ops)*.

## Global Constraints

Same as A2. Branch `feature/a3-structural-ops` off `main`. **A2 and A3 both append to `inputs.ts` and `registry.ts`** — keep your additions in their own clearly-delimited block so the rebase is a trivial merge.

---

## File structure

| File | Responsibility |
|---|---|
| `packages/core/src/registry/inputs.ts` (modify) | Fourteen input schemas, in two sections (`accounts`, `categories`). |
| `packages/core/src/registry/inputs.test.ts` (modify) | Refusal test per schema. |
| `packages/ledger/src/accounts/update-account.executor.ts` … one file per account/group op (8 files, create) | |
| `packages/ledger/src/accounts/reconcile-account.executor.ts` (create) | The adjustment write. |
| `packages/ledger/src/categories/*.executor.ts` (6 files, create) | |
| `packages/ledger/src/categories/read-category-tree.ts` (create) | `readCategoryTree(db)` — the read the executors and later screens need. |
| `packages/ledger/src/registry.ts` (modify) | Register all fourteen. |
| `packages/ledger/src/test/account-ops.test.ts`, `category-ops.test.ts` (create) | |
| `tests/architecture.test.ts` (modify) | `"packages/ledger/src": ["accounts", "categories", "currencies", "test", "transactions"]`. |

---

### Task 1: Inputs — accounts and groups

Append to `inputs.ts` a section `/* ── accounts and groups ── */`:

```ts
const accountPatch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  kind: z.enum(ACCOUNT_KIND).optional(),
  groupId: zId<"accountGroups">().nullable().optional(),
  ownership: z.enum(OWNERSHIP).optional(),
  memo: z.string().trim().max(2000).optional(),
  isBusiness: z.boolean().optional(),
  // openingBalance/openingDate ARE patchable — S16 §5 says it is an audited
  // write with a confirm, not a forbidden one. The confirm is the screen's.
  openingBalance: zMoney.optional(),
  openingDate: zAccountingDate.nullable().optional(),
}).strict();

export const updateAccountInput = z.object({
  id: zId<"accounts">(), version: z.number().int().positive(), patch: accountPatch,
}).refine((v) => Object.keys(v.patch).length > 0, { message: "a patch must set at least one field", path: ["patch"] });
// NOTE: currency is deliberately absent — S16 §7: changing currency with transactions present is refused,
// and with none present it is create-then-archive. No op changes it.

export const archiveAccountInput = z.object({ id: zId<"accounts">(), version: z.number().int().positive() });
export const reorderAccountsInput = z.object({ ids: z.array(zId<"accounts">()).min(1) });

export const createGroupInput = z.object({
  id: zId<"accountGroups">(),
  name: z.string().trim().min(1).max(120),
  institution: z.string().trim().max(120).nullable().default(null),
});
export const updateGroupInput = z.object({
  id: zId<"accountGroups">(),
  patch: z.object({ name: z.string().trim().min(1).max(120).optional(), institution: z.string().trim().max(120).nullable().optional() }).strict(),
}).refine((v) => Object.keys(v.patch).length > 0, { message: "a patch must set at least one field", path: ["patch"] });
export const reorderGroupsInput = z.object({ ids: z.array(zId<"accountGroups">()).min(1) });
export const archiveGroupInput = z.object({ id: zId<"accountGroups">() });

/**
 * S16 §5: *I counted, and it says this.* The observed balance and the date
 * it was observed; the executor computes the difference against §2 and
 * writes one `adjustment`. `note` is the reason; `categoryId` defaults to
 * Uncategorized on the server — here it is optional and the executor leaves
 * it null when absent, which reads as uncategorised in every list.
 */
export const reconcileAccountInput = z.object({
  accountId: zId<"accounts">(),
  adjustmentId: zId<"transactions">(),
  observedBalance: zMoney,
  asOf: zAccountingDate,
  note: z.string().trim().max(2000).default(""),
  categoryId: zId<"categories">().optional(),
});
```
Export the `…Input` type for each. Tests: one refusal each (empty patch, empty ids, `currency` in an account patch refused by `.strict()`).

Commit: `"Nine account and group operations get their input contract"`.

### Task 2: Inputs — categories

Append a section `/* ── categories ── */`:

```ts
export const createCategoryInput = z.object({
  id: zId<"categories">(),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(CATEGORY_KIND),            // restate `["income", "expense"] as const` beside the other enums at inputs.ts:33-71 — core cannot import schema
  parentId: zId<"categories">().nullable().default(null),
  isEarnings: z.boolean().default(false),
  icon: z.string().trim().max(64).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
});
export const renameCategoryInput = z.object({ id: zId<"categories">(), version: z.number().int().positive(), name: z.string().trim().min(1).max(120) });
export const reparentCategoryInput = z.object({ id: zId<"categories">(), version: z.number().int().positive(), parentId: zId<"categories">().nullable() });
export const convertLeafGroupInput = z.object({ id: zId<"categories">(), version: z.number().int().positive(), to: z.enum(["leaf", "group"]) });
export const mergeCategoriesInput = z.object({ loserId: zId<"categories">(), winnerId: zId<"categories">() })
  .refine((v) => v.loserId !== v.winnerId, { message: "a category cannot merge into itself", path: ["winnerId"] });
export const archiveCategoryInput = z.object({ id: zId<"categories">(), version: z.number().int().positive() });
```
Commit: `"Six category operations get their input contract"`.

### Task 3: Account and group executors (the mechanical eight)

`update_account` and `archive_account` follow A2's `patchTransaction` shape exactly (version check, refuse archived, bump version). `reorder_accounts`/`reorder_groups`: set `sort = index` for each id in order, refuse if any id is missing. Group ops: no version column on `account_groups` — plain update; `archive_group` refuses if any live account still names it (S16: an account may have no group; a group with accounts cannot vanish under them). `update_account` must refuse `ownership: "shared"` combined with `isBusiness: true` on the resulting row (§6.7 — the same refine `createAccountInput` has, but on the merged result).

Test file `account-ops.test.ts`: per op, lands + entry; the refusals named above; one crash test.

Commit: `"Accounts and groups: update, archive, reorder — on the device"`.

### Task 4: `reconcile_account`

```ts
// packages/ledger/src/accounts/reconcile-account.executor.ts
/**
 * `reconcile_account` — S16 §5, *I counted, and it says this.*
 *
 * Writes **one `adjustment` transaction** for `observed − computed`, dated
 * `asOf`, and records the observation in `accounts.expected_balance`. Never
 * a balance overwrite: the balance is `opening + Σ signed legs` and there is
 * no field to set. The discrepancy stays visible as an amount you can
 * categorise later.
 *
 * `computed` is §2 as of `asOf` — rows dated after the observation do not
 * count, or reconciling yesterday's statement would absorb today's coffee.
 */
```
`mints: (input) => [input.adjustmentId]`. `apply`: read the account (refuse archived); fold `money.accountBalance(opening, id, rows where date <= asOf)` — **use the A1 fold if A1 has merged; otherwise inline the same fold and leave a `// TODO(A1)` is forbidden — instead import `signed` and write the fold locally with a comment naming A1's `accountBalance` as its replacement**; `difference = money.sub(observed, computed)`; if `money.isZero(difference)` refuse with *"nothing to reconcile — the ledger already says {observed}"*; insert the adjustment via the exported `insertTransaction` with `type: "adjustment"`, `amountOriginal: difference` (may be negative — that is the type's whole point, H5), `source: "manual"`; update `expectedBalance = observed`.

Tests: the S16 worked example — computed 1240.50, observed 1198.30 → one adjustment of −42.20, dated `asOf`; a zero difference refused; balance after equals observed.

Commit: `"Reconcile: one adjustment for the difference, never a silent overwrite"`.

### Task 5: Category executors, and the tree reader

`read-category-tree.ts`: `readCategoryTree(db): readonly LocalCategory[]` where `LocalCategory = { id; parentId; name; kind; isLeaf; isEarnings; archived; sort; depth }`, ordered depth-first by `sort`. Needed by the executors' cycle check and by S19/S06 later.

Executors: `create_category` (a parent must exist and be a group — `isLeaf: false`; refuse a leaf parent); `rename_category` (version check); `reparent_category` (refuse a cycle — walk the tree; refuse a leaf parent); `convert_leaf_group` (to `group` refuses if transactions reference it; to `leaf` refuses if it has children); `archive_category` (refuse a group with unarchived children — `operations.md`; refuse already archived); `merge_categories` (both live, same `kind`; `update transactions set category_id = winner where category_id = loser` — count it; also `transaction_lines`; archive the loser; refuse merging a group).

**Offline rule (S19):** *structural edits refused offline; creating a leaf queues.* The phone has no notion of "offline" yet — every write queues. Record in the PR that `reparent`, `convert`, `merge` are marked `offlineEligible: false` on the **server** side in `#e7` and that the local executors exist so the *phone-alone* ledger (no server ever) can maintain its taxonomy; the drain will refuse them from an outbox once a server exists. Do not invent an offline flag here.

Tests: each rule above broken once; merge on a fixture with 3 transactions and 1 line asserts all moved and loser archived.

Commit: `"The category tree can be reorganised on the device"`.

### Task 6: Allowlist, gate, PR

- `tests/architecture.test.ts`: add `"categories"` to `packages/ledger/src`.
- `git add -A && pnpm verify`.
- PR *"Fourteen structural operations the phone can run alone"* — quote both cards; state the offline note from Task 5; footer.
