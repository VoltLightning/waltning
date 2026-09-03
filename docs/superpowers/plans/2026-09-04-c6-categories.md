# C6 · S19 Settings · Categories — Implementation Plan (wave 3b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Read `2026-09-04-wave-3-shared.md` first. Needs D3 (`SearchField`) merged.

**Goal:** The taxonomy can be maintained on the phone: rename, move, convert, archive, and merge with a preview that says what moves — with near-duplicates pointed out before they multiply.

**Architecture:** A fifth tab, **Settings** (`(tabs)/settings.tsx` → `settings-screen.tsx`: a list with one entry, *Categories*, for now; `TabBar` already takes five). Route `settings/categories.tsx` → `categories-screen.tsx`. Read: `readCategoryTree` plus a `usage` map — `readCategoryUsage(db) → Map<categoryId, count>` over live transactions and lines (one query). Writes through the port: `renameCategory`, `reparentCategory`, `convertLeafGroup`, `mergeCategories`, `archiveCategory` — `{id} | {fieldErrors}`; A3's refusals (cycle, kind mismatch, live references, sibling collision) become field errors on the sheet in play. Components in `packages/ui/src/categories/`: `CategoryTree` (groups collapsible, leaves indented, `Tag`s for count · archived · unused), `MergePreview` (a `ComparisonTable`: loser → winner, transactions and lines that move, rules that move), `CollisionFinder` (`MatchWarning` over sibling names with D2's `jaccard`/`trigrams` ≥ 0.6 — a reuse the spec asks for). Sheets over `BottomSheet`: rename (name), move (pick a group — a group-only mode of D4a's sheet if it has one, else a `Select`), merge (pick the winner among same-kind leaves → preview → confirm).

**Spec:** `screens/S19-settings-categories.md` §3, §4, §5, §6, §7 · `flows/J12-maintain-categories.md` · `TAXONOMY.md` R1, R2.

**Board cards closed:** *S19 · Settings · Categories* (and the Settings tab entry on the `expo-router` card, already closed — mention).

**Branch:** `feature/c6-categories` off `main`.

## Tasks

1. `readCategoryUsage` + tests (a four-line transaction counts once per category it touches — the §6 trap, restated for counts).
2. Port/controller: five writes, tests for each refusal reaching `fieldErrors`.
3. `CategoryTree`, `MergePreview`, `CollisionFinder` with stories.
4. Screen: search; tree with *Archived* toggle; long-press or a trailing `IconButton` opens the actions sheet (Rename · Move · Convert · Merge · Archive); `Uncategorized` apart with its count (the trend and *Review with agent* are arc-full — say so); collisions listed above the tree.
5. States (§6: refusals inline naming the sibling; offline is not modelled), tests, gate, PR *"The taxonomy, maintained on the phone"*; quote *Done when*.
