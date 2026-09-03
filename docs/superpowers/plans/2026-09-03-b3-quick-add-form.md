# B3 · Expand keypad Quick add beyond the preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The keypad path submits every user-owned S05 field — category, editable accounting date, scope (business), note, counterparty with role, expense/income — through the shared `create_transaction` input, while **amount plus account stays the fast default path**.

**Architecture:** `QuickAddForm` keeps amount and account at the top, unchanged. Beneath: an `Expense | Income` `SegmentControl` (default expense), a category `Select` (searchable — S05 says the list is long), and a collapsed *More* section with date, note, business `Toggle`, and counterparty (`Select` of counterparties + role `RadioGroup`, both hidden until a counterparty is chosen). The draft becomes the user-owned subset of `CreateTransactionInput`; the controller's `createExpense` becomes `createTransaction(draft)`. Categories and counterparties come from two new reads on the port. **Voice, photo, converse, transfer stay out** — the card says so.

**Spec:** design §3 B · `screens/S05-quick-add.md` §3 (mobile), §4, §5 · `registry/inputs.ts` `createTransactionInput` (its `.superRefine` rules are the form's validation: a transfer is not offered, so the transfer triple never arises; `categoryId` only on income/expense; counterparty id and role paired).

**Board card closed:** *Expand keypad Quick add beyond the preview*.

## Global Constraints

As B1. Branch `feature/b3-quick-add-form` off `main`. `quick-add-form.test.tsx` currently asserts an **absence list** (Category, Date, Note, Income… must not render) — that test was written for the preview and is superseded by this card: rewrite it to assert the *collapsed* form still shows only amount + account + Create-account, and that the new fields appear on expansion. Keep the test's spirit (voice/scan/sync/FX stay absent).

---

### Task 1: Reads — categories and counterparties

`packages/ledger/src/categories/read-category-tree.ts` (create if A3 has not merged; if it has, reuse) → leaf categories with `kind`; `packages/ledger/src/counterparties/` does not exist and counterparties are `#e3` — **offer the counterparty field only when the port returns any**, and for this arc the phone port returns `[]` from a `listCounterparties` stub on the session (one read, `read-counterparties.ts`, over the shared `counterparties` table — it exists in the schema). Add `categories` to the ledger allowlist if creating the folder. Add `categories`/`counterparties` to `PhoneLedgerSnapshot`. Commit.

### Task 2: Draft and controller

```ts
export type QuickAddDraft = {
  type: "expense" | "income";
  amount: string; accountId: string;
  categoryId: string | null;
  date: string;                 // AccountingDate, defaults to capture.date
  note: string; isBusiness: boolean;
  counterpartyId: string | null; counterpartyRole: "debt" | "contribution" | "reference" | null; // COUNTERPARTY_ROLE in inputs.ts:71
};
```
Controller: `createTransaction(draft)` replaces `createExpense`; keeps the capturable check and the positive-amount check; `date: draft.date` (the form's, which defaults to `capture().date` — the `capturedTz` card's editable-date half lands here). Update tests and screens. Commit `"Quick add saves the whole transaction, not amount and account"`.

### Task 3: The form

| Field | Control | Notes |
|---|---|---|
| Type | `SegmentControl` | `transactions.expense` / `transactions.income`; income flips the amount sign presentation only — the input is always positive (`amountOriginal` must be > 0; type carries direction) |
| Category | `Select searchable` | leaves of the matching `kind`; placeholder `transactions.noCategory` ("No category") — optional per the input |
| **More** | ghost `Button` | reveals below |
| Date | `TextField` | default today (prop `today: string`), validated `isAccountingDate`; key `transactions.date` |
| Note | `TextField` | maxLength 2000, `counter`; `common.note` |
| Business | `Toggle` | `transactions.business` |
| Counterparty | `Select searchable` | only rendered when `counterparties.length > 0`; on pick, a `RadioGroup` of roles appears (keys `transactions.role.<value>`) |

Tests: collapsed default renders amount, account, type segment, category select and *More* — nothing else; `income` reaches `onSave` as `type: "income"`; date edit reaches `onSave`; the counterparty controls are absent with an empty list and present with one; the capturable-false block still works. Stories: `Expanded`, `Income`, `WithCounterparty`. Commit `"Quick add records the context, and stays fast by default"`.

### Task 4: Gate and PR

Visual rebaseline from root; `pnpm verify`. PR *"Quick add captures the whole expense — amount and account still first"*; quote *Done when*; note the `capturedTz` card's editable-date half is met here and the timezone half is already in `deviceRuntime`.
