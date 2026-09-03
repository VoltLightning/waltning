# D4a · S06 Category sheet — Implementation Plan (wave 3a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Read `2026-09-04-wave-3-shared.md` first.

**Goal:** Picking a category is one sheet used everywhere: from Quick add, from a ledger row's swipe, from the detail screen. It searches, filters by group, proposes from memory with honest confidence, and can create a leaf in place.

**Architecture:** `packages/ui/src/categories/category-sheet.tsx` — `CategorySheet({ visible, tree, proposal?, onPick(categoryId), onCreate?(draft), onDismiss, kind })` over `BottomSheet`; pure presentation over a `LocalCategory[]` tree (A3's `readCategoryTree`). The **proposal** comes from D2 — the caller runs `proposeCategory(payee, history)` and passes the result; the sheet shows it at the top with the §14 marker when `confidence < 0.85`. New folder `categories` in `packages/ui/src` (allowlist). The phone controller exposes `listCategoryTree()` (full tree, not only leaves) and `createCategory(draft)` (A3's executor) — see the shared plan's rule 3. `QuickAddForm`'s category `Select` is replaced by a field that opens this sheet.

**Spec:** `screens/S06-category-sheet.md` §3 mobile, §4, §5, §6, §7 · `computations.md` §14 (0.85 marker) · `TAXONOMY.md` R1 (kind pairs with type) · `flows/J12` (create in place).

**Board card closed:** *S06 · Category sheet*.

**Branch:** `feature/d4a-category-sheet` off `main`. If D3 has merged, use its `SearchField`; if not, a `TextField` named `search` with the same props, and say so — D3 swaps it in a one-line follow-up.

## Tasks

1. **Reads and writes on the port.** `session.listCategoryTree()` → `readCategoryTree`; `session.createCategory(input, capture)` → `createCategoryExecutor`; port + controller (`createCategory(draft) → {id} | {fieldErrors}`; refusals: a sibling with the same name — A3's executor message — lands on `name`). `PhoneLedgerSnapshot.categoryTree`. Tests.
2. **The sheet.** Grabber, search (live, over folded names — D1's `fold`), group chips (leaves filtered by the chosen group; counts on the chip from a `usage` map the caller passes, optional), a two-column grid of leaves (≥44px targets, `role="radio"` in a `radiogroup`), `Uncategorized` as a muted row at the bottom, pinned footer with `+ New` (secondary) and `Use "‹leaf›"` (primary, enabled once a leaf is selected). Selecting a leaf returns immediately per §7; the footer's primary exists for the keyboard path. Proposal row at the top when given: the proposed leaf, `confidence` as a `Tag`, and the marker below 0.85 (`categories.lowConfidence`). `EmptyState(filtered)` inside a group offers *Create "‹query›"* scoped to that group. Every word through `useT()`.
3. **Create in place.** `+ New` opens an inline row (name `TextField`, group = the chosen chip or none) → `onCreate`; the screen calls `createCategory` and, on `{id}`, picks it. Field errors under the row.
4. **Wire Quick add.** `QuickAddForm`'s category becomes a `Select`-looking field that opens the sheet; the screen computes the proposal from `readPayeeHistory` when a payee exists (B3 has no payee field — add none; pass no proposal; the hook stays for D4b). Tests for the form path and the screen.
5. **Gate and PR.** Stories: `Browsing`, `Searching`, `GroupFiltered`, `WithProposal`, `LowConfidence`, `FilteredEmpty`, `Creating`. PR *"One sheet to pick a category, everywhere"*; quote the card's *Done when*.
