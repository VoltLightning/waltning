# D1 · Deterministic capture grammar (tier 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `parseCapture("coffee 18 cash", context)` → `{ amount: "18", accountId, payee: "coffee", date, … }` with no model and no network. Deterministic: first number is the amount, known account and category names bind to their ids, relative dates parse, the rest is the payee. When it cannot resolve — no amount, or too much unmatched — it says so, so the screen can offer *interpret with model*.

**Architecture:** Pure function in `packages/core/src/capture/grammar.ts` (new folder, allowlisted). Input: the text plus a `CaptureContext { accounts: {id,name,aliases}[]; categories: {id,name}[]; today: AccountingDate; locale: "en"|"pl" }`. Output: a `CaptureParse` discriminated on `ok`. Tokenisation is whitespace; matching is case-folded, diacritic-folded (`ł`→`l`), longest-match over multi-word names. Amount grammar accepts `18`, `18.5`, `18,50`, `1 240,50` (U+00A0 or space), and a trailing currency token that must match the bound account's currency or is refused. Dates: `today`, `yesterday`, `wczoraj`, `dziś`, an ISO date, `DD.MM`, and weekday names resolving to the most recent past occurrence. **No model, no fuzzy match** — tier 1.5 (D2) does fuzzy.

**Spec:** design §3 D · `screens/S05-quick-add.md` §3 "Web — command bar" (the grammar paragraph) · `flows/J02-daily-capture.md` §1 (ten seconds), §3 (the keypad path uses no model).

**Board card closed:** *Deterministic capture grammar (tier 1)*.

## Global Constraints

- `packages/core`: zod and decimal.js only, no Node API, no platform. Money strings via `money.ts` — the parsed amount is `money.toMoney(...)`.
- Explicit `.ts` specifiers. `tests/architecture.test.ts` ALLOWED for `packages/core/src` becomes `["capture", "registry"]`.
- Branch `feature/d1-capture-grammar` off `main`. Nothing else in wave 1 touches `packages/core/src/capture/`.

---

### Task 1: Amount and currency

**Files:** create `packages/core/src/capture/amount.ts`, `amount.test.ts`.

```ts
export type AmountToken = { amount: Money; currency: string | null; span: [number, number] };
export function findAmount(text: string): AmountToken | null;
```
Tests: `"coffee 18 cash"` → `18.00000000`, span of `18`; `"1 240,50 zł taxi"` → `1240.50000000`, currency `zł`; `"18.5"`, `"18,5"`, `",5"` → `0.5`; `"coffee"` → null; `"2 coffees 18"` → **the first number is the amount** (`2`) — document that this is the S05 rule and a known cost; `"-18"` → refused (null, negative is not a capture). Implement with one regex over the folded text; convert through `money.toMoney`. Commit.

### Task 2: Names — accounts and categories

**Files:** `packages/core/src/capture/names.ts`, test.

```ts
export type NameMatch<T> = { value: T; span: [number, number] };
export function fold(s: string): string;                       // lower + strip diacritics
export function findName<T extends { id: string; name: string; aliases?: readonly string[] }>(text: string, candidates: readonly T[], exclude: readonly [number, number][]): NameMatch<T> | null;
```
Longest match wins; word-boundary anchored; `exclude` spans (the amount, an earlier match) are skipped. Tests: `"Bank A"` matches over `"Bank"`; `"gotówka"` alias matches `Cash`; a match inside the amount span is refused. Commit.

### Task 3: Dates

`packages/core/src/capture/dates.ts`: `findDate(text, today: AccountingDate, locale): { date: AccountingDate; span } | null`. Tokens: `today|dziś|dzisiaj`, `yesterday|wczoraj`, `YYYY-MM-DD`, `DD.MM` (current year; if in the future, last year), weekday names (en + pl, most recent past incl. today). Use `date.ts`'s `accountingDate`; **no `Date` arithmetic on the accounting date** — compute day offsets with a small pure helper over `YYYY-MM-DD` (there may already be one in `date.ts`; if not, add `addDays(date, n)` there with tests). Commit.

### Task 4: `parseCapture`

`packages/core/src/capture/grammar.ts`:
```ts
export type CaptureContext = { accounts: readonly {id: string; name: string; currency: string; aliases?: readonly string[]}[]; categories: readonly {id: string; name: string}[]; defaultAccountId: string | null; today: AccountingDate; locale: "en" | "pl" };
export type CaptureParse =
  | { ok: true; amount: Money; accountId: string; categoryId: string | null; date: AccountingDate; payee: string; unmatched: readonly string[] }
  | { ok: false; reason: "no_amount" | "no_account" | "currency_mismatch" | "too_much_unmatched"; partial: Partial<…>; unmatched: readonly string[] };
export function parseCapture(text: string, context: CaptureContext): CaptureParse;
```
Rules: amount first; account by name else `defaultAccountId` else `no_account`; category by name; date else `today`; payee = the remaining tokens joined, trimmed of punctuation; `too_much_unmatched` when unmatched tokens > 6 or > 60% of tokens and the payee would be empty. Tests — the card's example and S05's: `"coffee 18 cash"`, `"48.90 cash coffee yesterday"`, `"taxi 1 240,50 zł Bank A wczoraj"`, `"lunch"` → `no_amount`, `"18"` with no default account → `no_account`, `"18 usd cash"` where cash is PLN → `currency_mismatch`. Commit `"The capture grammar: amount, account, category, date, payee — no model"`.

### Task 5: Allowlist, gate, PR

Add `"capture"` to `packages/core/src` ALLOWED. `git add -A && pnpm verify`. PR *"'coffee 18 cash' is enough"*; quote the card; state what tier 1.5 (D2) adds and what stays with the model.
