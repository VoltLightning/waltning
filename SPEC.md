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
   reporting-currency amount. Seven currencies; USD is the main; PLN is 51% of
   volume and BYN 30%.
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
| G8 | See everything in Excel | Exports that open in Excel and look right |

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
| N7 | Budgets and goals | 13 budgets exist, lightly used. Deferred, not designed out |
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
| Web | React Native Web via Expo | One codebase; revisit if the dashboard fights it (§14.4) |
| Scope vs Money Manager | Core parity + receipts, import, agent | Skip budgets, goals, tags (0 rows used) |
| Users | Single | No auth complexity, no per-row ownership |
| Tax posture | Feeder and reconciler, not the book | §13.5 |
| Tax jurisdictions | Pluggable adapters — PL live, US and DE specified | §13.2 |
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
| `pg_dump --format=custom` | Nightly | Local volume, then age-encrypted off-site |
| Receipt images | On write | Mirrored to the same off-site bucket |
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
rate on the transaction date. `amount_main` is derived, stored only to keep
reporting cheap. Correcting a historical rate fixes every affected report with
one backfill.

**4 · Everything is audited.** `audit_log` records entity, action, actor
(`user` / `agent` / `import` / `migration`), and before/after JSON. When you are
your own accountant, "why is this categorized this way?" needs an answer
eighteen months later.

### 6.2 Entities

```
currencies              code PK, name, symbol, symbol_position, decimals, is_main
fx_rates                (base, quote, date) PK, rate, source
account_groups          id, name, sort
accounts                id, name, kind, currency, group_id,
                        opening_balance, opening_date, memo,
                        is_business, archived, sort, external_id
categories              id, parent_id →self, name, kind,
                        icon, color, archived, sort, external_id
transactions            id, date, type, account_id, to_account_id, category_id,
                        amount_original, currency, fx_rate, amount_main,
                        payee, note, is_business,
                        source, external_id, deleted_at
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
categories_no_self_parent        id <> parent_id
fx_rates_rate_positive           rate > 0
```

Plus unique indexes on normalized names, and partial unique indexes on
`external_id WHERE external_id IS NOT NULL` — the mechanism that makes
re-migration idempotent.

**Validation status:** this schema has been expressed in Drizzle, and
`drizzle-kit` generates clean PostgreSQL 16 DDL for all of it — expression
indexes, the `coalesce`-based sibling uniqueness index, partial unique indexes,
and every check constraint. It has not yet been applied to a live database end
to end.

### 6.6 Soft deletion

`transactions.deleted_at`. Money Manager carries 253 deleted rows it never
purges; the same escape hatch is wanted, and a hard delete in a financial
ledger is rarely the right default. Every read path filters
`deleted_at IS NULL`. Reference data (accounts, categories) uses `archived`
instead — never deleted, because history references it.

---

## 7. Money and FX semantics

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

### 7.3 Conversion

`fx_rates(base, quote, date) → rate`, converting one unit of `base` into
`quote`. Reporting is in USD (`currencies.is_main`).

- Historical rates backfilled daily from 2020-11-25.
- A transaction's `fx_rate` is fixed at its date and **does not** change when
  later rates arrive. A 2021 purchase is reported at 2021 rates.
- `amount_main` is materialized for query performance and always recomputable
  as `amount_original × fx_rate`.

**Cross-currency transfers** carry two rates — one per leg — because sending and
receiving accounts may differ in currency (`Household · USD` → `Cash · PLN`
appears in the data). The spread between them is real FX cost and should be
visible, not silently absorbed.

### 7.4 Rate sources

| Currency | Source | Notes |
|---|---|---|
| PLN | **NBP** (Narodowy Bank Polski) | Preferred — NBP rates are what Polish tax filing uses |
| EUR, GBP | ECB reference rates | Free, authoritative, full history |
| BYN | NBRB (National Bank of Belarus) | Availability back to 2020 to be verified |
| GEL | NBG (National Bank of Georgia) | — |
| RUB | NBP or ECB | Post-2022 quotes unreliable; see O5 |

Missing days (weekends, holidays) carry forward the last published rate — the
standard convention, and what NBP itself does.

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
| Categories | Rebuild the tree by `ZPUID`; verify no orphans |
| FX | Backfill `fx_rates`; recompute every `amount_main` |
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
- Recomputed `amount_main` monthly totals are within a stated tolerance of
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
| `FX Rates` | Rates actually used, so every USD figure is reproducible |

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

### 13.6 Prerequisites

Open, and blocking parts of this section (§17):

- **O1** — Polish tax form: skala, liniowy, or ryczałt. Ryczałt removes the
  entire cost side and reduces §12.3 to a revenue sheet.
- **O2** — VAT registration, which determines JPK_V7 and the electronic-KPiR
  timing.
- **O10** — Are US and German obligations **live**, or being designed for
  ahead of a possible move? Live means residency periods and possible
  double-taxation treaty handling. Anticipated means the schema carries the
  shape and the adapters wait.

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
| Transactions | Search, filter, infinite list, swipe to edit |
| Transaction detail | Full edit, receipt view, line splits, audit history |
| Accounts | Register, balances, archive toggle |
| Agent | Chat, tool-call cards, approval gates |
| Settings | Categories, rules, recurring, export, sync status |

### 14.2 Web — dashboard

Shares the codebase via React Native Web; different information density.

| Screen | Purpose |
|---|---|
| Dashboard | Charts, month-over-month, category breakdown |
| Import | Upload, review queue, bulk accept — keyboard-driven |
| Reports | Period comparison, category deep-dive, business view |
| Export | Build a workbook, download |
| Agent | Same conversation, wider canvas |

### 14.3 Offline behaviour

| State | Behaviour |
|---|---|
| Online | Direct tRPC; optimistic updates |
| Offline | Reads from local SQLite cache; writes to outbox |
| Reconnect | Outbox drains in order; server is authoritative |
| Conflict | Last-write-wins. Single user, single writer — anything more is unjustified |

### 14.4 The React Native Web caveat

One codebase for iOS and web is the right default, and Expo makes it nearly
free. The known friction is dense data grids and charts — exactly what the
import review queue and the reports screens are.

**Plan:** build web via RN Web. If the dashboard genuinely fights it, add
`apps/web` as a Vite + React app reusing the same tRPC client and domain
package. The monorepo exists partly to make that split cheap; taking it is a
decision, not a failure.

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
| **O1** | **Tax form — skala, liniowy, or ryczałt?** | §12.3, §13 | Assume KPiR applies; build the fields, defer the sheet |
| **O2** | **VAT registered? JPK_V7M or V7K?** | §13.1 timing | Assume not registered |
| **O3** | Does dedicated KPiR software already exist in your workflow? | §13.3 handoff design | Assume yes; build export, not integration |
| **O4** | BYN and GEL historical FX back to 2020-11 — available? | §7.4, Phase 0 | Fall back to Money Manager's snapshot rates, flagged approximate |
| **O5** | RUB post-2022 — does accuracy matter for those rows? | §7.4 | Use the snapshot; flag in reports |
| **O6** | Belarusian card statement format (1,269 rows) | Phase 4 parser priority | Manual entry until a sample exists |
| **O7** | Budgets — genuinely wanted, or dropped? | N7 | Dropped; data preserved in the migration dump |
| **O8** | Off-site backup target (S3? Backblaze? another machine?) | §5.4 | Backblaze B2, age-encrypted |
| **O9** | Pi model and storage on hand | §15 | Assume Pi 5 / 4 GB / SSD |
| **O10** | **Are US and German obligations live, or anticipated?** | §13.3 build order | Anticipated — schema carries the shape, adapters wait |
| **O11** | If live: residency periods, and any treaty / foreign-tax-credit interaction | `tax_residency`, §13.2 | Single jurisdiction at a time, no overlap |
| **O12** | How far back must business rows be reclassified? 5 years of history predates any tax intent | §13.1 backfill | From 2026 forward only; earlier rows stay personal unless marked |

---

## 18. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Migration balances do not reconcile | Medium | Critical | Phase 0 gate; project stops until understood |
| R2 | Unmatched transfer legs (OUT 1,734 ≠ IN 1,754) | **High** | Medium | Explicit exception list; manual resolution before cutover |
| R3 | Historical FX unavailable for BYN/GEL | Medium | Medium | O4 fallback; flag affected rows rather than silently approximating |
| R4 | Scope creep into full tax compliance | **High** | High | §13 boundary is explicit; N1–N3 are non-goals |
| R5 | RN Web insufficient for the dashboard | Medium | Low | §14.4 escape hatch designed in |
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
