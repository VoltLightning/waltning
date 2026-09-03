# A4 · Replica and outbox durability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two board cards become true and provably so: *the replica holds the whole ledger — no eviction, no TTL* and *outbox: `seq` ordering, auto-derived `deps`, `sending`→`pending` on launch*. Most of the second already exists in `recover.ts` and `outbox.ts`; this plan **verifies each claim with a test that breaks it**, closes the gaps, and deletes anything that still prices the replica as a cache.

**Architecture:** Audit-then-pin. No new subsystem.

**Spec:** design §3 A4 · `architecture/14` §14.1, §14.3, §14.6 · `architecture/08` (surviving an app update; outbox rules 1–6) · `SPEC.md` §5.7.

**Board cards closed:** both named above. PR #33 is superseded — say so in the PR body and ask the owner to close it.

## Global Constraints

As A2. Branch `feature/a4-durability` off `main`.

---

### Task 1: Find anything that evicts or expires

- [ ] `grep -rn "ttl\|TTL\|evict\|expire\|90 day\|ninety" packages/ledger packages/client apps/mobile/src docs/specification/architecture/14-local-first.md SPEC.md` — list every hit. For each in code: delete it and its test, or turn it into a "never" test. For each in spec: rewrite the sentence so it states the replica holds the whole ledger (do not leave "was 90 days"). Expected: the code has none (the ledger is new); the spec may still carry the cache-era wording.
- [ ] Logout: find the session/logout path in `apps/mobile` or `packages/client` (`grep -rn "logout\|signOut\|session"`). If a logout exists and touches the ledger, remove that; if none exists yet, write the test as a **contract**: `packages/ledger/src/test/durability.test.ts` — *"the session module exports nothing that names the replica or outbox paths"* is not testable meaningfully; instead assert `createLocalLedgerSession`'s `close()` closes handles and deletes no file (open both files, write a row, `close()`, reopen, row present).
- [ ] Commit: `"The replica is the record, not a cache — nothing evicts it"`.

### Task 2: Pin the outbox ordering claims

In `packages/ledger/src/test/outbox.test.ts` (extend) or `durability.test.ts`:

- [ ] **`seq` is monotonic across a reopen** — claim seq 1..3, `reopen()`, claim again → 4 (not 1, not `max+1` after a delete: delete entry 3, claim → 5).
- [ ] **`deps` are derived, never trusted from the payload** — write a transaction naming an account minted in this outbox; assert `deps` contains that entry's id; write one naming an account that was never minted here (server-known); assert `deps` is empty. (If `executors.test.ts` already covers this, reference it and add only the reopen case.)
- [ ] **`capturedAt` is display-only** — two entries written with `capture.at` in reverse order still drain in `seq` order: assert `recoverOnLaunch` replays by `seq`, not by `capturedAt`.
- [ ] **`sending` → `pending` on launch** — mark an entry `sending`, `reopen()`, assert `pending` and `recoverOnLaunch().requeued` names it. (`recover.test.ts` may cover this — verify, don't duplicate.)
- [ ] Commit: `"Order is seq, deps are derived, sending never strands — pinned"`.

### Task 3: A replica offline for months

- [ ] `durability.test.ts`: write 2 000 transactions across 3 accounts with dates spanning 14 months; `reopen()`; assert `readAccounts` balances equal a fold over all 2 000 rows and `readRecent(5)` returns the 5 newest — nothing dropped by date. Time it; if the reopen + fold takes over 500 ms on the test machine, note it in the PR as a finding for `#e8`, do not optimise here.
- [ ] Commit: `"Fourteen months of rows survive a reopen"`.

### Task 4: Spec, gate, PR

- [ ] `architecture/14` §14.3: if it still sizes "offline storage" as a bounded window, restate as *the whole ledger; the phone's storage is the ledger's size*.
- [ ] `git add -A && pnpm verify`.
- [ ] PR *"The replica is the record — and the outbox drains in order"*; quote both *Done when*s; say PR #33 is superseded and why (its two findings remain valid and are quoted).
