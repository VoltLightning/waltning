# 6 · Quality attributes and budgets

Numbers an implementer can fail against. Where a target exists in a screen or
flow spec, it is quoted rather than restated, so there is one source.

---

## Performance budgets

The hardware is a Raspberry Pi 4 over WireGuard, which is the binding constraint
on every figure below. These are **p95 on the target hardware**, not on a laptop.

This table is the source; `SPEC.md` §15 quotes its headlines rather than
restating them.

| Interaction | Budget | Source | Why this number |
|---|---|---|---|
| Quick add, voice → committed | **< 10 s** | J02 | Standing at a till. Past this, you stop using it |
| Dashboard first meaningful paint | < 800 ms | S01 | It is the app's front door |
| Simple ledger query (row fetch, filtered list) | < 100 ms | §15 | Small database; anything slower is a missing index |
| Any **aggregate** (period spend, category) | < 200 ms warm · < 400 ms cold | — | A different class from the above: grouping over 25k rows. Only stays fast because every index carries `WHERE deleted_at IS NULL` |
| Transaction search, trigram | < 300 ms | S10 | 2 100 days of history, trilingual corpus |
| Calendar month render | < 150 ms | S11 | Virtualized; continuous scroll must not stutter |
| Statement import, 300 rows | < 90 s end-to-end | J04 | Dominated by model latency, batched ~50/call |
| Receipt extraction, one pass | < 15 s | J03 | Background, queued — not blocking |
| Offline write → local ack | **< 50 ms** | J02 | The outbox must feel instant or capture fails |

**The one to defend hardest is the 10-second voice path.** It is the only budget
where missing it changes behaviour rather than perception — a capture tool that
is slower than a paper note stops being used, and then the ledger is incomplete,
which is the failure mode C19 shows already exists.

### What makes the aggregates hit their budget

Every aggregate index carries `WHERE deleted_at IS NULL` and `INCLUDE`s the
columns the aggregate reads, so scans are index-only. Without it, no aggregate is
index-only and a cold dashboard costs ~300 ms extra after any memory-pressure
event. `0004` adds `transactions_date_live`, `transactions_to_account_date` and
`transactions_debt_idx` for exactly this.

---

## Scale — the real numbers

| | Now | 5-year projection |
|---|---|---|
| Transactions | ~7 600 | ~25 000 |
| Accounts | 52 | ~70 |
| Categories | 15 groups / 59 leaves | stable |
| Currencies in use | **7** (USD, PLN, EUR, BYN, GEL, RUB, GBP) | 7–8 |
| FX rate rows | ~6 × 2 000 days | ~60 000 |
| Receipts | low thousands | tens of thousands |

**This is a small database, and the design should not pretend otherwise.** No
partitioning, no read replicas, no caching tier. The performance work that
matters is index shape and avoiding N+1 across the tRPC boundary — not
architecture. Anything that adds a moving part to serve 25 000 rows is
overbuilding, and `SPEC.md` §4.3 rejects Turborepo, GraphQL and Kubernetes on
exactly this basis.

---

## Correctness — the properties that must hold

Ordered by what a violation costs.

| Property | Enforced by | Verified by |
|---|---|---|
| No personal row reaches a tax output (T1) | View predicate + role privileges | `verify_t1()` — three falsifiable checks |
| No revenue row is silently omitted | — nothing prevents it | `verify_no_omitted_revenue()` |
| A closed period is frozen | `assert_period_not_closed` | The seven-case matrix in `defects.md` C16/C17 |
| `amount_pivot` never drifts from its inputs | Generated column | Free |
| Debt balance = negated cash flow | `debtDelta(tx, side)` | Property test, **both sides** |
| Money arithmetic is exact | `numeric(20,8)` + decimal.js | Property tests across all 7 currencies |
| Writes are idempotent under replay | Partial unique indexes on `external_id` | Replay the outbox twice in tests |

**Money is never a JS number.** Amounts cross the wire and the driver boundary as
decimal *strings*; `0.1 + 0.2` is the wrong answer in a ledger and five years
compounds it.

---

## Availability

**There is no availability target, and that is a decision.** One user, one Pi, no
SLA. If the Pi is down you use your phone's outbox and it syncs later — which is
why the outbox is a correctness feature rather than a convenience.

What *is* required is that unavailability never costs data:

| Failure | Behaviour |
|---|---|
| Pi down | Mobile keeps capturing to the outbox; replay on reconnect |
| FX provider down | Writes still succeed — last known rate carried forward, `fx_rate_estimated = true`, bounded carry window |
| Model provider down | Manual entry and every deterministic path unaffected |
| Postgres down | API returns errors; **no partial writes** — every multi-row operation is one transaction |

---

## Security posture

`SPEC.md` §5 is the policy. The attributes it produces:

| Attribute | Position |
|---|---|
| Attack surface | No public ingress. Nothing on the internet can initiate a connection |
| Authentication | Argon2id (~250 ms on the Pi) + **mandatory** TOTP, behind Tailscale |
| Authorization | Single user. The only privilege boundary is `waltning_export` |
| Secrets | Never in the app bundle; all model calls originate server-side |
| Data at rest | Receipt images age-encrypted before leaving the Pi; backups age-encrypted |
| Audit | Every write carries actor, before/after; agent writes additionally record approval and `auto` |
| Deliberately absent | mTLS (Tailscale already does mutual auth), WAF, IDS, secrets manager |

**The most-exposed content in the system is `agent_memory`**, because it is
prepended to every model turn. That is why it holds behaviour and never facts,
enforced by a `CHECK` rather than by a rule in prose, and why S32 exists to make
it inspectable.

---

## Accessibility

Fixed at the source rather than audited at the end: the 44 px target floor in
D1, reduced-motion branches in D4/D5, measured contrast in D12. `design-system/10-accessibility.md`
is the specification; D12 is a **pass**, not a phase — accessibility arriving
last as a single phase is how it gets cut.

---

## What is explicitly not a quality attribute

- **Multi-user.** Single user is a locked decision (§3). No per-row ownership, no
  sharing model, no roles beyond the export role.
- **Horizontal scale.** One Pi.
- **Sub-second model responses.** The loop surfaces are conversational; the
  pipelines are batched and backgrounded. Only the voice path has a hard latency
  budget.
- **Bit-identical model reruns.** Explicitly not claimed — see
  [`02-components.md`](02-components.md) on what "reproducible" means here.
