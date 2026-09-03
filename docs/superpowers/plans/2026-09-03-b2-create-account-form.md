# B2 · Expand Create account beyond the preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The S16 Create account form submits every user-owned `create_account` field — kind, ownership, opening balance and date, memo, business scope, group — validates against the shared input, and its defaults still produce the same minimal name-and-currency path.

**Architecture:** `CreateAccountForm` grows the fields as **a collapsed "More" section**: name and currency stay where they are, a `Button variant="ghost"` labelled *More details* reveals the rest. Every new control is a D1 primitive from #76. `CreateAccountDraft` becomes the full user-owned subset of `CreateAccountInput` (no `id`, no `externalId`); the controller's `createAccount` takes the draft rather than `(name, currency)`. The group picker reads groups from the ledger — `listGroups` joins the port (one read added to `packages/ledger/src/accounts/read-groups.ts`).

**Spec:** design §3 B · `screens/S16-accounts.md` §5 · `registry/inputs.ts` `createAccountInput`.

**Board card closed:** *Expand Create account beyond the preview*.

## Global Constraints

As B1. Branch `feature/b2-create-account-form` off `main`. Keep the collapsed default so B1's and the existing tests' minimal path is unchanged. **Do not touch `fieldErrors`** — that is B1; if B1 has merged, rebase and thread the new fields' paths into `knownPaths`.

---

### Task 1: The read for groups

`packages/ledger/src/accounts/read-groups.ts`: `readGroups(db): readonly LocalGroup[]`, `LocalGroup = { id: Id<"accountGroups">; name: string; institution: string | null; sort: number }`. Add `listGroups` to `PhoneLedgerPort` and `groups: readonly PhoneGroup[]` to `PhoneLedgerSnapshot` in `create-phone-ledger.ts`; the web and native `phone-ledger.*` files pass `session.listGroups` (add to `LocalLedgerSession`). Test in `packages/ledger/src/test/session.test.ts`. Commit.

### Task 2: The draft and the controller

`CreateAccountDraft` becomes:
```ts
export type CreateAccountDraft = {
  name: string; currency: CurrencyCode;
  kind: AccountKind; ownership: "own" | "shared"; isBusiness: boolean;
  openingBalance: string; openingDate: string | null;
  memo: string; groupId: string | null;
};
```
`createAccount(draft: CreateAccountDraft)` on the controller builds the `createAccountInput.parse({ id, ...draft, openingDate: draft.openingDate ?? undefined, groupId: … })`. Update `use-phone-ledger.test.tsx`, `screens.test.tsx`, `account-creation-screen.tsx`. Commit `"createAccount takes the whole draft"`.

### Task 3: The form

Fields, in this order under *More details*, each a D1 control with the exact prop shapes from `packages/ui/src/primitives/`:

| Field | Control | Options / notes |
|---|---|---|
| Kind | `Select` | `ACCOUNT_KIND` values; labels from new keys `accounts.kind.<value>` (9 keys ×2 languages) |
| Ownership | `RadioGroup` | `own` / `shared`, keys `accounts.ownership.own/.shared` |
| Business | `Toggle` | key `accounts.business`; **disabled and forced false when ownership is shared** (§6.7 — the input refines it; the form should not offer an impossible pair) |
| Opening balance | `AmountField` | `currency` = the chosen one; key `accounts.openingBalance` |
| Opening date | `TextField` | `YYYY-MM-DD`, validated with `isAccountingDate`; key `accounts.openingDate`; hint `accounts.openingDateHint` ("As of this date — usually the day you opened it.") |
| Memo | `TextField` | maxLength 2000, `counter`; key `common.memo` |
| Group | `Select` | groups from props `groups: readonly {id, name}[]`; placeholder `accounts.noGroup` ("No group") |

Defaults: kind `other`, ownership `own`, business off, opening balance `0`, date null, memo empty, group null — so Save with only name + currency yields exactly today's draft. Tests: the existing five still pass; *collapsed by default renders none of the seven*; *shared ownership forces business off and disables the toggle*; *an invalid date blocks Save with the field error*; *the full draft reaches `onSave`*. Stories: `Expanded`, `SharedAccount`. Commit `"Create account describes the account, not just its name"`.

### Task 4: Gate and PR

`pnpm test:visual:update` (root), `git add -A && pnpm verify`. PR *"An account can be described when it is created"*; quote *Done when* and show the minimal path unchanged (the same `create-account-form.test.tsx` cases green).
