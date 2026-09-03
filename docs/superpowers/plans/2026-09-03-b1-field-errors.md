# B1 · `fieldErrors` onto a form — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A refusal lands on the field that caused it. `packages/client` gains one function that maps a `{path, message}[]` (dotted, may index — `lines.2.amount`) onto a form's known field paths, with every unmatched path surfacing at form level rather than vanishing. Both existing forms (`CreateAccountForm`, `QuickAddForm`) accept a `fieldErrors` prop and render them; the phone-ledger controller stops throwing plain `Error`s for validation and returns the same shape, so the phone-alone path and the future server path present one way.

**Architecture:** Pure function `mapFieldErrors(errors, knownPaths) → { byField: Record<path, message[]>, formLevel: string[] }` in `packages/client/src/transport/field-errors.ts` (it is the client half of the transport contract). Forms take `fieldErrors?: FieldErrorMap` and pass `error` into the D1 controls that already accept one (`TextField`, `AmountField`); controls that do not (`Chip` rows, `RadioGroup`) get a caption under the group. Zod's `issues` from `createAccountInput.parse` in the controller become `{path: issue.path.join("."), message}` — the same shape the server's `fieldErrorsOf` produces (`apps/api/src/trpc/index.ts:186`), so a form never learns where a refusal came from.

**Spec:** design §3 B · `architecture/12-forms-and-validation.md` · the card's *Done when*: *a form shows two errors from one response, and a path the form does not know about still appears somewhere.*

**Board card closed:** *Translate `fieldErrors` onto a form*.

## Global Constraints

- `packages/client` imports `react`, never `react-native`. `packages/ui` components take data, never fetch.
- Every user-visible word through `useT()`; keys in `en.ts` **and** `pl.ts`. Error *messages* from Zod are English literals today — that is the spec's problem (`architecture/12`) not this card's; render them as data. But the form-level heading ("Couldn't save") is a key.
- No inline JSX functions; `makeStyles` only; `space.*` tokens only.
- Branch `feature/b1-field-errors` off `main`. **B2 and B3 modify the same two form files** — keep this PR's form edits to the `fieldErrors` prop and its rendering only.

---

### Task 1: `mapFieldErrors`

**Files:** create `packages/client/src/transport/field-errors.ts`, `field-errors.test.ts`.

**Interfaces — produced:**
```ts
export type FieldError = { path: string; message: string };
export type FieldErrorMap = { byField: Readonly<Record<string, readonly string[]>>; formLevel: readonly string[] };
export function mapFieldErrors(errors: readonly FieldError[], knownPaths: readonly string[]): FieldErrorMap;
export function fieldErrorsFromZod(error: unknown): readonly FieldError[] | null;  // null if not a ZodError
```

- [ ] Tests first:
```ts
it("puts a known path on its field and an unknown one at form level", () => {
  const map = mapFieldErrors(
    [{ path: "name", message: "too short" }, { path: "openingDate", message: "not a date" }, { path: "lines.2.amount", message: "must sum" }],
    ["name", "currency", "openingDate"],
  );
  expect(map.byField).toEqual({ name: ["too short"], openingDate: ["not a date"] });
  expect(map.formLevel).toEqual(["lines.2.amount: must sum"]);
});
it("matches the whole dotted path, never the last segment", () => {
  const map = mapFieldErrors([{ path: "lines.2.amount", message: "x" }], ["amount"]);
  expect(map.byField).toEqual({});           // NOT { amount: ["x"] }
  expect(map.formLevel).toHaveLength(1);
});
it("collects several messages on one field in order", () => { /* two errors, same path */ });
it("turns a ZodError's issues into dotted paths, and anything else into null", () => {
  const err = createAccountInput.safeParse({ id: "…", name: "", currency: "PLN" }).error;
  expect(fieldErrorsFromZod(err)?.[0]?.path).toBe("name");
  expect(fieldErrorsFromZod(new Error("x"))).toBeNull();
});
```
- [ ] Implement; run `npx vitest run packages/client/src/transport`; commit `"fieldErrors map onto a form by whole path, or land at form level"`.

### Task 2: The controller returns errors instead of throwing them

**Files:** modify `packages/client/src/ledger/create-phone-ledger.ts` (`createAccount`, `createExpense`), `use-phone-ledger.test.tsx`.

**Interfaces — changed:**
```ts
createAccount: (name: string, currency: CurrencyCode) => { id: Id<"accounts"> } | { fieldErrors: readonly FieldError[] };
createExpense: (amount: string, accountId: Id<"accounts">) => { id: Id<"transactions"> } | { fieldErrors: readonly FieldError[] };
```
The three hand-written throws in `createExpense` become field errors: no account → `{path: "accountId", …}`; uncapturable → `{path: "accountId", …}` (keep the existing `transactions.needsRate` text as the message source — the controller cannot call `useT`, so it returns a **key + params** shape: make `FieldError.message` a string and add `messageKey?: string; params?: Record<string,string>` — the form resolves it). Zod refusals go through `fieldErrorsFromZod`. Non-validation errors (a SQLite failure) still throw.

- [ ] Update `screens.test.tsx` and any caller (`account-creation-screen.tsx`, `quick-add-screen.tsx`) to branch on the result: `"id" in result ? navigate : setFieldErrors(result.fieldErrors)`.
- [ ] Commit `"The ledger controller refuses with field errors, not throws"`.

### Task 3: Forms render them

**Files:** modify `create-account-form.tsx`, `quick-add-form.tsx`, their tests; `en.ts`/`pl.ts` add `common.couldNotSave` ("Couldn't save" / "Nie udało się zapisać").

- [ ] Both forms gain `fieldErrors?: FieldErrorMap`. `TextField` gets `error={fieldErrors?.byField.name?.[0]}`; `AmountField` gets `error={…amountOriginal?.[0]}`; the currency/account chip groups get a `<Text style={styles.fieldError}>` beneath when `byField.currency`/`byField.accountId` is set; `formLevel` renders as a list under a `common.couldNotSave` heading above the actions. The form-level block must be `accessibilityRole="alert"`.
- [ ] Tests: *two errors from one map render on two fields*; *an unknown path renders at form level*; *no `fieldErrors` prop renders nothing extra* (existing tests must still pass).
- [ ] Stories: one `WithErrors` story per form.
- [ ] Commit `"Both forms show where a refusal landed"`.

### Task 4: Gate and PR

`git add -A && pnpm verify` (visual suite rebaselines two new stories: run `pnpm test:visual:update` from the repo root). PR *"A refusal lands on the field that caused it"*; quote the *Done when*.
