# A2 · Transaction operations, the phone half — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `update_transaction`, `delete_transaction`, `set_transaction_lines`, `supersede_transaction` and `categorize_batch` each have a Zod input in `packages/core` and a local executor in `packages/ledger`, so the phone can edit, delete, split, replace and bulk-categorise transactions with no backend — every write landing in the replica and the outbox in the two-file commit `write.ts` already guarantees.

**Architecture:** Follow `create-transaction.executor.ts` exactly: one file per operation under `packages/ledger/src/transactions/`, `defineLocalExecutor` with `operation` name byte-for-byte matching `operations.md`, `mints` listing every id the write creates, `apply` doing the row work inside the transaction it is handed. Inputs are declared once in `packages/core/src/registry/inputs.ts` beside `createTransactionInput`. Patch semantics: an update carries only the fields it sets, plus `version` for the compare (`architecture/14` §14.2). `attach_receipt` is **not** built — a receipt is an object in MinIO the phone never holds.

**Tech Stack:** zod, drizzle-orm (sqlite), `better-sqlite3` tests via `packages/ledger/src/test/stores.ts` (two real files — the crash tests need the separation).

**Spec:** `docs/superpowers/specs/2026-09-03-arc-phone-stack-design.md` §3 A2 · `docs/specification/operations.md` (Transactions table) · `architecture/14` §14.2 (version, patch semantics) · `SPEC.md` §10.3 (lines), §13.1 (tax-sensitive fields).

**Board card closed:** *Writes — transactions (7 ops)* — the phone half. Say in the PR that `attach_receipt` is server-only and the tRPC procedures are `#e7`.

## Global Constraints

- Money is `numeric(20,8)` strings via `money.ts`; dates bare `YYYY-MM-DD` via `accountingDate()`.
- `packages/core` and `packages/ledger` name no platform. Explicit `.ts` specifiers. No barrels. No `any`, no `!`.
- Every "must never" gets a check in the executor **and**, where SQLite can state it, a constraint in `packages/ledger/src/ddl.ts` (regenerate via `pnpm ledger:generate` if the schema changes — but it should not: these ops write existing columns).
- Placeholders only in tests: `Bank A · PLN`, `Coffee`.
- `pnpm verify` green; `git add -A` first. Branch `feature/a2-transaction-ops` off `main`.

---

## File structure

| File | Responsibility |
|---|---|
| `packages/core/src/registry/inputs.ts` (modify) | Five new input schemas + types. |
| `packages/core/src/registry/inputs.test.ts` (modify) | One refusal test per new schema. |
| `packages/ledger/src/transactions/update-transaction.executor.ts` (create) | Patch one row; version check; `updated_at`. |
| `packages/ledger/src/transactions/delete-transaction.executor.ts` (create) | Soft delete — sets `deleted_at`, never removes. |
| `packages/ledger/src/transactions/set-transaction-lines.executor.ts` (create) | Replace the line set; sum must equal the transaction. |
| `packages/ledger/src/transactions/supersede-transaction.executor.ts` (create) | Import row replaces a manual entry: new row + soft-delete old. |
| `packages/ledger/src/transactions/categorize-batch.executor.ts` (create) | One category over N ids. |
| `packages/ledger/src/registry.ts` (modify) | Register all five. |
| `packages/ledger/src/test/transaction-ops.test.ts` (create) | Per op: lands + outbox entry; refuses what it must; crash between stores leaves neither. |

---

### Task 1: The five inputs in `core`

**Files:**
- Modify: `packages/core/src/registry/inputs.ts` (append after `createTransactionInput`)
- Modify: `packages/core/src/registry/inputs.test.ts`

**Interfaces — produced (exact):**

```ts
export const updateTransactionInput: z.ZodType<…>;   // see body
export type UpdateTransactionInput = z.output<typeof updateTransactionInput>;
export const deleteTransactionInput; export type DeleteTransactionInput;
export const setTransactionLinesInput; export type SetTransactionLinesInput;
export const supersedeTransactionInput; export type SupersedeTransactionInput;
export const categorizeBatchInput; export type CategorizeBatchInput;
```

- [ ] **Step 1: Write the failing tests**

```ts
// append to packages/core/src/registry/inputs.test.ts
describe("update_transaction", () => {
  it("is a patch: only the fields sent are set, and version is required", () => {
    const parsed = updateTransactionInput.parse({
      id: "00000000-0000-4000-8000-000000000001",
      version: 3,
      patch: { payee: "Coffee" },
    });
    expect(parsed.patch).toEqual({ payee: "Coffee" });
    expect(() => updateTransactionInput.parse({ id: "00000000-0000-4000-8000-000000000001", patch: {} })).toThrow();
  });
  it("refuses an empty patch — a write that changes nothing is a bug, not a no-op", () => {
    expect(() => updateTransactionInput.parse({ id: "00000000-0000-4000-8000-000000000001", version: 1, patch: {} })).toThrow(/at least one field/);
  });
  it("refuses fields that are not patchable: id, version, source, createdAt", () => {
    expect(() => updateTransactionInput.parse({ id: "00000000-0000-4000-8000-000000000001", version: 1, patch: { id: "x" } })).toThrow();
  });
});

describe("set_transaction_lines", () => {
  it("requires each line's amount and description", () => {
    expect(() => setTransactionLinesInput.parse({ transactionId: "00000000-0000-4000-8000-000000000001", version: 1, lines: [{ amount: "1" }] })).toThrow();
  });
  it("accepts an empty set — that is how lines are removed", () => {
    expect(setTransactionLinesInput.parse({ transactionId: "00000000-0000-4000-8000-000000000001", version: 1, lines: [] }).lines).toEqual([]);
  });
});

describe("categorize_batch", () => {
  it("needs at least one id and one category", () => {
    expect(() => categorizeBatchInput.parse({ transactionIds: [], categoryId: "00000000-0000-4000-8000-000000000009" })).toThrow();
  });
});

describe("supersede_transaction", () => {
  it("carries the whole replacement row and the id it replaces", () => {
    expect(() => supersedeTransactionInput.parse({ supersedesId: "00000000-0000-4000-8000-000000000001" })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run packages/core/src/registry/inputs.test.ts`
Expected: FAIL — `updateTransactionInput` is not exported.

- [ ] **Step 3: Implement the schemas**

Append to `inputs.ts` after `createTransactionInput`:

```ts
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
    fee: zMoney.nullable().optional(),
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
  quantity: z.string().regex(/^\d+(\.\d{1,3})?$/).optional(),
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
export const supersedeTransactionInput = z.object({
  supersedesId: zId<"transactions">(),
  supersedesVersion: z.number().int().positive(),
  replacement: createTransactionInput,
});
export type SupersedeTransactionInput = z.output<typeof supersedeTransactionInput>;

/* ── categorize_batch ───────────────────────────────────────────────────── */

/** The bulk path. One category over many ids; a `DiffCard` states the count. */
export const categorizeBatchInput = z.object({
  transactionIds: z.array(zId<"transactions">()).min(1).max(5000),
  categoryId: zId<"categories">(),
});
export type CategorizeBatchInput = z.output<typeof categorizeBatchInput>;
```
Check the exact helper names already in `inputs.ts` (`zId`, `zMoney`, `zCurrencyCode`, `zAccountingDate`, `zPivotPerUnit`, enum constants) and the `IdTable` union in `packages/core/src/id.ts` — `"transactionLines"` and `"counterparties"` must be members; add them there if absent (they are columns in `packages/schema`, so they should be).

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run packages/core`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/registry/inputs.ts packages/core/src/registry/inputs.test.ts packages/core/src/id.ts
git commit -m "Five transaction operations get their input contract

update as a patch with version, delete soft, set_lines as a whole set,
supersede as a full replacement naming what it replaces,
categorize_batch as one category over many ids.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `update_transaction` and `delete_transaction` executors

**Files:**
- Create: `packages/ledger/src/transactions/update-transaction.executor.ts`
- Create: `packages/ledger/src/transactions/delete-transaction.executor.ts`
- Create: `packages/ledger/src/test/transaction-ops.test.ts`
- Modify: `packages/ledger/src/registry.ts`

**Interfaces:**
- Consumes: `defineLocalExecutor` (`../executor.ts`), `LocalTx` (`../write.ts`), `ledgerSchema` (`../schema-map.ts`), inputs from Task 1, `writeLocally(ledger, { executor, registry, input, capture })` and `scratchStores()` (`./stores.ts` → `{ ledger, paths, reopen, close }`).
- Produces: `updateTransactionExecutor`, `deleteTransactionExecutor` — each `LocalExecutor<typeof <input>, LocalTransactionRow, ReplicaTx>`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/ledger/src/test/transaction-ops.test.ts
/**
 * The transaction operations beyond create, on two real files. Each op:
 * lands the row and its outbox entry; refuses what operations.md says it
 * must; and a crash between the two stores leaves neither — the property
 * write.test.ts proves for create, restated per op because a new executor
 * is a new chance to break it.
 */

import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { currencyCode } from "@waltning/core/money";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccountExecutor } from "../accounts/create-account.executor.ts";
import { ledgerRegistry } from "../registry.ts";
import { ledgerSchema } from "../schema-map.ts";
import { createTransactionExecutor } from "../transactions/create-transaction.executor.ts";
import { deleteTransactionExecutor } from "../transactions/delete-transaction.executor.ts";
import { updateTransactionExecutor } from "../transactions/update-transaction.executor.ts";
import { type Capture, writeLocally } from "../write.ts";
import { type ScratchStores, scratchStores } from "./stores.ts";

const { currencies, outbox, transactions } = ledgerSchema;
const PLN = currencyCode("PLN");
const capture: Capture = { timeZone: "Europe/Warsaw", offsetMinutes: 120 };
const ACCOUNT = id<"accounts">("00000000-0000-4000-8000-00000000000a");
const TXN = id<"transactions">("00000000-0000-4000-8000-000000000001");

let stores: ScratchStores;

beforeEach(() => {
  stores = scratchStores();
  stores.ledger.replica.db.insert(currencies).values({ code: PLN, name: "Polish Złoty", decimals: 2, isPivot: true }).run();
  writeLocally(stores.ledger, { executor: createAccountExecutor, registry: ledgerRegistry, capture,
    input: { id: ACCOUNT, name: "Bank A · PLN", currency: PLN } });
  writeLocally(stores.ledger, { executor: createTransactionExecutor, registry: ledgerRegistry, capture,
    input: { id: TXN, date: "2026-09-01", type: "expense", accountId: ACCOUNT, amountOriginal: "18", currency: PLN, payee: "Coffee" } });
});
afterEach(() => stores.close());

const readTxn = () => stores.ledger.replica.db.select().from(transactions).where(eq(transactions.id, TXN)).get();

describe("update_transaction", () => {
  it("patches only the fields sent, bumps version and updated_at, and queues one entry", () => {
    const before = readTxn();
    const result = writeLocally(stores.ledger, { executor: updateTransactionExecutor, registry: ledgerRegistry, capture,
      input: { id: TXN, version: before?.version, patch: { payee: "Coffee at the station" } } });
    const after = readTxn();
    expect(after?.payee).toBe("Coffee at the station");
    expect(after?.amountOriginal).toBe(before?.amountOriginal);
    expect(after?.version).toBe((before?.version ?? 0) + 1);
    expect(after?.updatedAt).not.toEqual(before?.updatedAt);
    const entries = stores.ledger.outbox.db.select().from(outbox).all();
    expect(entries.map((e) => e.operation)).toEqual(["create_account", "create_transaction", "update_transaction"]);
    expect(result.deps).toContain(entries[1]?.id);
  });

  it("refuses a stale version — the row moved under the writer", () => {
    expect(() => writeLocally(stores.ledger, { executor: updateTransactionExecutor, registry: ledgerRegistry, capture,
      input: { id: TXN, version: 999, patch: { payee: "x" } } })).toThrow(/stale/);
    expect(readTxn()?.payee).toBe("Coffee");
  });

  it("refuses to patch a deleted row", () => {
    writeLocally(stores.ledger, { executor: deleteTransactionExecutor, registry: ledgerRegistry, capture,
      input: { id: TXN, version: readTxn()?.version } });
    expect(() => writeLocally(stores.ledger, { executor: updateTransactionExecutor, registry: ledgerRegistry, capture,
      input: { id: TXN, version: readTxn()?.version, patch: { payee: "x" } } })).toThrow(/deleted/);
  });
});

describe("delete_transaction", () => {
  it("is soft: sets deleted_at, keeps the row, and the balance no longer counts it", () => {
    writeLocally(stores.ledger, { executor: deleteTransactionExecutor, registry: ledgerRegistry, capture,
      input: { id: TXN, version: readTxn()?.version } });
    const row = readTxn();
    expect(row).toBeDefined();
    expect(row?.deletedAt).not.toBeNull();
  });
});

describe("a crash between the two stores", () => {
  it("leaves neither the update nor its entry", () => {
    // The pattern write.test.ts uses: make the replica commit fail after the
    // outbox commit, reopen, assert the outbox entry is replayable and the
    // row is unchanged. Copy that harness's failing-replica technique here
    // (read write.test.ts before writing this; do not invent a new one).
  });
});
```
Fill the crash test from `write.test.ts`'s idiom before running.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/ledger/src/test/transaction-ops.test.ts`
Expected: FAIL — cannot find `../transactions/update-transaction.executor.ts`.

- [ ] **Step 3: Implement `update-transaction.executor.ts`**

```ts
/**
 * `update_transaction`, on the device — field-level, `operations.md`.
 *
 * **Compare-and-swap on `version`, then patch.** `architecture/14` §14.2: the
 * write carries the version it read; if the row's version differs, the row
 * moved under the writer and the write is refused rather than applied on top.
 * The phone does not do the per-field compare the server does — it has no
 * second device to have raced — but it keeps the version discipline so the
 * outbox entry carries the right token when it drains.
 */

import { type UpdateTransactionInput, updateTransactionInput } from "@waltning/core/registry/inputs";
import { and, eq, isNull, sql } from "drizzle-orm";
import { defineLocalExecutor } from "../executor.ts";
import { ledgerSchema as schema } from "../schema-map.ts";
import type { LocalTx } from "../write.ts";
import type { LocalTransactionRow } from "./create-transaction.executor.ts";

const { transactions } = schema;
type ReplicaTx = LocalTx<unknown, typeof schema>;

export const updateTransactionExecutor = defineLocalExecutor<
  typeof updateTransactionInput,
  LocalTransactionRow,
  ReplicaTx
>({
  operation: "update_transaction",
  opVersion: 1,
  input: updateTransactionInput,
  mints: () => [],
  apply: (input, tx) => patchTransaction(input, tx),
});

function patchTransaction(input: UpdateTransactionInput, tx: ReplicaTx): LocalTransactionRow {
  const current = tx.select().from(transactions).where(eq(transactions.id, input.id)).get();
  if (!current) throw new Error(`update_transaction: no transaction ${input.id}`);
  if (current.deletedAt !== null) throw new Error(`update_transaction: ${input.id} is deleted`);
  if (current.version !== input.version) {
    throw new Error(
      `update_transaction: stale version — read ${input.version}, row is at ${current.version}`,
    );
  }
  const updated = tx
    .update(transactions)
    .set({
      ...input.patch,
      version: sql`${transactions.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(transactions.id, input.id), eq(transactions.version, input.version), isNull(transactions.deletedAt)))
    .returning()
    .get();
  if (!updated) throw new Error("update_transaction: the row changed between read and write");
  return updated;
}
```
Check how `updatedAt` is typed in the sqlite `stamp` column kit and match it (`new Date()` vs an ISO string).

- [ ] **Step 4: Implement `delete-transaction.executor.ts`** — same shape, `operation: "delete_transaction"`, `apply` sets `deletedAt: new Date()`, bumps `version`, refuses stale version and already-deleted.

- [ ] **Step 5: Register both** in `registry.ts`:
```ts
export const ledgerRegistry = localRegistry([
  createAccountExecutor,
  createTransactionExecutor,
  updateTransactionExecutor,
  deleteTransactionExecutor,
]);
```

- [ ] **Step 6: Run to verify**

Run: `npx vitest run packages/ledger`
Expected: all pass (including `recover.test.ts`, which replays by operation name).

- [ ] **Step 7: Commit** — `"update and delete, on the device — version-checked, soft, two-file"`.

---

### Task 3: `set_transaction_lines`, `supersede_transaction`, `categorize_batch`

**Files:**
- Create the three executors under `packages/ledger/src/transactions/`.
- Modify: `registry.ts`, `transaction-ops.test.ts`.

**Interfaces:** each exports `<name>Executor` typed like Task 2's; `supersedeTransactionExecutor.mints` returns `[input.replacement.id]`; `setTransactionLinesExecutor.mints` returns every `line.id`.

- [ ] **Step 1: Tests** (append to `transaction-ops.test.ts`):

```ts
describe("set_transaction_lines", () => {
  it("replaces the whole set, and refuses lines that do not sum to the transaction", () => {
    const v = () => readTxn()?.version;
    writeLocally(stores.ledger, { executor: setTransactionLinesExecutor, registry: ledgerRegistry, capture,
      input: { transactionId: TXN, version: v(), lines: [
        { id: "00000000-0000-4000-8000-0000000000a1", description: "Espresso", amount: "10" },
        { id: "00000000-0000-4000-8000-0000000000a2", description: "Croissant", amount: "8" },
      ] } });
    expect(stores.ledger.replica.db.select().from(ledgerSchema.transactionLines).all()).toHaveLength(2);
    expect(() => writeLocally(stores.ledger, { executor: setTransactionLinesExecutor, registry: ledgerRegistry, capture,
      input: { transactionId: TXN, version: v(), lines: [
        { id: "00000000-0000-4000-8000-0000000000a3", description: "Wrong", amount: "1" },
      ] } })).toThrow(/sum/);
    // The refused write left the previous two lines in place.
    expect(stores.ledger.replica.db.select().from(ledgerSchema.transactionLines).all()).toHaveLength(2);
  });
});

describe("supersede_transaction", () => {
  it("soft-deletes the old row and lands the replacement in one write", () => {
    const NEW = id<"transactions">("00000000-0000-4000-8000-000000000002");
    writeLocally(stores.ledger, { executor: supersedeTransactionExecutor, registry: ledgerRegistry, capture,
      input: { supersedesId: TXN, supersedesVersion: readTxn()?.version,
        replacement: { id: NEW, date: "2026-09-01", type: "expense", accountId: ACCOUNT, amountOriginal: "18.5", currency: PLN, payee: "Coffee", source: "import" } } });
    expect(readTxn()?.deletedAt).not.toBeNull();
    expect(stores.ledger.replica.db.select().from(transactions).where(eq(transactions.id, NEW)).get()?.amountOriginal).toBe("18.50000000");
  });
});

describe("categorize_batch", () => {
  it("sets one category on every named id and refuses an unknown one", () => {
    // insert a category row first (categories table; kind "expense", isLeaf true)
    // then categorize [TXN], assert categoryId set; then a batch naming a missing id throws and sets nothing
  });
});
```

- [ ] **Step 2–5:** implement each executor following Task 2's shape. Rules that must be checks:
  - `set_transaction_lines`: `Σ line.amount == transaction.amountOriginal` (use `money.sum`/`money.eq`, never `Number`); delete existing lines then insert — inside the one `tx`; version check on the transaction; bump its version.
  - `supersede_transaction`: version check on the old row; soft-delete it; insert the replacement via the same `insertTransaction`/`provisionalFxRate` logic as create — **import it**, do not copy it. `insertTransaction` is a module-private function at `create-transaction.executor.ts:64`; add `export` to it (and keep its name — A3's `reconcile_account` imports it too).
  - `categorize_batch`: every id must exist and be live and be income/expense (a transfer takes no category — the input's `.superRefine` rule); one `update … where id in (…)`; refuse if the affected count differs from `transactionIds.length`.

- [ ] **Step 6: Register, run `npx vitest run packages/ledger`, commit** — `"Lines, supersede and batch categorise, on the device"`.

---

### Task 4: Gate and PR

- [ ] `git add -A && pnpm verify` — green.
- [ ] Spec check: `operations.md`'s Transactions table needs no change; if any executor refuses something the table does not state (e.g. categorize refusing transfers), add one clause there.
- [ ] PR title *"The transaction operations the phone can run alone"*. Body quotes the card's *Done when* isn't stated — write one: *every op lands row + entry in the two-file commit, refuses a stale version, and a crash between stores leaves neither.* State that `attach_receipt` is server-only. End with the Claude Code footer.
