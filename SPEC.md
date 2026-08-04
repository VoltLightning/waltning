# Waltning — System Specification

A self-hosted personal finance system: React Native app, web dashboard, receipt
scanner, statement import, and an LLM agent over a Postgres ledger you own.

Replaces [RealByte Money Manager](https://www.realbyteapps.com/) and the
`mm-tools` Python pipeline in `../accounting`.

**Status:** specification. No implementation committed.
**Last updated:** 2026-08-04

---

## Table of contents

1. [Purpose and context](#1-purpose-and-context)
2. [Goals and non-goals](#2-goals-and-non-goals)
3. [Decisions locked](#3-decisions-locked)
4. [Architecture](#4-architecture)
5. [Security and network design](#5-security-and-network-design)
6. [Data model](#6-data-model)
7. [Money and FX semantics](#7-money-and-fx-semantics)
8. [Migration from Money Manager](#8-migration-from-money-manager)
9. [Statement ingestion](#9-statement-ingestion)
10. [Receipt capture](#10-receipt-capture)
11. [The agent](#11-the-agent)
12. [Reporting and Excel export](#12-reporting-and-excel-export)
13. [Tax reporting — multi-jurisdiction](#13-tax-reporting--multi-jurisdiction)
14. [Application surface](#14-application-surface)
15. [Non-functional requirements](#15-non-functional-requirements)
16. [Phasing and estimates](#16-phasing-and-estimates)
17. [Open decisions](#17-open-decisions)
18. [Risks](#18-risks)
19. [Appendix A — Money Manager data inventory](#appendix-a--money-manager-data-inventory)
20. [Appendix B — Glossary](#appendix-b--glossary)

---

## 1. Purpose and context

### 1.1 The situation

Five years of financial history — 7,874 transactions from November 2020 — live
in RealByte Money Manager on an iPhone. The app has no API, no bulk edit, and
limited export. Everything beyond single-transaction entry currently happens
through `mm-tools`, a Python toolkit that reads the app's `.mmbak` (Core Data
SQLite) backup, classifies bank statements with an LLM, reconciles them against
the backup, and emits a TSV that gets sideloaded back onto the phone.

That pipeline works, and its hard parts — the classifier, the reconciliation
logic, the duplicate detector, the statement parsers — are worth keeping. What does
not work is the shape: a file-based batch process wrapped around an app that
resists automation, with a manual sideload at the end and no way to ask the
data a question.

### 1.2 Why not a commercial app

Assessed August 2026. No product on either store meets the requirements at this
account count and currency model:

- **Bank-linking apps** (Monarch, Copilot, Simplifi) aggregate US and Canadian
  institutions. The accounts here are Polish, Georgian, and Belarusian.
- **AI-native trackers** — [Rolly](https://rollyapp.ai/) is the closest (iOS,
  Android, web, macOS, chat agent, receipt scan, multi-currency wallets) but
  offers no documented API, no bulk import path for 7,874 historical rows, and
  no evidence of per-transaction dual-currency amounts.
- **[Finny](https://getfinny.app/)** handles 150+ currencies with per-transaction
  original amounts, but is iOS-only — no desktop counterpart.
- **Self-hosted** — [Firefly III](https://docs.firefly-iii.org/) is the closest
  architecture (double-entry, multi-currency, REST API, an
  [MCP server](https://github.com/etnperlong/firefly-iii-mcp), an
  [iOS client](https://apps.apple.com/us/app/abacus-for-firefly-iii/id1627093491))
  but receipt OCR is a third-party bolt-on and there is no integrated agent.

Building is defensible because the expensive parts already exist in `mm-tools`.

### 1.3 The three binding constraints

Everything in this document traces back to these:

1. **Dual-currency per transaction.** Every row carries a local amount *and* a
   reporting-currency amount. Seven currencies in use and **no single reporting
   currency** — display currency is a toggle (§7.0). PLN is 51% of volume, BYN 30%.
2. **52 active accounts.** Consumer apps assume 3–8 wallets.
3. **Institutions no aggregator covers.** Seven institutions across three
   countries, only one of which any aggregation service supports. Statement
   export is manual today and will stay manual.

> **Naming convention.** Institutions are referred to by role throughout —
> `BANK-A` (primary, personal and business), `BANK-B` (secondary domestic),
> `NEOBANK`, `FX-BANK-1/2` (foreign), `CARD-C` (regional cards). Account
> examples use the same convention. The mapping to real institutions is kept
> out of this repository.

---

## 2. Goals and non-goals

### 2.1 Goals

| # | Goal | Measure of success |
|---|---|---|
| G1 | Own the data outright | Postgres on hardware in the flat; full export at any time |
| G2 | Retire Money Manager entirely | All 7,874 rows migrated; balances reconcile to the cent |
| G3 | Capture spend in under 10 seconds | Receipt scan or quick entry, offline-capable |
| G4 | Make monthly import routine | A month of statements processed in minutes, in-app |
| G5 | Answer questions without exporting | Agent handles what currently requires Excel |
| G6 | **Never report a personal expense** | Tax outputs structurally cannot contain non-business rows (§13.1) |
| G7 | Support more than one tax jurisdiction | PL now; US and DE addable without touching the ledger (§13.2) |
| G8 | Make FX cost visible | The gap between the bank's rate and the reference rate is a figure you can total, not an invisible leak (§7.5) |
| G9 | See everything in Excel | Exports that open in Excel and look right |

### 2.2 Non-goals

Explicitly out of scope. Each is a decision, not an oversight.

| # | Non-goal | Why |
|---|---|---|
| N1 | **Be the legal book of account** — in any jurisdiction | §13.5 — three regulatory targets, each moving independently |
| N2 | **Issue invoices** — KSeF, ELSTER, or otherwise | Certified integrations; each is a product in itself |
| N3 | **Generate statutory filings** — JPK_PKPiR, JPK_V7, Anlage EÜR, Schedule C XML | Follows from N1 |
| N4 | Bank API / PSD2 aggregation | Requires TPP licensing; these banks have no consumer API |
| N5 | Multi-user, sharing, permissions | Single user (§3) |
| N6 | Investment performance tracking | The `Crypto` account is a balance, not a portfolio |
| N7 | **Envelope budgets** | Replaced by targets (§14.7) — a monthly figure with progress, not per-category envelopes with rollover |
| N8 | Public SaaS, other people's data | Personal system; shapes every security tradeoff |

---

## 3. Decisions locked

| Decision | Choice | Rationale |
|---|---|---|
| Hosting | Raspberry Pi in the flat, Docker Compose | Physical custody of the data |
| Network access | **Tailscale only** — no public ingress | §5 |
| Database | PostgreSQL 16 | Exact numerics, real constraints, one dependency |
| Language | TypeScript end to end | One language across API, web, mobile |
| Repo | Monorepo, pnpm workspaces | Shared types; `pnpm deploy --filter` for lean Pi images |
| Mobile | Expo (React Native) | iOS today; Android free if ever wanted |
| Web | React Native Web via Expo | One codebase; revisit if the dashboard fights it (§14.6) |
| Scope vs Money Manager | Core parity + receipts, import, agent | Skip budgets, goals, tags (0 rows used) |
| Users | Single | No auth complexity, no per-row ownership |
| Tax posture | Feeder and reconciler, not the book | §13.5 |
| Tax jurisdictions | Pluggable adapters — PL live, US and DE specified | §13.2 |
| Currency | **No main currency.** USD pivot for rate storage; display currency is a header toggle | §7.0 |
| FX rates | Reference rates synced on app open; realized rates from actual amounts; manual override at three levels | §7.3, §7.6 |
| Personal expenses | Structurally excluded from every tax output | §13.1 |
| Apr–Aug 2026 gap | Entered manually in Money Manager first | Migration runs against a later backup |

---

## 4. Architecture

### 4.1 Topology

```
┌─ iPhone (Expo) ────────┐   ┌─ Laptop browser ──────┐
│  Quick entry           │   │  Dashboard, import    │
│  Receipt camera        │   │  review, reports      │
│  Agent chat            │   │  Agent chat           │
│  SQLite outbox         │   └───────────┬───────────┘
└───────────┬────────────┘               │
            │        tRPC over HTTPS     │
            └──────────────┬─────────────┘
                           │
              ╔════════════▼═════════════╗
              ║   Tailscale (WireGuard)  ║   no public ingress
              ╚════════════┬═════════════╝
                           │
              ┌────────────▼──────────────────────┐
              │  Raspberry Pi · Docker Compose    │
              │                                   │
              │  caddy ─── api (Hono + tRPC)      │
              │              ├── ledger           │
              │              ├── import           │
              │              ├── receipts         │
              │              ├── agent            │
              │              └── export           │
              │                    │              │
              │  postgres:16 ──────┘              │
              │  minio (receipt images)           │
              └───────────────┬───────────────────┘
                              │ outbound only
                    ┌─────────▼──────────┐
                    │  api.anthropic.com │
                    │  claude-opus-5     │
                    │  FX rate provider  │
                    └────────────────────┘
```

### 4.2 Repository layout

```
waltning/
├── packages/
│   ├── db/           Drizzle schema, client, money helpers
│   └── core/         shared domain types, Zod schemas    [extract at Phase 2]
├── apps/
│   ├── api/          Hono + tRPC server
│   └── mobile/       Expo — iOS and web from one codebase
├── tools/
│   └── migrate-mm/   one-shot Money Manager importer
├── docker/           Compose files, Caddyfile, Pi deployment
└── docs/             this spec, runbooks, ADRs
```

**Internal packages export TypeScript source directly.** No `dist/`, no
`composite`, no TS project references — `tsx`, Metro, and Vite each transpile
workspace source natively. `tsc` runs as a typechecker, not a build
orchestrator. This removes an edit-rebuild-run cycle from every change, and an
entire class of stale-build bug with it.

`packages/core` is created when a second consumer exists (Phase 2), not before.
Until then its contents live in `packages/db`, and hoisting them out is a file
move plus an import path.

### 4.3 Stack and rationale

| Layer | Choice | Why this, not the obvious alternative |
|---|---|---|
| HTTP | Hono | Smaller and faster than Fastify on ARM; runtime-agnostic |
| API contract | tRPC | End-to-end types across mobile and web with zero codegen. REST would need OpenAPI plus a generator |
| ORM | Drizzle | SQL you can read, migrations you can review. Prisma's engine binary is a liability on ARM |
| Validation | Zod | Shared client/server; tRPC-native |
| Money | `numeric(20,8)` + decimal.js | Floats are wrong in a ledger. Scale 8 covers crypto |
| Mobile | Expo | Managed workflow, EAS builds; camera and secure-store solved |
| Blobs | MinIO | S3 API locally; swap to real S3 for offsite without code change |
| Reverse proxy | Caddy | Automatic TLS, trivial config |
| Packages | pnpm | Strict deps catch phantom imports before the Pi does; `pnpm deploy --filter` emits a self-contained API image |

**Deliberately not adopted:** Turborepo and Nx (four packages, no CI — nothing
to cache); GraphQL (one consumer; tRPC is strictly less machinery); Kubernetes
(it is one Raspberry Pi).

---

## 5. Security and network design

Five years of complete financial history, plus business records. The threat
model is not "a determined attacker targets me" — it is "this ends up reachable
from the internet and something automated finds it."

### 5.1 Access model — Tailscale only

The Pi has **no public ingress**. No port forwarding, no dynamic DNS, no
tunnel. Devices join a private WireGuard mesh; anything not enrolled cannot
route to the service at all.

This is categorically stronger than ngrok with good authentication, not
incrementally. A public URL means the login page is the entire perimeter and is
exposed to background scanning permanently. With Tailscale there is no login
page to find, and authentication becomes defense in depth rather than the only
line.

| Property | How |
|---|---|
| Transport | WireGuard, mutually authenticated; keys never leave devices |
| Identity | Tailscale SSO; device enrollment explicit and revocable per device |
| TLS | Tailscale-issued certs for `waltning.<tailnet>.ts.net`, auto-renewed by Caddy |
| Segmentation | Tailscale ACLs restrict the tailnet to this service on this port |
| Key rotation | Node key expiry left **on**, forcing periodic re-auth |
| Lost device | Revoke that node in the admin console — no password reset, no re-issue |

**Consequence to accept:** every device that uses Waltning must run Tailscale.
No borrowing an unenrolled laptop. If that becomes a real constraint, the
escape hatch is a Cloudflare Tunnel with Zero Trust in front — added
deliberately, not as a default.

**Worth doing before deployment:** audit what else on the LAN publishes ports.
Development stacks routinely bind `0.0.0.0` rather than loopback, which makes
them reachable from anything on the network. Adding another always-on box is a
good moment to check, since the new box inherits whatever the network already
tolerates.

### 5.2 Authentication

Single user, but real. Tailscale is the perimeter; this stands behind it.

- Argon2id password hash, memory-hard parameters tuned to the Pi (~250 ms).
- **TOTP second factor, mandatory.** Recovery codes generated once, stored offline.
- Sessions: HTTP-only, `Secure`, `SameSite=Strict` cookies; 30-day sliding
  expiry; server-side session table so a session can be killed.
- Mobile stores its session token in `expo-secure-store` (iOS Keychain), never
  `AsyncStorage`.
- Rate limiting on the login route regardless — cheap, and the perimeter is not
  the only thing that can fail.

### 5.3 Secrets

| Secret | Where it lives | Never |
|---|---|---|
| `ANTHROPIC_API_KEY` | Pi environment, injected by Compose | App bundle, git, or a prompt |
| Postgres password | Docker secret / `.env` (0600, gitignored) | Committed |
| Session signing key | Generated on first boot, persisted to a mounted volume | Hard-coded |
| Backup encryption key | `age` key on a hardware token, plus a paper copy off-site | On the Pi alone |

All model calls originate from the API container. The phone never holds an
Anthropic key.

### 5.4 Backups and disaster recovery

The Pi is a single point of failure with an SD card in it. Assume it dies.

| What | Cadence | Where |
|---|---|---|
| `pg_dump --format=custom` | Nightly | Local volume, then age-encrypted to **Backblaze B2** |
| Receipt images | On write | Mirrored to the same B2 bucket. MinIO is S3-compatible, so this is configuration, not code |
| Retention | 30 daily, 12 monthly, 3 yearly | — |
| **Restore drill** | **Quarterly, to a scratch container** | An untested backup is not a backup |

Boot from SSD, not SD card. SD cards fail under database write patterns, and
they fail silently for a while first.

### 5.5 Data handling

- Postgres bound to the Docker network only; never a published port.
- Receipt images and OCR JSON retained indefinitely — they are the evidence
  trail behind every business expense claim.
- The repo contains no financial data. `.gitignore` excludes `*.mmbak`,
  `*.sqlite`, `/data/`, `/receipts/`, `/backups/`, `*.dump`, `.env`.
- Agent conversation history is stored (it is an audit trail) and deletable per
  session.

### 5.6 Deliberately not done

Client certificates (Tailscale already does mutual authentication; mTLS on top
is redundant complexity), a WAF (no public traffic to filter), intrusion
detection (nothing to detect on a closed network), Vault (four secrets, one
host).

---

## 6. Data model

### 6.1 Four departures from Money Manager

Each fixes a defect visible in the backup.

**1 · Names are not identifiers.** Money Manager keys on display names. The
result, in your data: 15 categories with trailing spaces (`Vacation `,
`Hobbies `, `Entertainment `), accounts split across Polish `ł` and plain `l`
(one account spelled with `ł`, its sibling with plain `l`), and 13 documented
name collisions requiring manual disambiguation on every import.

→ UUID primary keys. Names are display-only. Uniqueness is enforced on
`lower(btrim(name))`, scoped to parent and kind — which is what lets `Other`
legitimately exist under both `Entertainment` and `Sports`, the collision Money
Manager could only resolve by adding a trailing space.

**2 · A transfer is one row.** Money Manager stores `TRANSFER_OUT` (1,734 rows)
and `TRANSFER_IN` (1,754) separately and requires heuristic re-pairing. The
repo's own documentation calls transfers "the most fragile part of the
workflow"; the iOS import path gave up and excludes them entirely.

→ One row with `account_id` and `to_account_id`. Legs are derived at read time.
The 20-row discrepancy between OUT and IN counts is itself a migration finding
to resolve.

**3 · FX is per-transaction and dated.** Money Manager keeps one global rate per
currency and applies it retroactively across five years; its own reference doc
concedes the rates "may be outdated."

→ `amount_original` in the account's currency is the fact. `fx_rate` is the
rate on the transaction date. `amount_pivot` is derived, stored only to keep
reporting cheap. Correcting a historical rate fixes every affected report with
one backfill.

**4 · Everything is audited.** `audit_log` records entity, action, actor
(`user` / `agent` / `import` / `migration`), and before/after JSON. When you are
your own accountant, "why is this categorized this way?" needs an answer
eighteen months later.

### 6.2 Entities

```
currencies              code PK, name, symbol, symbol_position, decimals,
                        is_pivot, pinned, rate_source, archived, sort   -- §7.0
fx_rates                (base, quote, date) PK, rate, source, fetched_at
account_groups          id, name, sort
accounts                id, name, kind, currency, group_id,
                        opening_balance, opening_date, memo,
                        is_business, archived, sort, external_id
categories              id, parent_id →self, name, kind,
                        icon, color, archived, sort, external_id
counterparties          id, name, kind (person|company), settlement_currency,
                        contact, note, archived, sort         -- debt (§6.6)
transactions            id, date, type, account_id, to_account_id, category_id,
                        counterparty_id,                      -- debt (§6.6)
                        amount_original, currency, fx_rate, amount_pivot,
                        to_amount, to_currency, to_fx_rate,   -- transfers (§7.5)
                        payee, note, is_business,
                        source, external_id, deleted_at
dashboard_widgets       id, kind, slot, size, config, sort    -- layout (§14.5)
tags / transaction_tags id, name  ·  m2m
recurring_transactions  id, type, account_id, to_account_id, category_id,
                        amount_original, currency, payee, note,
                        rrule, next_date, end_date, enabled
receipts                id, transaction_id, image_key, ocr_json,
                        merchant, total, currency, purchased_at, confidence
receipt_lines           id, receipt_id, description, amount, quantity,
                        category_id, sort
import_batches          id, source_file, parser, account_id,
                        period_start, period_end, status
import_rows             id, batch_id, raw, parsed, status,
                        matched_transaction_id, confidence, reason, rule_applied
rules                   id, name, priority, conditions, actions, hits, enabled
agent_sessions          id, title
agent_messages          id, session_id, role, content
agent_tool_calls        id, message_id, tool, input, output, is_write,
                        approved_at, applied_at, rejected_at
audit_log               id, entity, entity_id, action, actor, before, after, at
```

Tax-side entities — `tax_jurisdictions`, `tax_residency`, `tax_schemes`,
`tax_lines`, `category_tax_map`, and the `tax_ledger` view — are defined in
§13.2, where their purpose is legible. They are deliberately a separate
concern: the ledger does not know what a tax scheme is.

### 6.3 Enumerations

**`account_kind`** — Money Manager leaves `ZTYPE = 0` on all 68 accounts, so
the real taxonomy lives in group names and memo text. Decoded from those:

| Kind | Source pattern | Evidence |
|---|---|---|
| `cash` | groups `Cash`, `Cash supply` | — |
| `bank` | groups `Accounts`, `Polish cards` | — |
| `card` | groups `Bel Cards`, `Georgian cards` | — |
| `loan_receivable` | `Loan X` | memo: *"Money which people ow[e] to me"* |
| `loan_payable` | `Loan X (my)` | memo: *"Money which I ow[e] to somebody"* |
| `clearing` | `Loan X (distributed)` | §6.4 |
| `investment` | group `Investments` | — |
| `deposit` | group `Deposits` | — |

**`txn_type`** — `income` · `expense` · `transfer` · `adjustment`
**`category_kind`** — `income` · `expense`
**`txn_source`** — `manual` · `import` · `receipt` · `agent` · `migration`
**`actor`** — `user` · `agent` · `import` · `migration`
**`import_row_status`** — `pending` · `ready` · `needs_review` · `duplicate` ·
`imported` · `skipped`
**`fx_source`** — `nbp` · `ecb` · `nbrb` · `nbg` · `manual` · `carried_forward`
(§7.6; `manual` outranks every synced source for the same pair and date)

### 6.4 The clearing accounts

`Clearing · PLN` is the third most active account in the system — 678
transactions, 636 of them transfers, with notes of the form *"dinner, split
four ways"* or *"weekend trip — total"*, moving between `BANK-A · PLN`,
`Cash · PLN`, and individual `Loan` accounts.

It is a **clearing account for shared expenses**: you pay for a group, then
allocate each person's share out to their receivable. `Clearing · BYN` does
the same in a second currency (110 rows).

Modelled as `kind = 'clearing'`, which buys a useful invariant: **a clearing
account should trend to zero.** A persistent non-zero balance means an
unallocated group expense. That becomes a dashboard warning and an agent tool
(`find_unsettled`) — a genuinely new capability rather than a port.

### 6.5 Integrity constraints

Enforced in the database, not merely the application:

```sql
transactions_amount_positive     amount_original >= 0
transactions_transfer_shape      (type = 'transfer') = (to_account_id IS NOT NULL)
transactions_transfer_distinct   to_account_id IS NULL OR to_account_id <> account_id
transactions_category_shape      type IN ('income','expense') OR category_id IS NULL
transactions_to_amount_shape     (type = 'transfer') = (to_amount IS NOT NULL)
transactions_to_amount_positive  to_amount IS NULL OR to_amount >= 0
categories_no_self_parent        id <> parent_id
fx_rates_rate_positive           rate > 0
```

Plus a partial unique index enforcing **exactly one pivot currency** — the hub
every stored rate is quoted against (§7.0):

```sql
CREATE UNIQUE INDEX currencies_one_pivot
  ON currencies ((true)) WHERE is_pivot;
```

There is deliberately no constraint on a *reporting* currency, because there
isn't one. Display currency is a client preference, not a database fact.

Plus unique indexes on normalized names, and partial unique indexes on
`external_id WHERE external_id IS NOT NULL` — the mechanism that makes
re-migration idempotent.

**Validation status:** this schema has been expressed in Drizzle, and
`drizzle-kit` generates clean PostgreSQL 16 DDL for all of it — expression
indexes, the `coalesce`-based sibling uniqueness index, partial unique indexes,
and every check constraint. It has not yet been applied to a live database end
to end.

### 6.6 Counterparties and debt

Money Manager has no concept of a person. Debt is encoded as **accounts**
sliced by currency and direction — `Loan · PLN`, `Loan · PLN (my)`,
`Loan · BYN`, `Loan · USD`, and so on. Eleven accounts exist only to carry it,
which is a large share of why there are 68 accounts at all.

That structure cannot answer the question you actually have. It knows the total
owed to you in PLN; it does not know that one person owes you PLN *and* EUR,
because the person is not a record anywhere. The names live in transaction
notes, as free text.

**Counterparties become first-class entities.**

```
counterparties     id, name, kind (person | company),
                   settlement_currency,      -- the currency they prefer to settle in
                   contact, note, archived, sort, created_at
transactions       + counterparty_id         -- nullable FK
```

**Debt is derived, never stored.** A counterparty's position is the running sum
of transactions referencing them. Nothing is posted twice, so a balance cannot
drift from its history:

```sql
CREATE VIEW counterparty_balances AS
  SELECT counterparty_id, currency,
         SUM(signed_amount) AS balance
  FROM   transactions
  WHERE  counterparty_id IS NOT NULL AND deleted_at IS NULL
  GROUP  BY counterparty_id, currency;
```

**Sign convention:** positive means *they owe you* (a receivable); negative
means *you owe them* (a payable). One counterparty can hold both at once in
different currencies, which the account model made unrepresentable.

#### Cross-currency debt

A counterparty carries **one balance per currency**, plus two derived totals:
one in *their* `settlement_currency`, one in the current display currency. The first is
what you discuss with them; the second is what appears in your reports.

```
Counterparty · person · settles in EUR

    PLN    +840,00      they owe you
    EUR     −120,00     you owe them
    ─────────────────
    net in EUR   +75,40    @ NBP 2026-08-04
    net in PLN  +321,60
```

Neither derived total is stored. Both recompute from `fx_rates`, so a corrected
rate fixes every counterparty at once.

#### Settlement

Settling raises a real question: if someone owes you 200 PLN and hands you
50 EUR, at what rate is the debt discharged?

Not at the market rate — at **whatever the two of you agreed**. So settlement
follows the same shape as a cross-currency transfer (§7.5): both amounts are
stored, the rate is derived, and the gap against the reference rate is a
visible FX gain or loss rather than a silent adjustment.

| Field | Meaning |
|---|---|
| `amount_original` / `currency` | What actually changed hands |
| Debt currency | Which balance it discharges |
| Settlement rate | Defaults to the reference rate for that date; **editable** |
| Residual | What remains outstanding, shown before commit |

A settlement never fully clears a balance implicitly. If the amounts do not
reconcile, the remainder stays outstanding and is stated.

#### What this replaces

The eleven loan accounts collapse into counterparties, and the `clearing`
accounts (§6.4) gain meaning: a group expense is allocated by attaching each
share to its counterparty, so `find_unsettled` reports *who* has not settled,
not merely that something has not.

`loan_receivable` and `loan_payable` remain valid `account_kind` values for
migration fidelity, but new debt is recorded against counterparties. Direction
is a property of the balance, not of the account it sits in.

#### Migration opportunity

The counterparty names already exist in the data — as free text in the
`content` field of loan and clearing transactions (*"‹name› total"*,
*"coffee for ‹name›"*). Migration extracts distinct names from those rows and
proposes a counterparty list for review. Extraction is a **suggestion**, never
an automatic write: the names are inconsistent (first name, first name plus
initial, nickname) and merging two spellings of one person silently would
corrupt a balance.

### 6.7 Soft deletion

`transactions.deleted_at`. Money Manager carries 253 deleted rows it never
purges; the same escape hatch is wanted, and a hard delete in a financial
ledger is rarely the right default. Every read path filters
`deleted_at IS NULL`. Reference data (accounts, categories) uses `archived`
instead — never deleted, because history references it.

---

## 7. Money and FX semantics

Currency is a **first-class domain**, not a fixed list baked into the schema.

### 7.0 There is no main currency

The obvious design gives the system one reporting currency, configurable, with
changing it as a heavy backfill. That design assumes a home base.

This system has no home base. Time is split across Poland, the United States,
and Germany, so *"how much do I have"* means PLN in Warsaw, USD in New York,
and EUR in Berlin — and it changes several times a year. Under a
single-main-currency model, answering that question is a re-base of every row.

The mistake is conflating two unrelated concerns under one name.

| Concept | Nature | Changes |
|---|---|---|
| **Pivot currency** | Technical. The hub all FX rates are stored against, so any pair derives by triangulation | Chosen once at setup. **Never** |
| **Display currency** | A user preference. What totals are rendered in | Freely, instantly, as often as you like |

**Pivot is `USD`** — the best historical coverage across all seven currencies
in use, the base that both NBRB and NBG publish against, and what Money Manager
already stores, so migration needs no rate conversion at all. It is invisible:
it appears in no screen and no export.

**Display currency is a header toggle.** `PLN · USD · EUR` pinned, tap to
re-express every figure on screen. No backfill, no confirmation, no audit
entry — nothing in the database moves.

#### Why this works

`amount_pivot` was only ever a materialization for query speed. The facts are
`amount_original`, `currency`, and `fx_rate`; everything else derives. At ~8,000
rows growing ~2,000 a year, per-row conversion is sub-millisecond with an index
on `fx_rates`. Materializing a *reporting* currency bought performance that was
never needed, and the switching cost was the price.

#### Conversion is per row, at each row's own date

Converting an aggregate at today's rate would make a 2021 total drift daily.
Each row converts at the rate for **its own date**, then the results sum:

```
amount_display(row) = amount_pivot(row) ÷ rate(display → pivot, row.date)
```

`amount_pivot` stays materialized because it is per-row and date-correct, so
aggregation is a plain `SUM`; only the final display conversion joins
`fx_rates`. When display equals pivot, that join is skipped entirely.

#### Currency configuration

- **Add a currency** — ISO 4217 code, decimals, symbol placement, rate source.
  Rates backfill across the period existing data covers.
- **Archive** — hidden from pickers; history keeps working. Never deleted while
  any account or transaction references it.
- **Pin to the toggle** — which currencies appear in the header switcher.
- **Change the pivot** — supported but genuinely rare, and the one heavy
  operation left. Audited, confirmed, and never needed simply because you moved.

#### What this does *not* apply to

**Tax outputs ignore the display toggle entirely.** A KPiR is denominated in
PLN, Schedule C in USD, Anlage EÜR in EUR — by law, not by preference. Each
adapter forces its jurisdiction's currency (§13.2), so a display setting can
never leak into a filing. That separation already existed; this makes it
load-bearing.

### 7.1 Representation

Amounts are `numeric(20,8)` in Postgres and **decimal strings** in TypeScript,
never JS numbers. `postgres.js` is configured to return `numeric` as a string;
arithmetic goes through decimal.js. `0.1 + 0.2` is the wrong answer in a
ledger, and five years of rows compound it.

### 7.2 Sign convention

Stored amounts are **always positive**; `type` carries direction. This matches
the import format, matches Money Manager, and removes a class of sign-flip bug.
Signed values are computed at read time:

| Type | From account | To account |
|---|---|---|
| `income` | `+amount` | — |
| `expense` | `−amount` | — |
| `transfer` | `−amount` | `+amount` |
| `adjustment` | `+amount` (may be negative in effect) | — |

### 7.3 Two kinds of rate

The system distinguishes them everywhere, because conflating them is how FX
cost becomes invisible.

| | **Reference rate** | **Realized rate** |
|---|---|---|
| Source | Central bank or market feed | Implied by an actual transaction |
| Answers | *What was this worth?* | *What did I actually get?* |
| Used for | Valuation, reporting, tax | Transfers, FX cost analysis |
| Stored in | `fx_rates` | Derived from the two amounts on the transaction |
| Authority | Provider | The bank statement |

A reference rate is never used to *compute* money that actually moved. It
values things; it does not invent them.

### 7.4 Conversion and reporting

`fx_rates(base, quote, date) → rate`, converting one unit of `base` into
`quote`. Every rate is stored against the **USD pivot**; any other pair derives
by triangulation (§7.0).

- Historical reference rates are backfilled daily across the full data range.
- A transaction's `fx_rate` is fixed at its date and **does not** move when
  later rates arrive. A 2021 purchase is reported at 2021 rates.
- `amount_pivot` is materialized for query performance and always recomputable
  as `amount_original × fx_rate` — which is what makes changing the main
  currency (§7.0) a backfill rather than a migration.

### 7.5 Cross-currency transfers

Moving money between accounts of different currencies stores **both amounts**:

```
transactions
  amount_original   150.00     -- leaves `Household · USD`
  currency          USD
  to_amount         565.20     -- arrives in `Cash · PLN`
  to_currency       PLN
  → realized rate   3.7680     -- derived, never stored as truth
```

For same-currency transfers `to_amount` equals `amount_original` and the
realized rate is 1.

Storing the destination amount rather than deriving it matters because they
disagree in practice. If the reference rate that day was 3.8100 and your bank
gave you 3.7680, that 1.1% gap is a real cost — roughly 6 PLN on this transfer.
Deriving `to_amount` from the reference rate would erase it silently; storing
both makes it a reportable figure. **FX cost becomes a category you can total**,
which no version of Money Manager could show.

### 7.6 Rate sync and manual override

**Sync on foreground.** The app refreshes reference rates when opened, subject
to a staleness threshold — no refetch if the current day's rates are already
held. Sync fetches each configured currency against the pivot, which is what
makes an arbitrary display currency free.

| Situation | Behaviour |
|---|---|
| Rates current | No network call |
| Rates stale, online | Fetch, upsert, stamp `fetched_at` |
| Rates stale, offline | Use the most recent held rate, **visibly marked stale** in the UI |
| Provider fails | Fall back to last known; surface the failure rather than silently carrying forward |
| Weekend or holiday | Carry forward the last published rate — standard convention, and what NBP itself does |

**Manual override at three levels**, each recorded with provenance so a figure
can always be traced to its origin:

1. **Per transaction** — enter the rate your bank actually applied, or let it
   be implied by entering both amounts (§7.5). This is the common case, and the
   preferred one: two amounts are observable from a statement, a rate is not.
2. **Per day, per pair** — correct a bad or missing provider figure for a
   specific date. Applies to anything valued on that date.
3. **Provider selection** — per currency, choose which source is authoritative
   (§7.7).

`fx_rates.source` carries the provenance: `nbp`, `ecb`, `nbrb`, `nbg`,
`manual`, or `carried_forward`. A manual entry always outranks a synced one for
the same pair and date, is never overwritten by a later sync, and writes to
`audit_log`. Reports can be filtered to show which figures rest on overrides —
useful when a period is being reconciled and you need to know what was asserted
rather than observed.

### 7.7 Rate sources

Each currency carries its own `rate_source`, selectable in Settings. These are
the defaults, not hardcoded assignments:

| Currency | Default source | Why |
|---|---|---|
| PLN | **NBP** (Narodowy Bank Polski) | NBP rates are what Polish tax filing uses — so valuation matches the book |
| EUR, GBP | ECB reference rates | Free, authoritative, full history |
| BYN | NBRB (National Bank of Belarus) | Availability back to 2020 to be verified (O4) |
| GEL | NBG (National Bank of Georgia) | — |
| RUB | NBP or ECB | Post-2022 quotes unreliable (O5) |

The general rule: **prefer the central bank of the jurisdiction you report in**,
because that is the rate the tax authority will use. Where no such rate exists,
fall back to ECB.

Adding a currency means adding a source adapter — a function from
`(pair, date range)` to rates. Sources are plugins, so a new one is a module
and a row, not a schema change.

Missing days (weekends, holidays) carry forward the last published rate, marked
`carried_forward`. This is the standard convention and what NBP itself does.

---

## 8. Migration from Money Manager

The riskiest phase, and therefore the first.

### 8.1 Pipeline

```
.mmbak  →  mm/reader.py  →  JSON  →  normalize  →  Postgres  →  verify
           (existing,               (TypeScript)               (balances)
            unchanged)
```

`mm/reader.py` already parses the Core Data schema into typed models correctly.
It is reused as-is, emitting JSON. Rewriting it in TypeScript would risk a
regression for no gain.

### 8.2 Normalization

Every transformation emits a line in a migration report for review:

| Step | Action |
|---|---|
| Category names | `btrim`; merge `Vacation `→`Vacation`, `Hobbies `→`Hobbies`, and 13 more |
| Account names | Reconcile `ł`/`l` variants; record the canonical form |
| Name collisions | Resolve the 13 documented cases by (parent, kind) |
| Account kinds | Derive from group + name pattern + memo (§6.3) |
| Transfers | Pair OUT/IN into single rows; **flag every unmatched leg** |
| Realized FX | Take `amount_original` from the OUT leg and `to_amount` from the IN leg — both are already stored per-leg, so five years of actual bank rates are recoverable (§7.5) |
| Counterparties | Extract distinct names from loan and clearing transaction `content`; **propose** a list for review, never write silently (§6.6) |
| Categories | Rebuild the tree by `ZPUID`; verify no orphans |
| FX | Backfill `fx_rates`; recompute every `amount_pivot` |
| Recurring | Port 24 `ZREPEATTRANSACTION` rows; translate to RRULE |
| Deleted rows | Import with `deleted_at` set — preserved, not discarded |
| Tags | 2 tags, 0 links. Nothing to migrate |
| Budgets | 13 rows, deferred (N7). Preserved in the JSON dump |

### 8.3 Idempotency

Keyed on Money Manager's `ZUID` in `external_id` with partial unique indexes.
Re-running against a fresh `.mmbak` upserts rather than duplicating. This
matters concretely: the April–August 2026 gap and the new `House` category tree
are being entered in Money Manager first, so migration runs several times
against progressively later backups before cutover.

### 8.4 The verification gate

**Go/no-go for the entire project.** For all 52 active accounts:

```
opening_balance + Σ(signed transactions) == Money Manager's reported balance
```

To the cent, per account, per currency. Plus:

- Transaction count matches (7,621 active, 253 deleted) — and re-matches on
  every later backup.
- Every transfer has both legs, or appears on an explicit exception list.
- Category tree depth and membership match.
- Recomputed `amount_pivot` monthly totals are within a stated tolerance of
  Money Manager's, with divergence explained by the FX correction (§6.1) rather
  than by an error.

If balances do not reconcile, nothing built on top is trustworthy. Failure here
stops the project until it is understood.

### 8.5 Cutover

1. Enter the last transactions in Money Manager; export a final `.mmbak`.
2. Run migration; verification must pass clean.
3. Money Manager becomes read-only — kept installed, never edited again.
4. Archive the final `.mmbak` and the `mm-tools` repo alongside the backups.

---

## 9. Statement ingestion

### 9.1 Parsers

One module per source, all conforming to `parse(file) → RawRow[]`.

| Parser | Priority | Rationale |
|---|---|---|
| `BANK-A` personal (XLS/CSV) | 1 | Highest volume — roughly a quarter of all rows |
| `BANK-A` business | 1 | Business-critical; feeds the tax layer (§13) |
| `NEOBANK` CSV | 2 | Well-documented, stable format |
| `BANK-B` | 3 | — |
| `FX-BANK-1`, `FX-BANK-2` | 3 | — |
| `CARD-C` | 4 | Second-highest volume, but the format is unknown (O6) |
| Generic CSV | fallback | Column auto-detection, as `classify_statement_openrouter.py` does today |

`scripts/convert_pko_xls.py` ports directly.

### 9.2 Classification cascade

Three tiers, cheapest first:

```
raw row → [1] exact duplicate?  → skip
        → [2] rule match?       → classified, deterministic, free
        → [3] model call        → classified with confidence + reason
        → review queue
```

**Rules** (`rules` table) match on payee regex, amount range, account, and
currency; they apply a category, payee normalization, note, and business flag.
Confirming a model suggestion offers to write a rule. After a few months the
recurring set — rent, salary, subscriptions, utilities — is entirely rules, and
the model only sees novel merchants.

**Model tier** uses `claude-opus-5` with:

- Account list, full category tree, and active rules in the system prompt
  behind a `cache_control` breakpoint — the taxonomy is cache-written once and
  read at ~0.1× on every subsequent batch.
- Per-batch rows placed *after* the breakpoint so the prefix stays byte-stable.
- `output_config.format` with a JSON schema, so classifications arrive
  validated rather than parsed out of prose.
- `effort: "medium"` — bulk extraction, not reasoning.
- Batches of ~50 rows.

### 9.3 Duplicate and transfer detection

Ports `mm/cleanup.py:find_duplicates` — same account, same amount, within a
date window. Materially easier than today, because the comparison is against
live data rather than a snapshot file, so there is no baseline drift.

Cross-account transfer detection also ports: a debit and a credit of equal
magnitude in different accounts within a few days is a transfer candidate, not
two independent transactions.

### 9.4 Review

Today this is editing CSVs in Excel. It becomes a screen: proposed rows with
confidence and reason, swipe to accept, tap to recategorize, long-press to
split, bulk-accept above a confidence threshold. `import_rows.raw` is never
mutated, so a reparse after a prompt change is always possible.

---

## 10. Receipt capture

### 10.1 Flow

```
camera → local queue (SQLite) → upload → claude-opus-5 vision
       → structured extraction → draft transaction → confirm → commit
```

### 10.2 Extraction

JSON schema output: `{merchant, date, total, currency, tax, line_items[]}`.
Both the image and the raw model response are retained permanently — the image
is the evidence, and the raw response allows re-extraction after a prompt
improvement without re-photographing anything.

**Currency is detected, not assumed.** A supermarket receipt from one country
is not in the same currency as a café receipt from another, and the app is used
across several. The FX rate is looked up for the *receipt* date.

### 10.3 Line-item splitting

One supermarket run split across `Food → Groceries` and `Household → Toiletries`.
Money Manager cannot do this at all. Implemented as `receipt_lines` with
per-line categories; the parent transaction holds the total, the lines carry
the allocation.

### 10.4 Offline

Capture must work in a shop with no signal. Images queue locally in SQLite with
the pending transaction; the queue drains on reconnect. Conflict handling is an
outbox, not CRDTs — single user, single writer, so last-write-wins on the server
is correct and enormously simpler.

---

## 11. The agent

The component most likely to be built badly. Three rules make it safe.

### 11.1 Typed tools, not SQL generation

| Read — auto-runs | Write — requires approval |
|---|---|
| `search_transactions` | `create_transaction` |
| `get_balances` | `update_transaction` |
| `spend_by_category` | `split_transaction` |
| `compare_periods` | `categorize_batch` |
| `find_duplicates` | `create_category` |
| `find_unsettled` (§6.4) | `propose_rule` |
| `get_category_tree` | `run_import` |
| `export_excel` | — |

Text-to-SQL over a financial ledger trades unbounded blast radius for marginal
flexibility. A bounded typed surface is also far easier to evaluate.

### 11.2 Writes render a diff card

Reads run freely. Anything mutating renders a before/after card that must be
tapped to approve. Nothing is written on the model's own authority, ever.

Implemented with the SDK's tool runner, gating inside each write tool's run
function — rejecting returns a "declined" result and the loop continues
normally rather than breaking.

### 11.3 Everything is logged

`agent_tool_calls` records input, output, approval time, and application time.
`audit_log` marks agent-originated changes with `actor = 'agent'`. Sessions are
retained as an audit trail.

### 11.4 Model configuration

- `claude-opus-5`; adaptive thinking (on by default on this model).
- `effort: "high"` for analysis, `"medium"` for routine logging turns.
- Context carries the category tree, account list, and recent activity — not all
  7,874 rows. Tools fetch what is needed.
- Prompt caching on the stable prefix (taxonomy, tool definitions).
- Handle `stop_reason: "refusal"` before reading content.

### 11.5 Category proposals

The agent may **propose** a new category when nothing fits; it never creates one
silently. This is the guardrail that keeps a dynamic taxonomy from becoming 400
junk categories — and the risk is not hypothetical, given 122 categories with 13
name collisions today.

---

## 12. Reporting and Excel export

Seeing everything in Excel is a first-class output, not an afterthought.

### 12.1 Format

`.xlsx` via a streaming writer; one workbook, multiple sheets, formatted to be
readable on open: frozen header row, autofilter, sensible column widths, number
formats per currency, dates as real dates.

### 12.2 Standard workbook

Following general ledger convention — the near-universal column set across
[templates and accounting packages](https://www.rippling.com/blog/general-ledger-template)
is date, description, account, debit, credit, running balance:

| Sheet | Contents |
|---|---|
| `Transactions` | Date, Account, Category, Subcategory, Payee, Note, Debit, Credit, Currency, Amount (local), FX rate, Amount (USD), Business, Source |
| `General Ledger` | Per-account, date-ordered, with running balance — the classic GL view |
| `Trial Balance` | Every account: opening / movement / closing, per currency and in USD |
| `By Category` | Pivot-ready: category × month, in USD |
| `Accounts` | Register with kind, currency, group, current balance |
| `Cash Flow` | Monthly income, expense, net, by account group |
| `Business` | Reads `tax_ledger`, shaped to the active jurisdiction (§12.3) |
| `FX Rates` | Every rate used, with its source and whether it was synced or overridden — so each converted figure is reproducible |
| `FX Cost` | Realized vs reference rate per cross-currency transfer, and the spread totalled by period and institution (§7.5) |

Debit and credit are separate columns with exactly one populated per row. That
is the convention every general ledger template follows, and it is what makes
the sheet legible to anyone with an accounting background — including future
you.

### 12.3 Business sheet — per jurisdiction

Sourced from the `tax_ledger` view (§13.1), so it is structurally incapable of
containing a personal row. Shaped by the jurisdiction adapter selected for the
period:

| Jurisdiction | Sheet layout |
|---|---|
| `PL` | KPiR column order — 19 columns for 2026+, 17 for earlier periods |
| `US` | Schedule C Part II, lines 8–27b, with the 50%-meals rule applied and shown |
| `DE` | Anlage EÜR line grouping, with the SKR03 or SKR04 account beside each row |

None of these is the legal filing (§13.5) — they are laid out in the same shape
so they cross-check against whatever keeps the real book. Business transactions
carry the optional fields each scheme needs (`counterparty_tax_id`,
`document_ref`, `ksef_id`) so the handoff is mechanical rather than manual.

Every sheet ships with its manifest (§13.1): row count, date range,
jurisdiction, scheme version, and the assertion that no non-business row was
included.

### 12.4 Ad-hoc export

The agent's `export_excel` tool takes a filter — date range, accounts,
categories, business flag — and produces a workbook. *"Give me everything I
spent on the flat this year, in Excel"* should be one sentence, not a pipeline.

---

## 13. Tax reporting — multi-jurisdiction

Two hard requirements shape this section:

> **T1 — Non-business transactions are never reported.** No personal expense
> appears in any tax output, under any jurisdiction, ever.
>
> **T2 — Jurisdiction is pluggable.** Poland today; US (IRS) and Germany must
> be addable without touching the ledger.

Both are architectural, not procedural. A rule you have to remember to follow
is not a guarantee.

### 13.1 T1 — the exclusion guarantee

"Filter by `is_business`" is not sufficient. One forgotten `WHERE` clause and a
personal expense is in a tax filing. The guarantee is made structural instead:

**1 · Fail closed.** `is_business` defaults to `false`. A transaction is
personal unless explicitly marked otherwise. Nothing becomes reportable by
accident or omission.

**2 · Tax code cannot see personal rows.** All tax adapters read from a view,
never the base table:

```sql
CREATE VIEW tax_ledger AS
  SELECT ... FROM transactions
  WHERE is_business = true
    AND deleted_at IS NULL;
```

**3 · Enforced by the database, not by discipline.** The export path connects
as a Postgres role holding `SELECT` on `tax_ledger` and **no privilege at all**
on `transactions`. A tax adapter that tried to read personal data would fail
with a permissions error rather than succeed quietly. This is the part that
makes T1 a guarantee: correctness no longer depends on every future query being
written carefully.

**4 · Mixed purchases are split, not apportioned.** A laptop that is 70%
business becomes two transactions — one business, one personal — rather than
one row with a percentage. Percentages hide in a column; two rows are visible
in every report and each carries its own evidence.

**5 · Every flip is audited.** Changing `is_business` writes to `audit_log`
with the actor. Bulk changes by the agent require approval like any other write
(§11.2).

**6 · Every export carries a manifest.** Row count, date range, jurisdiction,
scheme version, and an explicit assertion that zero non-business rows were
included. A receipt you can check rather than a promise you have to trust.

### 13.2 T2 — ledger and adapters

The ledger stays jurisdiction-neutral. Tax treatment is a *projection* over it,
resolved per jurisdiction and per period.

```
                 ┌──────────────────────────────┐
                 │  transactions (neutral)      │
                 │  category, amount, date,     │
                 │  counterparty, evidence      │
                 └──────────────┬───────────────┘
                                │  is_business = true only
                 ┌──────────────▼───────────────┐
                 │  tax_ledger  (view)          │
                 └──────────────┬───────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
 ┌──────▼──────┐         ┌──────▼──────┐         ┌──────▼──────┐
 │ PL adapter  │         │ US adapter  │         │ DE adapter  │
 │ KPiR /      │         │ Schedule C  │         │ Anlage EÜR  │
 │ Ewidencja   │         │ lines 8–27b │         │ SKR03/04    │
 └─────────────┘         └─────────────┘         └─────────────┘
```

A Waltning category maps to a *line* in each scheme it participates in. The
mappings are data, not code — adding Germany means inserting a scheme, its
lines, and the mappings, not editing the ledger or the export engine.

**Additional entities** (extending §6.2):

```
tax_jurisdictions   code PK (PL, US, DE), name
tax_residency       jurisdiction, valid_from, valid_to     -- who you file where, when
tax_schemes         id, jurisdiction, code, version,
                    effective_from, effective_to           -- versioned; see §13.4
tax_lines           id, scheme_id, ordinal, code, label,
                    kind (revenue | expense | excluded)
category_tax_map    category_id, scheme_id → tax_line_id,
                    note                                    -- many schemes per category
transactions        + counterparty_tax_id, document_ref, ksef_id
                                                            -- optional, business rows only
```

`tax_residency` matters because you may file in different places in different
years. A 2026 transaction resolves against the scheme effective in 2026 for the
jurisdiction you were resident in — not against today's rules.

### 13.3 Jurisdiction profiles

Poland is implemented first because it is live. The other two are specified now
so the model does not have to change later.

#### Poland — `PL`

| | |
|---|---|
| Books | **KPiR** (skala 12%/32%, or liniowy 19%) — or **ewidencja przychodów** under ryczałt |
| Structure | KPiR: 19 columns since 2026-01-01, [up from 17](https://www.pit.pl/aktualnosci/kpir-2026-nowy-wzor-ksiegi-przychodow-i-rozchodow-1011071) |
| New columns | 3 = KSeF invoice ID · 4 = other document number · 5 = counterparty NIP · 6–7 = name/address only when no NIP |
| Form | [Electronic only](https://poradnikprzedsiebiorcy.pl/-podatkowa-ksiega-przychodow-i-rozchodow-2026-co-sie-zmienia) from 2026-01-01 |
| Filing | JPK_PKPiR by 30 April; JPK_V7M/K if VAT-registered |
| Invoicing | [KSeF mandatory for JDG since 2026-04-01](https://ksef.podatki.gov.pl/jdg-i-msp/); ≤10,000 PLN/month gross exempt to 2026-12-31; penalties suspended to 2026-12-31 |
| Under ryczałt | No KPiR, no cost side, and [explicitly outside JPK_PKPiR](https://poradnikprzedsiebiorcy.pl/-obowiazek-przesylania-jpk-pkpir) |
| FX | NBP rates — which is why NBP is preferred over ECB for PLN in §7.4 |

#### United States — `US`

| | |
|---|---|
| Form | [Schedule C (Form 1040)](https://www.irs.gov/forms-pubs/about-schedule-c-form-1040), Profit or Loss from Business |
| Structure | Expenses on Part II, **lines 8–27b** — a fixed, well-documented line set |
| Lines | 8 advertising · 9 car and truck · 10 commissions · 11 contract labor · 12 depletion · 13 depreciation · 14 employee benefits · 15 insurance · 16 interest · 17 legal and professional · 18 office expense · 19 pension · 20a/20b rent (equipment / property) · 21 repairs · 22 supplies · 23 taxes and licenses · 24a travel · 24b meals · 25 utilities · 26 wages · 27b other |
| Quirks | Meals 50% deductible, entertainment 0%, commuting never. Line 27a is reserved for §179D, so "other" sits on **27b** |
| Deductibility test | IRC §162 — ordinary *and* necessary |
| Mileage | 72.5 ¢/mile for 2026, or actual costs |
| Currency | USD is already the reporting currency (§7.3), so no conversion layer needed |

The 50%-deductible meals rule and the mileage option mean a `tax_lines` row
needs an optional **deduction rate** and an optional **alternative basis**
(mileage vs actual). Modelled now, unused until the US adapter is built.

#### Germany — `DE`

| | |
|---|---|
| Form | **Anlage EÜR** (*Einnahmenüberschussrechnung*) — cash-basis profit determination for freelancers and small businesses |
| Filing | Electronic via **ELSTER** only, with the income tax return |
| Chart of accounts | [SKR03 or SKR04](https://www.steuerschroeder.de/Kontenrahmen.html) — SKR03 organized by transaction type, SKR04 by function (fixed assets, current assets, equity) |
| 2026 change | New account **8192 (SKR03) / 4184 (SKR04)** — tax-free small-business revenue under §19(1) UStG |
| Kleinunternehmer | §19 UStG small-business status changes VAT treatment and therefore which accounts apply |

SKR03/04 are chart-of-accounts numbers rather than form line numbers, which is
why `tax_lines.code` is a string and not an integer — it holds `"22"` for
Schedule C, `"13"` for a KPiR column, and `"8192"` for SKR03 without special
casing.

### 13.4 Scheme versioning

Tax forms change, and historical periods must keep reporting under the rules
that applied at the time. Two changes already in scope prove the need:

- Poland's KPiR went from 17 to 19 columns on 2026-01-01. A 2025 export must
  produce 17 columns; a 2026 export, 19.
- Schedule C moved "other expenses" from line 27a to 27b when 27a was reserved
  for §179D.

Hence `tax_schemes.version` with `effective_from` / `effective_to`, and
resolution by transaction date rather than by export date. A scheme is
immutable once a period closes against it.

### 13.5 The scope boundary

**Waltning is not your legal book of account, in any jurisdiction.** Four
reasons, which now apply three times over:

1. **The targets move independently.** Poland changed three times in 2026 and
   changes again in January 2027. Tracking one jurisdiction is a commitment;
   tracking three is a job.
2. **Filing integrations are certified** — KSeF, ELSTER, IRS e-file. Each is a
   product in itself.
3. **The failure mode is asymmetric.** A bug in your spending dashboard is an
   annoyance. A malformed JPK_PKPiR or EÜR is a compliance problem, and
   Poland's penalty suspension expires 31 December 2026.
4. **Dedicated software is cheap** in every one of these markets — wFirma,
   inFakt, ifirma (PL); Lexware, sevDesk, WISO (DE); the entire US tax software
   industry.

**What Waltning does instead** is the layer *around* the book — the part
commercial software is bad at:

- **Evidence.** Every business expense carries its receipt image and
  extraction, permanently, searchable, in one place regardless of jurisdiction.
- **Reconciliation.** Imported statements diff against what the filing software
  recorded, catching both omissions and double entries.
- **Categorization once, projected many ways.** Categorize a transaction once;
  the adapters map it to a KPiR column, a Schedule C line, or an SKR account.
- **The Excel you actually want** (§12.3), per jurisdiction and per period.
- **The agent** — *"what did I spend on the business in Q2, and is any of it
  missing from the book?"*

### 13.6 Current position — ryczałt, not VAT-registered

Both prerequisites are answered, and together they make the tax layer
**substantially smaller than this section implies**.

| | Consequence |
|---|---|
| **Ryczałt** | The record is an *ewidencja przychodów* — a revenue register. **No cost side exists.** Outside JPK_PKPiR entirely |
| **Not VAT-registered** | No JPK_V7M/K. Electronic record-keeping binds from **2027-01-01**, not 2026-01-01 |

**What this removes**

- No KPiR, so the 19-column mapping is defined (`PL_KPIR`) but unimplemented.
- No cost side, so **business expense categorisation is not tax-relevant**. It
  remains useful for your own analysis, but a miscategorised business expense
  is no longer a compliance problem — which materially lowers the stakes on
  import review's business fields.
- No JPK filing of any kind.

**What this adds**

One field that exists nowhere else in the design:

> **A ryczałt rate on each revenue row.** Derived from the *activity*, not the
> category — the expense taxonomy cannot imply it. Defaulted per counterparty
> or per revenue category, editable per row, and versioned with the scheme
> (§13.4), because the rates change by year and by activity.

**What still applies**

- KSeF, for invoices you issue. You are inside the JDG obligation from
  2026-04-01, with the ≤10,000 PLN/month relief running to 2026-12-31 and
  penalties suspended to the same date.
- Counterparty NIP on revenue rows.
- The exclusion guarantee (§13.1), unchanged — though under ryczałt it protects
  a smaller surface, since only revenue is reportable at all.

**Build order:** `PL_RYCZALT` first and alone. `PL_KPIR`, `US_SCHED_C` and
`DE_EUER` are defined so the shape is right, and wait.

**Still open:** O11 — residency and treaty interaction, deferred until a second
jurisdiction is live.

**Nothing in this section is tax advice.** It is a scope argument built from
published sources, and every specific should be confirmed against your own
circumstances before it is relied on.

---

## 14. Application surface

### 14.1 Mobile — primary

| Screen | Purpose |
|---|---|
| Today | Balances by group, recent activity, unsettled clearing warnings |
| Quick add | Amount → account → category → done. Under 10 seconds |
| Scan | Camera, queue status, extraction review |
| **Calendar** | Day / week / month / year, with both continuous scroll and stepped paging (§14.4) |
| **Debt** | Counterparties, per-currency balances, settle flow (§6.6) |
| Transactions | Search, filter, infinite list, swipe to edit |
| Transaction detail | Full edit, receipt view, line splits, audit history |
| Accounts | Register, balances, archive toggle |
| Transfer | Two accounts, two amounts; live rate shown, editable inline (§7.5) |
| Agent | Chat, tool-call cards, approval gates |
| Settings | Currencies (main + subs, rate sources), categories, rules, recurring, export, sync status |

**Transfer entry** deserves calling out, because it is where the FX model meets
the keyboard. Pick source and destination; if the currencies differ, the
destination amount is **pre-filled from the reference rate and left editable**.
Typing over it sets the realized rate, and the difference from the reference is
shown as it is typed — so the bank's spread is visible at the moment of entry
rather than discovered in a report months later. The rate itself is never the
input; two amounts are, because two amounts are what a statement shows.

### 14.2 Web — dashboard

Shares the codebase via React Native Web; different information density.

| Screen | Purpose |
|---|---|
| Dashboard | Configurable widget grid (§14.5) — charts, balances, calendar, debt |
| Import | Upload, review queue, bulk accept — keyboard-driven |
| Calendar | Same four scales, wider canvas; week and month gain per-day detail |
| Debt | Counterparty register, ageing, settlement history |
| Reports | Period comparison, category deep-dive, business view |
| Export | Build a workbook, download |
| Agent | Same conversation, wider canvas |

### 14.3 Offline behaviour

| State | Behaviour |
|---|---|
| Online | Direct tRPC; optimistic updates; FX sync on foreground (§7.6) |
| Offline | Reads from local SQLite cache; writes to outbox; last-known rates, marked stale |
| Reconnect | Outbox drains in order; server is authoritative |
| Conflict | Last-write-wins. Single user, single writer — anything more is unjustified |

### 14.4 Calendar

A time-shaped view of the ledger, complementing rather than replacing the
transactions list — the list answers *"find the thing I remember"*, the
calendar answers *"what happened in this period"*. Mobile first, then web.

**Four scales**, one component, one data source:

| Scale | Contents | Cell |
|---|---|---|
| **Day** | Chronological list of that day's entries | The transaction row itself |
| **Week** | Seven days with per-day totals | Net figure, count, category dots |
| **Month** | Calendar grid | Per-day net, density shading from the green ramp |
| **Year** | Twelve months | Month net, and a sparkline of daily movement |

**Two navigation modes**, switchable and remembered:

| Mode | Behaviour | Suits |
|---|---|---|
| **Continuous** | Infinite scroll across period boundaries; the header updates as you pass into a new period | Browsing, scanning for something half-remembered |
| **Stepped** | One period at a time, swipe or arrow between them, edges snap | Reviewing a specific month, reconciling |

Both render the same cells; only traversal differs. Continuous is virtualized
in both directions, since 2020 to now is ~2,100 days.

**Future entries.** `recurring_transactions.next_date` (§6.2) projects
scheduled items forward, so the calendar shows what is coming as well as what
happened. Projected entries are visually distinct from posted ones and are not
included in any total that claims to be actual.

**Amounts follow the FX rules.** A day containing foreign transactions shows
its net in the current display currency, and opening the day reveals each entry with its
own `local · rate · main` (§7).

### 14.5 Dashboard layout

The dashboard is a **configurable grid of widgets**, not a fixed page.

```
dashboard_widgets   id, kind, slot, size, config, sort
```

| Widget | Sizes | Config |
|---|---|---|
| `net_worth` | S · M | Scope, currency |
| `spend_by_category` | M · L | Period, chart type (pie / donut / bar) |
| `income_vs_expense` | M · L | Period, granularity |
| `balances` | M · L | Groups shown, archived visible |
| `calendar` | M · L | Scale, navigation mode |
| `debt` | S · M | Direction, currency |
| `recent` | M | Row count |
| `unsettled` | S | — |
| `fx_status` | S | Pairs shown |

**Phase 1 ships preset layouts** — three or four arrangements you pick between.
Free drag-and-drop placement comes later, if the presets prove insufficient.
That order is deliberate: a layout engine is a lot of work to build before
knowing which arrangements are actually wanted, and presets answer the question
cheaply.

### 14.6 The React Native Web caveat

One codebase for iOS and web is the right default, and Expo makes it nearly
free. The known friction is dense data grids and charts — exactly what the
import review queue and the reports screens are.

**Plan:** build web via RN Web. If the dashboard genuinely fights it, add
`apps/web` as a Vite + React app reusing the same tRPC client and domain
package. The monorepo exists partly to make that split cheap; taking it is a
decision, not a failure.

### 14.7 Targets

Not budgets. A monthly spend **target** — one figure, or a small number of
them — shown as progress against actual.

| | Targets | Envelope budgets (not built) |
|---|---|---|
| Granularity | Overall, or a handful of categories | Every category |
| Period rollover | None | Unspent carries forward |
| Over-spend | Shown, no enforcement | Borrowing between envelopes |
| Surfaces touched | One widget, one settings row | Every screen showing a category |

```
targets   id, scope (overall | category_id), period (month | year),
          amount, currency, active_from, active_to
```

Rendered as a progress bar on the dashboard widget and in the calendar's period
header. Over-target is stated, never scolded — the figure goes `negative` ink
and nothing else changes.

This is roughly a fifth of the work of envelope budgeting and answers the
question that actually gets asked, which is *am I on track*. Money Manager's 13
budget definitions are preserved in the migration dump but not imported; the
shapes do not correspond.

---

## 15. Non-functional requirements

| Area | Requirement |
|---|---|
| Scale | ~8k transactions today, ~2k/year growth. Trivial for Postgres — do not over-engineer for it |
| Latency | Ledger queries < 100 ms on Pi hardware. Receipt extraction 2–5 s (model-bound). Agent turns 3–15 s |
| Availability | Best-effort. It is one Pi in a flat; offline-capable mobile covers outages |
| Backups | §5.4. The quarterly restore drill is mandatory |
| Observability | Structured JSON logs, 30-day retention. Health endpoint. Anthropic token spend tracked per feature |
| Testing | Migration verification (§8.4) is the critical suite. Parser fixtures per bank. Property tests on money arithmetic. Agent tool contract tests |
| Upgrades | `docker compose pull && up -d`. Drizzle migrations reviewed before applying — never auto-applied on boot |
| Hardware | Raspberry Pi 4/5, 4 GB+, **booting from SSD, not SD card** |

---

## 16. Phasing and estimates

Each phase is independently useful. Stopping after any of them leaves something
that works.

| Phase | Deliverable | Gate | Est. |
|---|---|---|---|
| **0. Migration** | Schema, importer, verification harness | All 52 balances match to the cent | 2 wks |
| **1. API + web read** | Hono + tRPC, dashboard, search, reports | You trust the numbers on sight | 2 wks |
| **2. Mobile** | Expo app, entry, accounts, offline outbox | Replaces daily Money Manager use | 2–3 wks |
| **3. Receipts** | Capture, extraction, line splits | Faster than typing it in | 2 wks |
| **4. Import** | Parsers, rules, classification, review | A month of statements in minutes | 3 wks |
| **5. Agent** | Tool calling, approval gates, audit | Answers what needs Excel today | 2 wks |
| **6. Export** | Excel workbook, `tax_ledger` view, PL adapter | Opens in Excel; manifest asserts zero personal rows | 1–2 wks |
| **7. Cutover** | Pi deploy, Tailscale, backups, restore drill | Money Manager read-only | 1 wk |

**Total: 15–17 weeks** of evenings and weekends. The agent phase is the least
certain — tool surfaces are easy, good agent UX is not.

Phase 0 before any UI. It is where the project proves viable, and a migration
bug found in week one is cheap.

---

## 17. Open decisions

Ordered by how much they block.

| # | Question | Blocks | Default if unanswered |
|---|---|---|---|
| ~~**O1**~~ | ~~Tax form?~~ | — | **Answered: ryczałt.** Revenue-only *ewidencja przychodów*, no cost side, outside JPK_PKPiR entirely. `PL_RYCZALT` is the first adapter built; `PL_KPIR` is defined but unimplemented. See §13.6 |
| ~~**O2**~~ | ~~VAT registered?~~ | — | **Answered: not registered.** Opting in later must not require a migration, so `counterparty_tax_id`, `document_ref` and `ksef_id` exist as optional fields from day one — but **no JPK_V7 handling is built**. Electronic KPiR therefore binds from 2027-01-01, not 2026-01-01 |
| **O3** | Does dedicated filing software already exist in your workflow? | §13.3 handoff | Assume yes; build export, not integration. Lower stakes under ryczałt — the record is a revenue register, not a book |
| **O4** | BYN and GEL historical FX back to 2020-11 — available? | §7.4, Phase 0 | Fall back to Money Manager's snapshot rates, flagged approximate |
| ~~**O5**~~ | ~~RUB post-2022 accuracy?~~ | — | **Decided:** use Money Manager's snapshot rate, marked `carried_forward`, and flag affected rows in reports rather than implying precision that does not exist |
| **O6** | `CARD-C` statement format (1,269 rows — second-highest volume) | Phase 4 parser priority | **Needs a sample file from you.** Until then the generic CSV parser with column auto-detection, falling back to manual entry |
| ~~**O7**~~ | ~~Budgets?~~ | — | **Answered: targets, not budgets.** A monthly spend target shown as progress against actual — no per-category envelopes, no rollover. See §14.7. The 13 Money Manager budgets are preserved in the migration dump but not imported |
| ~~**O8**~~ | ~~Off-site backup target?~~ | — | **Answered: Backblaze B2**, age-encrypted before upload so the provider holds ciphertext only. S3-compatible, so MinIO points at it by configuration |
| **O9** | Pi model and storage on hand | §15 | **Assumed:** Pi 5 / 4 GB / SSD boot. Correct me if it is a Pi 4 or SD-only — the latter changes the backup urgency, not the design |
| ~~**O10**~~ | ~~Are US and German obligations live?~~ | — | **Answered: all three eventually, none urgent.** Build the full adapter layer and **all three scheme definitions** (`PL_KPIR`, `PL_RYCZALT`, `US_SCHED_C`, `DE_EUER`) now while the design is fresh; implement adapters on demand. Poland first |
| **O11** | Residency periods, and any treaty / foreign-tax-credit interaction | `tax_residency`, §13.2 | Deferred until a second jurisdiction goes live. `tax_residency` exists so this is additive |
| ~~**O12**~~ | ~~Business backfill scope?~~ | — | **Answered: 2026 forward only.** Earlier rows stay personal unless explicitly marked. Nothing becomes reportable by omission, and it matches when the current rules took effect |
| ~~**O13**~~ | ~~"Synced with banks"?~~ | — | **Decided:** central-bank reference rates, quoted against the USD pivot. Realized rates are implied by the two amounts on a transfer or settlement, never fetched |
| ~~**O14**~~ | ~~Counterparties replace the loan accounts?~~ | — | **Decided: replace.** They exist only because Money Manager had no counterparty concept. `loan_receivable` / `loan_payable` survive as `account_kind` values for migration fidelity |
| ~~**O15**~~ | ~~Ageing on counterparty balances?~~ | — | **Decided: companies only.** Putting a 60-days-overdue badge on a friend's share of dinner is absurd; on an unpaid invoice it is the point |
| ~~**O16**~~ | ~~Dashboard layout?~~ | — | **Decided: presets first.** A layout engine is a lot of work to build before knowing which arrangements are wanted; presets answer that cheaply. Free placement only if they prove insufficient |

---

## 18. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Migration balances do not reconcile | Medium | Critical | Phase 0 gate; project stops until understood |
| R2 | Unmatched transfer legs (OUT 1,734 ≠ IN 1,754) | **High** | Medium | Explicit exception list; manual resolution before cutover |
| R3 | Historical FX unavailable for BYN/GEL | Medium | Medium | O4 fallback; flag affected rows rather than silently approximating |
| R4 | Scope creep into full tax compliance | **High** | High | §13 boundary is explicit; N1–N3 are non-goals |
| R5 | RN Web insufficient for the dashboard | Medium | Low | §14.6 escape hatch designed in |
| R6 | Pi SD card failure | **High** over years | High | SSD boot; nightly off-site backups; tested restore |
| R7 | Anthropic spend higher than expected | Low | Low | Rules tier absorbs the recurring set; per-feature tracking |
| R8 | Project stalls half-migrated, data split across two systems | Medium | **High** | Phases independently useful; Money Manager authoritative until Phase 7 |
| R9 | Agent writes bad data | Low | High | Approval gates on every write; full audit; soft delete |
| R10 | A personal expense reaches a tax output | Low | **Critical** | §13.1 — separate DB role with no privilege on `transactions`; fails loudly rather than quietly |
| R11 | `is_business` misclassification on 5 years of history | Medium | Medium | O12 — default personal, classify forward only; bulk reclassification is an audited, approved operation |
| R12 | Multi-jurisdiction generality never used, cost paid anyway | Medium | Low | Only the schema is built now (§13.2); US and DE adapters wait on O10 |

R8 is the one to watch. The failure mode for personal projects is not building
the wrong thing — it is abandoning it halfway with data in two places.

---

## Appendix A — Money Manager data inventory

From `exports/20260329_190058.mmbak`, 4.0 MB, SQLite (Core Data).

**Volume**

| Metric | Value |
|---|---|
| Transactions | 7,874 total · 7,621 active · 253 deleted |
| Date range | 2020-11-25 → 2026-03-28 |
| By year | 2020: 57 · 2021: 1,051 · 2022: 1,397 · 2023: 1,313 · 2024: 2,133 · 2025: 1,855 · 2026: 68 |
| By type | income 506 · expense 3,878 · transfer-out 1,734 · transfer-in 1,754 · adjustment 2 |
| Accounts | 68 total · 52 active |
| Categories | 122 · 37 top-level expense · ~60 sub · 9 income |
| Currencies | 7 — USD (main), PLN 51%, BYN 30%, EUR, GEL, GBP, RUB |

**Auxiliary tables**

| Table | Rows | Disposition |
|---|---|---|
| `ZREPEATTRANSACTION` | 24 | **Migrate** — real recurring rules |
| `ZBUDGET` / `ZBUDGETAMOUNT` | 13 / 16 | Defer (N7); preserve in dump |
| `ZTAG` / `ZTXTAG` | 2 / **0** | Nothing to migrate — tags unused |
| `ZPHOTO` | 3 | Migrate if trivial |
| `ZMEMO` | 4 | Negligible |
| `ZFAVTRANSACTION` | 1 | Ignore |

**Most active accounts**

| Account | Transactions |
|---|---|
| `BANK-A · PLN` | 1,775 |
| `CARD-C · BYN` | 1,269 |
| `Clearing · PLN` | 678 |
| `Household · USD` | 498 |
| `Cash · BYN` | 449 |
| `BANK-A/BIZ · PLN` | 385 |
| `Loan · PLN` | 361 |

**Known data-quality issues**

- 15 category names with trailing spaces
- 13 documented name collisions across levels
- Account names mixing `ł` and `l`
- `ZTYPE = 0` on all 68 accounts — the type field is unused
- Global, undated FX rates, described in the repo's own docs as possibly stale
- 20-row discrepancy between transfer-out and transfer-in counts

---

## Appendix B — Glossary

| Term | Meaning |
|---|---|
**Poland**

| Term | Meaning |
|---|---|
| **JDG** | *Jednoosobowa działalność gospodarcza* — Polish sole proprietorship |
| **KPiR / PKPiR** | *Podatkowa księga przychodów i rozchodów* — tax book of revenues and expenses |
| **Ewidencja przychodów** | Revenue-only register kept under ryczałt instead of a KPiR |
| **JPK** | *Jednolity Plik Kontrolny* — Polish SAF-T; JPK_V7 for VAT, JPK_PKPiR for the KPiR |
| **KSeF** | *Krajowy System e-Faktur* — national e-invoicing, mandatory for JDG since 2026-04-01 |
| **Ryczałt** | Lump-sum taxation on revenue, with no cost deduction |
| **Skala / liniowy** | Progressive (12%/32%) or flat (19%) income tax — both require a KPiR |
| **NIP** | Polish tax identification number |
| **NBP** | *Narodowy Bank Polski* — source of the FX rates Polish filing uses |

**United States**

| Term | Meaning |
|---|---|
| **Schedule C** | Form 1040 attachment: Profit or Loss from Business (sole proprietorship) |
| **IRC §162** | The ordinary-and-necessary test an expense must pass to be deductible |
| **§179D** | Energy-efficient buildings deduction — occupies Schedule C line 27a, pushing "other expenses" to 27b |

**Germany**

| Term | Meaning |
|---|---|
| **EÜR** | *Einnahmenüberschussrechnung* — cash-basis profit determination; filed as Anlage EÜR |
| **ELSTER** | The German tax authority's electronic filing portal — the only submission channel for Anlage EÜR |
| **SKR03 / SKR04** | Standard German charts of accounts — SKR03 organized by transaction type, SKR04 by function |
| **Kleinunternehmer** | §19 UStG small-business status; changes VAT treatment and which accounts apply |

**This system**

| Term | Meaning |
|---|---|
| **`.mmbak`** | Money Manager backup — a Core Data SQLite database |
| **Clearing account** | Wash account for shared expenses; should trend to zero (§6.4) |
| **Outbox** | Local queue of pending writes, drained on reconnect (§14.3) |
| **`tax_ledger`** | The business-only view every tax adapter reads; personal rows are unreachable from it (§13.1) |
| **Tax adapter** | Per-jurisdiction projection of `tax_ledger` into that jurisdiction's shape (§13.2) |
| **Tax scheme** | A versioned form or book — e.g. `PL_KPIR v2026`, `US_SCHED_C v2026` (§13.4) |
