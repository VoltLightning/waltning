# Build order

`SPEC.md` §16 phases the *system*. `design-system/12-build-order.md` phases the
*component layer*. They were written independently, neither referenced the
other, and the closing note of the second says so outright. This file is the
single sequence, and it reorders both.

Two sentences of rationale before the table, because the ordering is not
arbitrary and the disagreements with §16 are the useful part:

**Order by irreversibility, not by size.** A wrong reading of the export costs
five years of history and is discovered months later. A wrong empty state costs
an afternoon. Everything that is expensive to be wrong about goes first, even
when it is small — and the smallest item in this whole plan, a 40-line probe
script, gates the largest.

**Order by what a delay actually costs.** §16's tail is not risky, so its
sequencing is free; its head is entirely risk, so its sequencing is the plan.

---

**The task-level layer is the board**, in the private vault: 166 cards across 17
lanes, derived from this specification rather than from memory — 31 screens, 110
operations, 13 component phases, 15 computations, 11 migration steps, and all 17
journeys as acceptance gates. This document is *why* and *in what order*; the
board is *what*, at a size you can pick up on a Tuesday evening.

## The critical path

Everything else is schedulable around this. These five are strictly serial and
each one invalidates the next if wrong.

| # | Item | Why it is on the path | Cost |
|---|---|---|---|
| **1** | ~~Run `probe.py` against the `.mmbak`~~ **done — Reading A confirmed at 100%** | 1,680 of 1,680 OUT legs pair with an IN leg on the named destination. `extract.py`'s assumption holds and every destination is credited. It also surfaced one blocking finding that had never been visible: 173 debt reassignments that net to zero (C18, §6.6a) | ✅ |
| **1b** | Resolve the 173 reassignment counterparties | Names are prose in three languages, in the import review queue. Unresolved rows import as zero-effect, which is their behaviour today — so this gates *fidelity*, not the migration | ~1 hr |
| **1c** | ~~Reconcile against the bank~~ **done** | `Saldo po transakcji` in the Bank A `.xls` exports is a balance computed by the bank. 98 ledger rows match on *signed* amount — external corroboration of `SIGN`. It also showed 169/246 and 35/56 bank rows missing from Money Manager: the ledger is faithful and **partial** (C19) | ✅ |
| **2** | Type 52 balances off the Money Manager UI into `accounts.expected_balance` | The gate had no independent right-hand side, so it evaluated `(computed − Σ) + Σ = computed` and printed `0,00` down all 52 rows regardless of correctness (§8.4). `ZASSET.ZLEFTMONEY` was checked as a free substitute and is `0.00` on all 52 accounts — unused. These are genuinely the only figures our extractor did not compute | ~1 hr |
| **3** | Run the migration; both gates must pass | Both derivations, not one. Agreement between two sides that share an assumption is decoration | 1 day |
| **4** | Auth and perimeter — **Phase 0.5**, see below | Real financial data exists from step 3 onward | 2–3 days |
| **5** | FX backfill to ≥95% coverage per active currency | Every `amount_pivot` is generated from a rate, and a rate absent at write time is not repaired by a later sync. GEL sat at 0.5% coverage for months unnoticed | 1 day |

Steps 1–3 are §16's Phase 0 with the two things that made it falsifiable added.
The rest of this document is schedulable; these five are not.

---

## Phase 0.5 — the perimeter, before any listener binds

**This is the substantive change to §16.** §5.1 and §5.2 specify the access
model and the authentication behind it in full detail — Argon2id tuned to the
Pi, mandatory TOTP, server-side sessions, `expo-secure-store` on mobile. Neither
appears in **any phase**. Tailscale first appears in Phase 7, week 15.

So as written, the plan puts five years of real financial history into a dev
stack in week one and builds an API, a mobile client and an agent against it for
roughly thirteen weeks before a perimeter exists. The exposure is not
theoretical: `POSTGRES_USER` is a superuser, `createDb()` defaults to it, and a
laptop on a café network is one `docker compose up` away from binding
`0.0.0.0`.

The fix is cheap because the design work is already done — it is scheduling, not
design:

| | |
|---|---|
| **Tailscale on the dev machine, and bind to the tailnet interface only** | Half a day. Do it before the importer runs, not before deployment |
| **Auth per §5.2** | 2 days. TOTP is the only part with real work in it |
| **Postgres: a non-superuser application role** | An hour, and it is also a prerequisite for `0005` meaning anything — a superuser bypasses every GRANT, so T1 is unenforceable until the app stops being one |
| **`0005_tax_ledger_roles.sql` applied, `verify_t1()` green** | Included above |

Cost of doing it now: ~3 days. Cost of retrofitting auth into an app with a
mobile client, an offline outbox and an agent session model: substantially more
than 3 days, and the exposure window is the real price either way.

---

## The reconciled sequence

`D` = component phase from `design-system/12-build-order.md`. `P` = system phase
from §16.

| Week | System | Components | Gate |
|---|---|---|---|
| **0** | Critical path 1–3 · migration | — | Both gates pass on independent right-hand sides |
| **0** | **P0.5** perimeter + auth | — | `verify_t1()` returns three trues; the app role is not a superuser |
| **1** | P1 API skeleton, operation registry (§11.0) | **D0** tokens + `Amount`/`FxAmount`/`TransferAmount` | `FxAmount` cannot compile without a rate |
| **1–2** | P1 read paths — balances, net worth, period spend | **D1**, **D2** | `computations.md` §§1–6 return the same numbers as the gate |
| **2–3** | P1 dashboard, search, reports · **revenue fields** | **D4**, **D5**, **D6**, **D10** | You trust the numbers on sight |
| **3–5** | P2 mobile — entry, accounts, offline outbox | **D7** calendar, **D8** debt | Replaces daily Money Manager use |
| **5–6** | P3 receipts | **D3** `DiffCard` | Faster than typing it in |
| **6–9** | P4 import — parsers, rules, classification | (D3, D4 already built) | A month of statements in minutes |
| **9–11** | P5 agent — registry → tools, gates, memory | (D3 again — **one gate, three call sites**) | Answers what needs Excel today |
| **11–12** | P6 export — workbook, PL adapter, manifest | **D9**, **D11** | Manifest assertion is checked against `verify_t1()`, not restated |
| **12–13** | P7 cutover — Pi, backups, restore drill | **D12** accessibility pass | Money Manager read-only; a restore drill actually run |

**Total: 13 weeks**, against §16's 15–17. The reduction is not optimism; it is
three specific removals, below.

### Where the D-phases actually land

§16's Phase 1 has no component layer under it, and D13 ("screens, in journey
order") is not a phase at all — it is what every system phase spends most of its
time doing. So:

- **D0–D2 are Phase 1's first week**, not a prerequisite block before it. They
  are ~4 days of work and blocking a fortnight of API work behind them is idle
  time on both sides.
- **D3 moves earlier than either plan puts it.** `DiffCard` has three call
  sites — agent, voice, receipt — in Phases 3, 5 and 2 respectively. Whichever
  arrives first builds it; the design-system order says D3 (fourth), §16 implies
  Phase 3. Build it with the first consumer, which is receipts.
- **D9 stays early despite being administrative.** `SyncLog`'s coverage view is
  what would have caught GEL at 0.5%, and it is worth having before the ledger
  fills rather than after. This is the one place the component order is right and
  the system order is wrong.
- **D12 is a pass, not a phase** — as its own file says. The 44px floor is fixed
  in D1 and reduced-motion in D4/D5; D12 measures what those missed. Accessibility
  arriving last as a single phase is how it gets cut.

---

## Three things to not build

Efficiency is mostly subtraction. Each of these is specified somewhere and each
should be deleted rather than scheduled.

**`db:push`.** It cannot see triggers, views, grants or generated columns —
which after `0003`, `0004` and `0005` is most of what the schema's guarantees
consist of. A push that silently drops `assert_period_not_closed` leaves a
database that looks right and enforces nothing. Migrations only.

**A second derivation of anything already in `computations.md`.** Every figure
the interface promises is defined there once. The failure mode this avoids is
specific: `spend_by_category` written as a `LEFT JOIN … COALESCE` over
`transaction_lines` counts a four-line transaction four times, and the result
looks plausible enough to ship. One definition, one implementation, referenced.

**Per-jurisdiction adapters beyond PL.** §13.2 makes them data — a scheme, its
lines, and the mappings. Writing the US and DE adapters before either is needed
is building against a guess at their shape; the point of the projection design
is that adding one later is an insert, not a phase.

---

## What can run in parallel, and what cannot

The plan above assumes one person working evenings. Two observations if that
changes:

**Parallelizable:** the component layer (D0–D11) against the API, since the
contract between them is the operation registry and it is written down (§11.0).
Also the parsers in P4 — each bank format is independent and testable against
fixtures.

**Not parallelizable, and the usual mistake:** classification quality work
before the ledger has history in it. The retrieval tier hands the model *the k
most similar prior payees from your own ledger* — with an empty ledger it
degrades to a generic classifier and every measurement taken then is measuring
the wrong system. Score it after P0, never before.

**Deceptively serial:** the agent phase reads as one block but is two. The
registry-to-tools generation is mechanical and fast; the approval UX is where
§16's own note says the estimate is least certain. Build the tool surface early
enough that the UX has weeks to be wrong in, rather than treating the phase as
atomic.

---

## The one gate that still needs you

The probe has been run. Reading A is confirmed at 100%, six other assumptions
hold, and the exercise found C18 — 173 debt reassignments that net to zero and
were therefore invisible to every check in the system. Everything in the defect
register is now closed in code or in the specification.

One input remains, and it is not a decision:

**52 balances**, read off the Money Manager UI and typed into
`accounts.expected_balance`. Tedious, about an hour. Two substitutes were tried
and neither replaces it: `ZASSET.ZLEFTMONEY` is `0.00` on all 52 accounts, and
the bank statements cover 2 accounts over 4 months — enough to corroborate the
sign map, not enough to gate 52 balances over five years.

What the bank check *did* establish is that the gate was measuring the wrong
thing on its own. Fidelity is now externally corroborated; **completeness is
not**, and 169 of 246 real transactions on `Bank A · PLN` are missing from the
ledger (C19). Type the balances to close fidelity, and treat the sync tooling as
permanent rather than a migration step.

Resolving the 173 reassignment names is the other piece of human work, but it
does not gate the migration: unresolved rows import as zero-effect rows keeping
their description, which is exactly what they do in Money Manager today. It can
happen in the review queue afterwards.
