# C5 · S09 Transaction detail — Implementation Plan (wave 3b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Read `2026-09-04-wave-3-shared.md` first. Needs D3 (`DateField`) and D4a (category sheet) merged; composes with C4's rows when both are in.

**Goal:** Tap a row and see everything the ledger knows about it; change any field in place and save a versioned patch; split it into lines; delete it softly.

**Architecture:** Read `packages/ledger/src/transactions/read-transaction.ts`: `readTransaction(db, id) → LocalTransactionDetail | null` — the row (every column S09 §3 shows, with account and category names and `version`) plus its `lines`. Exposed as `controller.getTransaction(id)` (a query, not snapshot state). Writes through the port: `updateTransaction(id, version, patch)`, `deleteTransaction(id, version)`, `setTransactionLines(id, version, lines)` — all `{id} | {fieldErrors}`; a stale-version refusal lands at form level with `transactions.changedElsewhere`. Route `apps/mobile/app/transaction/[id].tsx` → `apps/mobile/src/transaction-detail-screen.tsx`. Components in `packages/ui/src/transactions/`: `TransactionHero` (display-hero amount, account · currency line), `FieldsCard` (each field a `Chip`-styled row that opens its editor: category → sheet; account → `Select`; date → `DateField`; scope → `Toggle`; payee, note → `TextField`), `LinesCard` (breakdown: rows of description · amount · category, *+ Add*, live sum vs total, refusal on mismatch).

**Spec:** `screens/S09-transaction-detail.md` §3 mobile, §4, §5, §6, §7 · `SPEC.md` §6 (lines, supersede) · `architecture/14` §14.2 (version).

**Board card closed:** *S09 · Transaction detail*.

**Branch:** `feature/c5-transaction-detail` off `main`.

## Tasks

1. **`readTransaction`** + tests (with lines; deleted → null).
2. **Port/controller** three writes; tests for a stale version and a lines sum mismatch reaching `fieldErrors`.
3. **Hero, fields, lines** components with stories.
4. **Screen**: view → edit per field → *Save* sends only changed fields (the executor refuses an empty patch — the button is disabled until something changed); *Delete* (`Button(danger)`) → `deleteTransaction` → back to the caller with a `Toast` (no undo; the shared plan says why and names the follow-up card). `FxAmount` block and receipt/history cards **not built** (no rates, no receipts, no audit log on the phone) — the layout leaves no gap for them.
5. **Navigation**: `TransactionList` rows take an `onPress(id)`; C2's Recent and C4's list push `/transaction/[id]`; back returns to the caller.
6. **States, gate, PR** *"What the ledger knows about one transaction"*; quote *Done when*.
