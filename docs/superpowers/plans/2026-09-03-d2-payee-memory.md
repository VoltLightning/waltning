# D2 · Tier 1.5 — on-device payee→category memory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Given a payee string and the ledger's history, propose a category with a confidence: exact normalised payee → its last category (confidence 1.0); else trigram kNN over prior payees with **neighbour-agreement** confidence, exactly `computations.md` §14. No model.

**Architecture:** Pure in `packages/core/src/capture/payee-memory.ts`: `proposeCategory(payee, history, k = 7)`. `history` is `readonly { payee: string; categoryId: string; date: AccountingDate }[]` — the reader that produces it from the replica is `packages/ledger/src/transactions/read-payee-history.ts` (distinct payee → last category and date, live rows only, income/expense only). Trigrams over the folded payee (D1's `fold`); similarity = Jaccard over trigram sets; kNN takes the k most similar with similarity ≥ 0.2; confidence = share of the k that carry the proposed (plurality) category; below `0.85` the screen shows the marker (§14's threshold) — the function returns the number and the screen decides.

**Spec:** design §3 D · `computations.md` §13 Search (trigram normalisation), §14 Confidence (the formula and the 0.85 display threshold).

**Board card closed:** *Tier 1.5 — on-device payee→category memory*.

## Global Constraints

As D1. Branch `feature/d2-payee-memory` off `main`. **Depends on D1's `fold()`** — if D1 has not merged, copy `fold` into `payee-memory.ts` with a comment naming D1 and de-duplicate in the rebase; do not block on it.

---

### Task 1: Trigrams and similarity

`packages/core/src/capture/trigrams.ts`: `trigrams(s: string): ReadonlySet<string>` (padded `  s ` per §13), `jaccard(a, b): number`. Tests: `"coffee"` vs `"coffe"` > 0.6; `"coffee"` vs `"taxi"` < 0.1; identical → 1. Commit.

### Task 2: `proposeCategory`

```ts
export type PayeeHistoryRow = { payee: string; categoryId: string; date: AccountingDate };
export type CategoryProposal = { categoryId: string; confidence: number; basis: "exact" | "neighbours"; neighbours: readonly { payee: string; similarity: number }[] } | null;
export function proposeCategory(payee: string, history: readonly PayeeHistoryRow[], k?: number): CategoryProposal;
```
Tests (all with placeholder payees — `Coffee House`, `Bank A`): exact fold match → `basis: "exact"`, confidence 1; `"Coffe House"` with 5 of 7 neighbours in `groceries` → `confidence ≈ 0.714`; no neighbour above 0.2 → `null`; ties broken by most recent `date`; empty history → `null`. Commit `"A category from memory, with honest confidence"`.

### Task 3: The reader

`packages/ledger/src/transactions/read-payee-history.ts`: `readPayeeHistory(db, limit = 2000): readonly PayeeHistoryRow[]` — `select payee, category_id, max(date)` grouped by folded payee over live income/expense rows with a category, newest first. Test on `scratchLedger()`. Commit.

### Task 4: Gate and PR

`pnpm verify`. PR *"The phone remembers where a payee usually goes"*; quote the card; state the 0.85 threshold is the screen's to apply (S05/D4 wires it).
