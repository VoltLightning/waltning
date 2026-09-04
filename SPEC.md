# Waltning — System Specification

A self-hosted personal finance system: React Native app, web dashboard, receipt
scanner, statement import, and an LLM agent over a Postgres ledger you own.

Replaces [RealByte Money Manager](https://www.realbyteapps.com/) and the
`mm-tools` Python pipeline in `<path-to-mm-tools>`.

**Status:** target specification. This document describes the finished system,
not implementation progress.
**Last updated:** 2026-08-05

**The interface is specified separately**, in [`docs/specification/`](docs/specification/):
principles, design system, 15 journeys, 29 screens. This document specifies what
sits underneath it.

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
| Network access | **Three modes — Tailscale, LAN, public.** No port is ever forwarded in any of them | §5 |
| Database | PostgreSQL 16 | Exact numerics, real constraints, one dependency |
| Language | TypeScript end to end | One language across API, web, mobile |
| Repo | Monorepo, pnpm workspaces | Shared types; `pnpm deploy --filter` for lean Pi images |
| Mobile | Expo (React Native) | **iOS and Android, both targets.** One codebase; the two places they genuinely diverge are below |
| Web | React Native Web via Expo | One codebase; revisit if the dashboard fights it (§14.6) |
| Scope vs Money Manager | Core parity + receipts, import, agent | Skip budgets, goals, tags (0 rows used) |
| Users | Single | No auth complexity, no per-row ownership |
| Tax posture | Feeder and reconciler, not the book | §13.5 |
| Tax jurisdictions | Pluggable adapters — PL live, US and DE specified | §13.2 |
| Currency | **No main currency.** USD pivot for rate storage; display currency is a header toggle | §7.0 |
| FX rates | Reference rates synced on app open; realized rates from actual amounts; manual override at three levels | §7.3, §7.6 |
| Personal expenses | Structurally excluded from every tax output | §13.1 |
| Apr–Aug 2026 gap | Entered manually in Money Manager first | Migration runs against a later backup |

**Three targets, and the shared codebase carries almost all of it.** The places
that do not come free are worth knowing before rather than after.

**Tabular figures, on Android.** React Native declares `fontVariant` on
`TextStyleIOS` and not on `TextStyleAndroid`, so tabular figures — which
`design-system/02` §2.2 makes mandatory, being what lets a money column align —
cannot be switched on there. The system stays correct because `<Amount>` renders
in a face whose digits are tabular *by default* (measured: IBM Plex Sans's ten
digits are all 600 font units at every weight; Figtree's, the face it replaced,
spanned 413 to 641). That is a permanent
constraint on font choice: a face whose digits are proportional cannot be adopted
however well it reads, because on Android there is no switch to compensate.

**Device custody, on both phones.** The two platforms do not offer the same
primitives. iOS protects per file — a protection class whose key is evicted at
lock, a Keychain item pinned to one device, a watchdog that kills a process
holding a locked file at suspension. Android encrypts at the device level, with
a key resident from first unlock until reboot, and it governs background
execution by its own rules. Neither set is the other under different names, so
§5.7 states every control on both, agreeing where they agree and saying so where
the same reasoning reaches different conclusions. That section, not this one, is
where the divergence is settled.

**The local database, on web.** `expo-sqlite`'s web build cannot host the ledger
— §5.7 records the specific defects — so web reads through the server rather
than a local replica. Everything above the transport is shared; what the web
build does not have is the offline half.

---

## 4. Architecture

### 4.1 Topology

```
┌─ Phone (iOS·Android) ──┐   ┌─ Laptop browser ──────┐
│  Quick entry           │   │  Dashboard, import    │
│  Receipt camera        │   │  review, reports      │
│  Agent chat            │   │  Agent chat           │
│  SQLite outbox         │   └───────────┬───────────┘
└───────────┬────────────┘               │
            │        tRPC over HTTPS     │
            └──────────────┬─────────────┘
                           │
              ╔════════════▼═════════════╗
              ║   Tailscale (WireGuard)  ║   default of three modes
              ╚════════════┬═════════════╝
                           │
              ┌────────────▼──────────────────────┐
              │  Raspberry Pi · Docker Compose    │
              │                                   │
              │  caddy ─┬─ api (Hono + tRPC)      │
              │         └─ web bundle (static)   │
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
                    │  model provider(s) │
                    │  per assist (§11.4) │
                    │  FX rate provider  │
                    └────────────────────┘
```

**Caddy serves the web bundle and proxies the API** — `/trpc/*` to `api`,
everything else to a static export of the same Expo codebase, with an SPA
fallback. There is no Node process rendering HTML. Routing, cache headers and the
build-version check are in `architecture/05-deployment.md`; the physical layer —
what the Pi actually is, and what each part costs when it fails — is in
`architecture/01-context-and-containers.md`.

### 4.2 Repository layout

```
waltning/
├── packages/
│   ├── core/         contracts: money.ts, shared types, Zod schemas, registry defs
│   ├── db/           Drizzle schema and client — depends on core
│   └── ui/           component library — atoms · molecules · organisms
├── apps/
│   ├── api/          Hono + tRPC server
│   │                   modules/<domain>/ = operation + service + tests
│   │                   common · infra · registry · http · trpc (composition)
│   └── mobile/       Expo — iOS and web from one codebase
│                       src/features/<name>/ = ui · model · api
│                       app/ = expo-router routes, the only layer that fetches
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

`packages/core` exists from day one, and it is the **bottom** of the dependency
graph: `api → db → core ← mobile`. The earlier plan — create it when a second
consumer appears — was reversed, because deferral is a trap for whoever writes
the first mobile code: `money.ts` would be imported from `packages/db`, which
drags the Postgres driver into a phone bundle, and the "file move plus an import
path" lands on someone else's task. `core` must run identically on phone, web
and server: decimal.js and zod only, no Node APIs, no database driver.
`mobile` never imports `db`.

### 4.3 Stack and rationale

| Layer | Choice | Why this, not the obvious alternative |
|---|---|---|
| HTTP | Hono | Smaller and faster than Fastify on ARM; runtime-agnostic |
| API contract | tRPC | End-to-end types across mobile and web with zero codegen. REST would need OpenAPI plus a generator |
| ORM | Drizzle | SQL you can read, migrations you can review. Prisma's engine binary is a liability on ARM |
| Validation | Zod | Shared client/server; tRPC-native |
| Money | `numeric(20,8)` + decimal.js | Floats are wrong in a ledger. Scale 8 covers crypto |
| Mobile | Expo | Managed workflow, EAS builds; camera and secure-store solved. **Install its packages with `expo install`, never the npm latest** — SDK 57 wants React Native 0.86.2, and pinning 0.87.0 breaks the web bundler with an error that names a missing file rather than a version mismatch |
| Blobs | MinIO | S3 API locally; swap to real S3 for offsite without code change |
| Reverse proxy | Caddy | Automatic TLS, trivial config |
| Packages | pnpm | Strict deps catch phantom imports before the Pi does; `pnpm deploy --filter` emits a self-contained API image |

**Deliberately not adopted:** Turborepo and Nx (four packages, no CI — nothing
to cache); GraphQL (one consumer; tRPC is strictly less machinery); Kubernetes
(it is one Raspberry Pi).

#### The rest of the stack

The table above is the backbone and stops there. A readiness audit found **fifteen
layers with no choice recorded** — every one of which gets decided by whoever
writes the first file that needs it, which is how a stack becomes an accident.

| Layer | Choice | Why this |
|---|---|---|
| **Test runner** | **Vitest** | ESM and TS native, no transform config. The database tests need a real Postgres, not a mock, so the runner's job is orchestration |
| **Device SQLite** | **`expo-sqlite`** | First-party, async API, tracks each SDK, does not fight EAS. `op-sqlite` is genuinely faster via JSI — and for the whole ledger (~8,000 rows, single-digit megabytes — §14.0) the bottleneck is a Pi over WireGuard, not the driver |
| **Client cache** | **TanStack Query** (tRPC's client is built on it) | **Memory-only persistence.** Persisting it to disk is the standard Expo pattern and would silently promote arbitrary server responses into the encrypted container, breaking §14.3's account of what the replica holds |
| **List virtualization** | **`@shopify/flash-list`** | The calendar is ~2 100 days and the transactions list reaches ~25 000 rows. `FlatList` does not hold S11's 150 ms budget at that size |
| **Routing** | **`expo-router`** | File-based, one tree for native and web — which matters because they are one codebase (§14.6) |
| **Charts** | **`victory-native`** + `react-native-svg` | Already flagged as the RN Web friction point (`platform-notes` §11). Line, bar, donut, pie, area and sparkline are fine; **treemap is the one that likely needs a web-only path**, and it is S25-only |
| **Password hash** | **`@node-rs/argon2`** | Rust napi bindings with prebuilt arm64. The node-gyp `argon2` package builds from source on the Pi, which is slow and fragile |
| **TOTP** | **`otplib`** | RFC 6238, no surprises |
| **Logging** | **`pino`**, with **`pino-pretty` as a dev-only transport** | §15 asks for structured JSON at 30-day retention; pino is the low-overhead answer and the overhead matters on this hardware. JSON is unreadable while developing, so the pretty transport is wired in dev and **never in the image** — structured output is what the Pi retains and what S30 reads |
| **Excel export** | **`exceljs`** | §13.3 specifies a *streaming* writer, which rules out building a workbook in memory. SheetJS's community build has a licensing and CVE history worth avoiding |
| **Image manipulation** | **`expo-image-manipulator`** | Decodes at reduced scale via ImageIO. Full-decode-then-resize is 48.8 MB of bitmap per capture and a jetsam kill at ten (C26) |
| **Dates and zones** | **`date-fns` + `date-fns-tz`** | Accounting dates are **bare dates** (§7.0a) and must never go through JS `Date` arithmetic. The zone work is `capturedTz` resolution, not general date maths |
| **Model clients** | **`openai` SDK** for OpenAI *and* OpenRouter (it is OpenAI-compatible) · **`@anthropic-ai/sdk`** if Anthropic is configured | Behind one gateway interface, so §11.4's per-assist provider choice stays configuration |
| **Migration runner** | **`drizzle-kit migrate`**, in the one-shot `migrate` service | Never `push` — it cannot see triggers, views, grants or generated columns |
| **Scheduling** | **A `cron` service in Compose** | Nightly dump, invariant checks, FX backfill. In-process scheduling dies with an API restart and gives no record that a run was missed |
| **Brand icons** | **`simple-icons`, bundled** | S34's service icons (§14.4a). A logo CDN is rejected on principle: fetching `netflix.com`'s logo per render tells a third party you pay for Netflix, and it breaks offline rendering. Brands are occasionally *removed* from simple-icons for legal reasons, so a contract test asserts every catalog slug resolves in the installed version — the upgrade fails loudly instead of rendering blanks |
| **Localization** | **`i18next` + `react-i18next`**, catalogues in TypeScript · **`expo-localization`** for the device's languages · **`@formatjs` polyfills** for `Intl.PluralRules` | Chosen against Lingui, which is the better authoring experience and needs a Babel macro plus a Metro transformer. `packages/ui` is built by **two** bundlers — Metro for the phone, Vite for Storybook and the tests — so a macro is two pipelines to keep in step and a test that sees un-expanded macro calls when they drift. i18next needs no build step and behaves identically under Metro, Vite, vitest and Node. **The catalogues are `.ts`, not `.json`**: the English file is the type, so a language missing a key does not compile. Hermes ships no `Intl.PluralRules`, and Polish has four plural categories — hence the polyfill |
| **Component workshop and visual gate** | **Storybook** (`react-native-web-vite`) + **Playwright** + **`axe-core`** | The design system's rules are visual, and a rule that is not a test is not a rule. Storybook renders every component under `react-native-web` in both themes; Playwright drives them; `axe-core` asserts the contrast ratios `design-system/10` specifies. It runs in `pnpm verify` as `test:visual` — 145 checks — which is why a theme change cannot land a component that fails contrast in the theme nobody opened |
| **Client diagnostics** | **LogTape** | `pino` is the *server's* logger and depends on Node streams, so it cannot ship to a phone. LogTape is dependency-free and runs in Hermes, a browser and Node unchanged — which is the property `architecture/12`'s one propagated request id needs, because a diagnostic that stops at the network boundary cannot correlate the two halves of a failed write |
| **Formatting and linting** | **Biome** | One binary replaces Prettier, ESLint, `typescript-eslint`, `eslint-config-prettier` and an import sorter — five packages whose versions must agree, maintained by one person over years. It also has to be fast: the pre-commit gate and the pre-cutover checklist both run it, the second **on the Pi** |

A **sixteenth** layer, found after that audit and in the same shape — nobody had
chosen how code gets formatted, so the first file written would have decided it.

#### Why not Airbnb, Standard, or a named style guide

Because they are no longer maintained, and the question they answered is no
longer asked. `eslint-config-airbnb` last shipped **2021-12-25** and its peer
range stops at ESLint 8; the current ESLint is 10. `eslint-config-standard` last
shipped 2023 and also caps at 8. Neither installs against a modern toolchain
without `--force`.

They died for a structural reason worth understanding: most of their rules were
*formatting* rules, and formatters made those obsolete. What replaced the style
guide is a division of labour — **a formatter owns formatting and you take its
defaults; a linter owns correctness only.** There is no modern equivalent of
"we follow Airbnb", and picking one would be adopting a 2021 answer to a 2021
problem.

`lineWidth` is the one default this repo overrides, from 80 to 100, and it was
measured rather than guessed. At 80 Biome shatters Drizzle's index and `check`
chains across three and four lines each; at 120 it collapses hand-wrapped
declarations that were readable. At 100 the same file goes the other way and
puts short enums back on one line. The schema is the bulk of the code and it is
declarative, so it is what the setting should be tuned against.

**What this gives up:** `eslint-plugin-drizzle`, whose two rules catch an
`update` or `delete` with no `where` — a real hazard in a ledger. It is a 0.2.x
package, and pulling ESLint and five companions back in to get it would trade
the whole argument above for two rules. The compensating controls are that
every write goes through the operation registry (§11.0) and that the period
guard trigger blocks edits to filed rows. **If it ever bites, adding ESLint for
that plugin alone is contained** — Biome keeps formatting, ESLint lints.

#### Strictness, and the only automated gate

`tsconfig.base.json` was already strict; it is now strict in the ways that
matter for money. Beyond `strict`, `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`, it adds `noImplicitReturns` — a branch that
forgets to return yields `undefined` where a figure was expected, and
`undefined` renders as nothing rather than failing — plus
`noPropertyAccessFromIndexSignature`, so configuration is read by bracket and
typed honestly as `string | undefined` rather than the compiler's lie that
`process.env.FOO` is a `string`. All of it passes today with zero errors.

There is no CI, by decision (`07-test-strategy`). That makes **`.githooks/pre-commit`
the only automated thing between an edit and history**, so it is installed by
`git config core.hooksPath` from the `prepare` script rather than by a hook
manager, and it is kept under two seconds so it is never worth skipping. It
refuses key material and financial-data file types even when force-added, runs
Biome over staged files without rewriting them, and typechecks the whole
program. It also sweeps the staged diff against a **gitignored** term list —
the real names this specification replaced with placeholders — because one bank
name did creep back in while writing prose, and a lesson that depends on
remembering is not a control.

**Two are provisional and named as such:**

| Layer | Status |
|---|---|
| **Push notifications** | `expo-notifications` routes through Expo's push service — a **third party in the path** of a system whose whole argument is physical custody (O17). Direct APNs from the Pi keeps it first-party at the cost of an Apple key and more code. **Decide before S30's push conditions ship**, not after |
| **Speech recognition** | Pending the `en-*` on-device spike. If it works, `expo-speech-recognition`; if not, S08 stays online-only and the grammar carries offline capture |

**Package names and APIs move.** Verify each against its current docs when you
add it — this table records *what was chosen and why*, and the why is the part
that survives a version bump.

---

## 5. Security and network design

Five years of complete financial history, plus business records. The threat
model is not "a determined attacker targets me" — it is "this ends up reachable
from the internet and something automated finds it."

### 5.1 Access model — three modes, and one invariant

**The invariant is that no port is ever forwarded.** Not "no public ingress" —
one of the three modes is deliberately public, and pretending otherwise would
be the kind of claim this specification exists to stop making. What holds in all
three is that the Pi never accepts an inbound connection from a router: every
mode is either private or reached through an **outbound-only** tunnel the Pi
itself establishes.

That distinction is worth being precise about, because a forwarded port is the
one arrangement where an unpatched service is discovered by mass scanning
regardless of whether anybody knows the address.

#### The three modes

| Mode | Reaches it | TLS | Perimeter | Costs |
|---|---|---|---|---|
| **Tailscale** (default) | Anywhere | Tailscale cert for `waltning.<tailnet>.ts.net` | The mesh | Every device runs a VPN client |
| **LAN** | Home only | A **real** cert via DNS-01 for a name whose `A` record is the private IP | Your home network | Does not follow you out of the house |
| **Public** | Anywhere, any browser | Funnel or Cloudflare (below) | **Authentication alone** | §5.2 must be right, not merely written |

**The first two are not ranked against each other; the third is ranked below
both, explicitly.** LAN mode is not a degraded Tailscale — it exposes strictly
less, because there is no mesh to join and no node to revoke. Public mode is
genuinely weaker than either, and is offered anyway because requiring a VPN
client is a real barrier and password-plus-TOTP is what a great deal of serious
self-hosted software ships behind.

In the first two modes a flaw in authentication is survivable, because nothing
unenrolled can reach it. That is why §5.2 is described there as defence in
depth. In the third it is the only line.

**LAN mode needs a real certificate, and that is not cosmetic.** §5.2's session
cookie is `Secure`, and browsers do not send `Secure` cookies over plain HTTP.
Serving the dashboard on `http://192.168.x.x` therefore does not produce a
slightly-less-private system; it produces one where **you are logged out on
every request**. A self-signed certificate replaces that with a click-through
warning trained into muscle memory, which is its own cost. DNS-01 against a
domain you control issues a valid certificate for a name resolving to a private
address, with nothing exposed to obtain it.

#### The clients do not have the same requirement

| Client | Modes | Why |
|---|---|---|
| **Web** | LAN **or** Tailscale | A browser at a desk. LAN covers the common case; Tailscale covers the rest |
| **Mobile** | Tailscale | It has to work away from home, and it is the client that already carries a session token and a replica |

**Mobile's bar is lower than it looks, because the app is offline-first.**
`architecture/08` gives it a replica and an outbox, and §5.7 refuses to drain
while locked at all — the sync control drains on tap. So *"reach the backend
when I am not home"* means **sync when it can**, not hold a connection. A
transport that works most of the time satisfies it completely, which is why
Tailscale needs no companion.

**The one real risk is iOS's single VPN slot.** A work VPN or a privacy VPN
displaces Tailscale, and the app then looks offline while the phone plainly has
internet. This is already a named `link` state with its own remedy (§14.3) —
*"another VPN holding iOS's single tunnel slot"* — and it stays a named state
rather than a thing to engineer around. The outbox is what makes it survivable:
the queue waits, and nothing is lost.

#### What is deliberately not a mode

**A forwarded port, with or without dynamic DNS.** The asset here is five years
of complete financial history and the records behind a tax filing. A public port
means the login route is permanently exposed to background scanning and every
dependency in the stack becomes internet-facing; one authentication bypass
anywhere in that tree exfiltrates the most sensitive data a person holds, and
**nightly encrypted backups do not help — they protect against loss, not
against copying.**

#### If a public URL ever earns its place

Two ways to get one without forwarding a port. **They are not ranked, because
they give up different things** — and the intuitive ranking is backwards, which
is why this is written down rather than re-derived.

| | Who can read the dashboard in plaintext | What reaches the app unauthenticated |
|---|---|---|
| **Tailscale Funnel** | Only you | Waltning's own login page, publicly |
| **Cloudflare Tunnel + Access** | Cloudflare | Nothing — the identity gate sits in front |

**Funnel does not decrypt.** TLS terminates on the node; the relays forward
encrypted bytes — *"Funnel relay servers do not decrypt the traffic between
public devices and your device."* **Cloudflare Tunnel with a public hostname
does** terminate TLS at the edge, because that is what serving a public HTTPS
site through a proxy network means.

So the first instinct — that Cloudflare is the safe grown-up option and Funnel
is the hacky one — has it the wrong way round on the axis this project cares
about most. Cloudflare puts a third party in the path of a system whose first
paragraph objects to exactly that. Funnel keeps every byte yours and instead
makes the login page the perimeter, which is what §5.1 opens by arguing
against — and **a Funnel hostname is published in certificate transparency
logs**, so it is a public URL, not an obscure one.

Either is defensible with mandatory TOTP, Argon2id and login rate limiting
actually built and tested. Neither is free.

#### Public mode — supported, and the weakest of the three

**Adopted as a third mode**, because requiring a VPN client is a real barrier
for anyone self-hosting this, and password-plus-TOTP in front of a personal
service is what a great deal of serious software ships. It is offered with its
cost stated rather than withheld.

| Mode | Reaches it | Perimeter |
|---|---|---|
| Tailscale | Anywhere | The mesh. Auth is defence in depth |
| LAN | Home only | Your home network. Auth is defence in depth |
| **Public** | Anywhere, any browser | **Auth, and nothing else** |

That last row is the whole difference. In the first two modes a flaw in
authentication is survivable because nothing unenrolled can reach it. In the
third there is no second line, so every promise §5.2 makes has to be true rather
than merely written.

**Hard prerequisite: §5.2 ships first.** The API is currently open by
construction — *"authentication arrives with the session card; until then this
is open."* Enabling public mode before then does not weaken the perimeter, it
publishes the ledger. This ordering is not advice.

**What public mode additionally requires**, none of which matters behind a VPN:

- **Rate limiting per account as well as per IP.** IPv6 rotation makes per-IP
  limiting close to decorative on its own.
- **Lockout that cannot be weaponised.** Locking an account on failed attempts
  hands an attacker a denial-of-service against the only user. Throttle
  exponentially; never lock permanently.
- **No account enumeration** — the same message *and the same timing* for an
  unknown user as for a wrong password.
- **No version disclosure — and hashing the SHA is not how.** `/healthz`
  publishes the build SHA, which against a public repository names the exact
  commit and therefore the exact known issues. An earlier draft proposed
  replacing it with a short hash of that SHA. **That was wrong and was
  demonstrated wrong:** a keyless digest of a value drawn from an enumerable
  public set is an identity function to anyone holding the set — a table over
  the repository's own history reversed it in under a millisecond. It also
  addressed one emitter of four; the SHA is stamped on **every** response header
  by Rule 0's own middleware, returned by `ping`, and inlined into the web
  bundle. The build identity must therefore be **a per-deploy random token,
  generated at deploy time and unrelated to the commit**, injected into both
  images from one place. `isStaleBundle()` only ever compares two values, so
  skew detection is unaffected.
- **`/readyz` requires authentication**, since it reports which dependency is
  down. `degraded` is then only observable while signed in, which is acceptable:
  `unauthenticated` is already its own state.
- **HSTS**, and the security headers a browser-facing origin needs.
- **Recovery codes generated and stored offline before it is enabled**, because
  a locked-out account is now a locked-out system with no LAN path in.

**It is documented as the weakest option, and the docs say so in the same
breath as offering it.** Someone choosing convenience should know what they
bought; someone who wants the strong version should not have to infer that the
default exists for a reason.

#### Tailscale mode, in detail

Everything below describes **Tailscale mode only**. It sat unlabelled beneath
the public-mode paragraph for one revision, where it read as a description of
public mode — promising node revocation and tailnet ACLs to a configuration that
has neither.

| Property | How |
|---|---|
| Transport | WireGuard, mutually authenticated; keys never leave devices |
| Identity | Tailscale SSO; device enrollment explicit and revocable per device |
| TLS | Tailscale-issued certs for `waltning.<tailnet>.ts.net`, auto-renewed by Caddy |
| Segmentation | Tailscale ACLs restrict the tailnet to this service on this port |
| Key rotation | Node key expiry left **on**, forcing periodic re-auth |
| Lost device | Revoke that node in the admin console — no password reset, no re-issue |

**Consequence to accept in this mode:** the phone runs Tailscale permanently,
and so does any device that wants access from outside the house. A laptop at
home does not — that is what LAN mode is for.

An earlier draft ended this paragraph with *"a borrowed laptop anywhere gets
nothing in either mode, by design"*, which stopped being true thirty-five lines
above it: a borrowed laptop is exactly what public mode exists to serve.

**Worth doing before deployment:** audit what else on the LAN publishes ports.
Development stacks routinely bind `0.0.0.0` rather than loopback, which makes
them reachable from anything on the network. Adding another always-on box is a
good moment to check, since the new box inherits whatever the network already
tolerates.

### 5.2 Authentication

Single user, but real — **and this is the perimeter now, not §5.1.**

That inversion is deliberate. A network decides who may open a socket, which is
not the same question as who you are, and making it the perimeter meant a VPN
client was a prerequisite for anyone else running this at all. §5.1 is a
deployment choice; this section is the security boundary, and it has to be
strong enough to stand alone in the mode where it does.

**The full design, with its evidence, is
[`architecture/13-identity-and-access.md`](docs/specification/architecture/13-identity-and-access.md).**

#### Passkeys, and no password at all

- **A passkey with `userVerification: "required"` is the multi-factor.** Two
  factors in one gesture: the authenticator you hold, and the biometric or PIN
  that unlocks it. Without UV required the server accepts a credential that was
  never unlocked, and it silently becomes one factor.
- **`residentKey: "required"`**, so login needs no username.
- **`authenticatorAttachment` unset**, which is what lets 1Password, Bitwarden
  and hardware keys register at all. Restricting to `platform` would exclude
  every one of them, and the symptom would look like a broken password manager
  rather than a server setting.
- **No password exists in the system.** Argon2id, its tuning on the Pi, and
  timing-equality between unknown-user and wrong-password all leave with it.

#### TOTP is an additional factor, never an alternative one

An account's strength is `min(login, recovery)`, so a second path to a full
session is a weaker path rather than a spare one. Phishing kits already exploit
this directly, rewriting the login page to hide the passkey option.

So TOTP lives in exactly two places: **step-up** on operations that deserve a
fresh proof of intent — the §11.2 tax-sensitive set, closing a period, enrolling
a device — and as the **only** factor on a deployment with no domain, where
WebAuthn is impossible and the weakness is stated rather than hidden. It is
never a *"trouble with your passkey?"* link.

#### The app authenticates through a browser it does not own

A native iOS app **cannot** use passkeys against a domain unknown at build time
— the entitlement is inside the code signature and the association file is
fetched by Apple's CDN. So the app opens the user's own server's login page in
`ASWebAuthenticationSession` and receives a per-device credential. It has no
password field, no TOTP entry and no WebAuthn call, which is what keeps
self-hosting possible and what lets the server change how it authenticates
without touching the client.

#### Recovery is a CLI on the box

`waltning enrol` mints a short-TTL single-use token over SSH. No endpoint to
phish, nothing to print, nothing to lose. The recovery channel is harder to
compromise than the login, which is the test a printed code fails.

#### Sessions

- **Opaque and database-backed**, shaped `id.secret` — the id is safe in an
  audit row, a log line and a *your devices* screen; the secret is not. ≥128
  bits, SHA-256 at rest, constant-time compare.
- **Bearer on native, cookie on web.** Not a preference: React Native shares one
  process-wide cookie store, `credentials: "omit"` does not work, and
  `Set-Cookie` on a 302 is broken.
- **Refresh rotation with reuse detection**, revoking the whole family on replay.
- **Never bound to an IP**, which changes constantly on mobile.
- **30-day sliding, and the deviation is argued rather than assumed.** NIST AAL2
  is 24 hours absolute and 1 hour inactive; the justification is §14.3's offline
  design, where a session expiring mid-trip strands the outbox.
- Rate limiting keyed on the **account**. Per-IP is decorative once a /64 can
  rotate.

### 5.3 Secrets

| Secret | Where it lives | Never |
|---|---|---|
| Model provider key(s) | Pi environment, injected by Compose. One per configured provider (§11.4) | App bundle, git, or a prompt |
| Postgres password | Docker secret / `.env` (0600, gitignored) | Committed |
| Session signing key | Generated on first boot, persisted to a mounted volume | Hard-coded |
| **Three database URLs** | `MIGRATE_` (superuser, migrations only) · `APP_` (DML, not superuser) · `EXPORT_` (SELECT on `tax_ledger`) | Collapsed into one. The separation *is* T1 (§13.1) |
| MinIO credentials · B2 key and bucket · `age` recipient | Pi environment | Anywhere the phone can reach |

**The full configuration surface is `.env.example`.** This table listed four
secrets; standing the system up needs about twenty variables, and the three
database URLs are the ones that carry a guarantee rather than a value.
| Backup encryption key | `age` key on a hardware token, plus a paper copy off-site | On the Pi alone |
| Phone-alone export key | `age` key escrowed in **iCloud Keychain** (Apple's HSM-backed escrow); the ciphertext export goes somewhere Apple is **not** — a Mac, a NAS, later the backend (`architecture/14-local-first.md` §14.3) | Both halves — key and ciphertext — in the same vendor's custody |

All model calls originate from the API container. The phone never holds an
Anthropic key.

### 5.4 Backups and disaster recovery

The Pi is a single point of failure with an SD card in it. Assume it dies.

| What | Cadence | Where |
|---|---|---|
| `pg_dump --format=custom` | Nightly | Local volume, then age-encrypted to **Backblaze B2** |
| Receipt images | On write | **age-encrypted, then** mirrored to the same B2 bucket. MinIO is S3-compatible, so the mirror is configuration; the encryption is not, and is the part that must not be skipped |
| Retention | 30 daily, 12 monthly, 3 yearly | — |
| **Restore drill** | **Quarterly, to a scratch container** | An untested backup is not a backup |

Boot from SSD, not SD card. SD cards fail under database write patterns, and
they fail silently for a while first.

### 5.5 Data handling

- Postgres bound to the Docker network only; never a published port.
- Receipt images and OCR JSON retained indefinitely — they are the evidence
  trail behind every business expense claim. Retained indefinitely and
  photographs of five years of your life, they are the one artifact that leaves
  your custody, so they leave it as ciphertext (§5.4).
- The repo contains no financial data. `.gitignore` excludes `*.mmbak`,
  `*.sqlite`, `/data/`, `/receipts/`, `/backups/`, `*.dump`, `.env`.
- Agent conversation history is stored (it is an audit trail) and deletable per
  session.

### 5.6 Deliberately not done

Vault (four secrets, one host). And, **in Tailscale and LAN modes only**:
client certificates (Tailscale already does mutual authentication), a WAF (no
public traffic to filter), intrusion detection (nothing to detect on a closed
network).

**Those three justifications do not survive public mode**, and saying so is the
point of qualifying them. A deployment with a public URL has public traffic, is
not a closed network, and has no tailnet mutual authentication — so the
reasoning that retired them is void there and the question is genuinely open
again. It is not reopened here because public mode is not yet built; it must be
before it is.

**Multi-tenancy — deferred rather than rejected.** The entries above are
permanent; this one is a *not yet*.

It is worth stating precisely **because §5.2 has just made the wrong answer look
easy.** With a public URL and real authentication in place, sharing this with
another person reads like a one-liner: issue them a passkey. It is not. What has
no answer is row ownership, tax scope per person, and whose session a write
belongs to — and *"single user, but real"* is assumed by every table, not only
by the auth design. Adding a second credential to a single-tenant schema does
not produce two users; it produces two people sharing one person's ledger.

The irony is that the ledger already models people who owe each other money —
`counterparties`, debt, settlement. What it does not model is two people who
both *own* rows.

So if it arrives it starts at the data model and §13's tax isolation, not at the
perimeter and not at the login.

---

### 5.7 Device custody

**§5's threat model is about the network** — *"this ends up reachable from the
internet and something automated finds it"* — and §5.1 answers it well. §14.3
introduces a **physical** one, and it is the harder of the two to notice:
encryption is discussed sixteen times elsewhere in this specification and every
one of those is about data in transit or at rest on the server. This section is
about the device.

What the phone now holds: every account by name, every counterparty **by name
with per-currency debt balances**, the **whole ledger** — every transaction,
with payee text, not a recent window (`architecture/14-local-first.md` §14.0)
— and a queue of receipt photographs awaiting upload. It is also an enrolled
tailnet node, so it sits
*inside* perimeter ② by construction, and it carries a session token with a
30-day sliding expiry.

A stolen phone is therefore both the perimeter and the credential.

**"The phone" is two devices, and a third surface that holds nothing.** §3 ships
iOS and Android, and their storage protection is not one idea under two names. iOS protects per *file*, with a class whose key is evicted when the
screen locks. Android encrypts per *user*, with a key that survives every lock
until the device reboots. The web build has no local ledger at all. So the
controls below are stated per platform: where the two phones agree they agree
explicitly, where they agree for different reasons that is said, and the one
place the same threat gets two answers is the one decision in this section that
is **not made here**.

#### The decisions that do not depend on the platform

| Control | Decision |
|---|---|
| Backup without a backend | An app-owned, `age`-encrypted export the owner controls. **One vendor never holds both halves** (§5.3, `architecture/14-local-first.md` §14.3): on iOS the key lives in **iCloud Keychain** and the ciphertext goes somewhere Apple is not. **The Android escrow half is not settled**, and the obvious answer is wrong — a Keystore key is non-exportable, so an export keyed only from the Keystore dies with the device it existed to survive. Until it is settled, the Android owner holds the key themselves |
| Receipt spool | Downscaled at capture, EXIF stripped, written inside the app's **private container** — never the system photo library (`Photos`, `MediaStore`), never a directory the platform shares out (`UIFileSharingEnabled`; external storage or a `FileProvider` grant) |
| Lost device | **Two steps, not one:** revoke the tailnet node *and* kill the server-side session row. A *sign out everywhere* control lives on S30 |
| Replica | A **complete copy of the whole ledger** (§14.0). It is not evicted, and there is no TTL that drops it — the phone-in-a-drawer case is handled by the session and tailnet expiries above, not by deleting the record the phone holds |
| Store separation | `replica.db` and `outbox.db` are separate files, so a replica refetch — epoch mismatch, an explicit reset — never touches the outbox, which must survive independently of the replica's state. Both are in WAL mode, so **every protection below has to name the `-wal` and `-shm` siblings and not only the database**, and **no transaction spans them**: a capture commits its outbox entry first and alone, its replica row second, and a launch-time reconciler applies whatever a crash left between the two. The ordering, and why the irreplaceable half is the one that goes first, is `architecture/14-local-first.md` §14.6 |
| Inference artifacts | No on-device model ships (§14.3), so there is no prompt log to retain. If that changes, logging is off in release builds and any disk spill lives inside the app's protected storage |

#### The decisions that do

| Control | iOS | Android |
|---|---|---|
| **Drain never runs while locked** | **Refused.** Foreground, in-foreground network change, user tap, or silent push. This is the decision the file-protection row depends on | **Same four triggers, different reason.** Nothing here is weakened by a background drain, because there is nothing stronger to weaken; it is excluded because it is unreliable, not because it is unsafe. An opportunistic `WorkManager` drain is permitted as a bonus and may never be promised |
| File protection | **`NSFileProtectionComplete`** — class A, key evicted at lock — on the database, its `-wal` and `-shm` siblings, and the receipt spool. The WAL is where recent writes actually live. Not `…UntilFirstUserAuthentication`: the drain-while-locked row establishes that nothing needs the database while the phone is locked, so nothing needs the key resident past lock either (`architecture/14-local-first.md` §14.4). **One entitlement key, no native code** | **Nothing to set, and nothing to choose.** Credential-encrypted storage is unlocked at first unlock and stays unlocked until reboot — permanently the class iOS rejects — and the eviction primitive that exists is scoped to managed profiles |
| Full-database encryption | **Not adopted.** Class A has already made a locked device unreadable, so SQLCipher would lock a door the file system has already sealed | **Open — the one decision here that is not made.** With no lock-time eviction there is nothing behind the file, so this is not a second lock but the only one. §17 O18 |
| Credential at rest | Session token in the Keychain at `AFTER_FIRST_UNLOCK`, **`ThisDeviceOnly`** set explicitly — so it does not restore onto a replacement device. There is no database key to place alongside it | `expo-secure-store`'s AES-256-GCM blob under a **non-exportable Keystore key**. `ThisDeviceOnly` comes for free and twice: the key is in no backup, so restored ciphertext is undecryptable, and Expo's own rules exclude the file from cloud backup *and* device transfer. Stronger than the iOS flag, by different means. Whether a *database* key joins it is the row above |
| **Excluded from device backup** | `NSURLIsExcludedFromBackupKey` on the database, its siblings, and `Documents/receipts/`. A runtime call on a URL that must already exist, and **the only control in either table that needs native code** | `allowBackup: false` **is not this** on Android 12+ — it stops the cloud transport and leaves device-to-device transfer alone. Real exclusion is an explicit rules resource, or the databases in `no_backup/`. Below |
| App launch | The UI is gated behind `expo-local-authentication`, tested on `getEnrolledLevelAsync()` and never on `isEnrolledAsync()`. There is no database key to unwrap — the file is protected by class A | The same call, over `BiometricPrompt`, with `biometricsSecurityLevel: 'strong'`. Same test, and here it is load-bearing rather than tidy: the wrong one locks out a PIN-protected device that is behaving correctly |
| Screen capture | `preventScreenCaptureAsync()` obscures recording (iOS 11+) and screenshots (13+) — a mitigation | The same call sets `FLAG_SECURE`: screenshots and recording are **refused**, and the recents thumbnail is blank. The one row where Android is strictly stronger |

**Web appears in neither table**, because it holds nothing either table
protects — see *Web holds no ledger* below.

#### Why drain-while-locked is refused on iOS, and not relied on anywhere

**On iOS it is not a performance decision.** A background drain needs the
database and its key readable **while the phone is locked**, which forces the
weakest protection class and the weakest Keychain accessibility — making every
other row in that table theatre. Holding a file lock on a protected file at
suspension is also the sole cause of the `0xdead10cc` watchdog termination.

Nothing in this design needs it. §15 sets no availability target, and §14.3's
sync control already drains on tap. If a pending count must be visible from a
notification, a tiny counters file at the weak class carries it — never the
ledger.

**On Android neither premise holds, and a background drain is genuinely
feasible.** There is no class-A key to be made unavailable — the credential key
is resident from first unlock to reboot whatever the app asks for — and
`0xdead10cc` has no analogue: AOSP's cached-app freezer treats holding a file
lock as an *exemption* from freezing rather than a cause of death, and
`ApplicationExitInfo`'s seventeen kill reasons name nothing about file locks. A
background drain is genuinely feasible here, through `expo-background-task` over
`WorkManager`.

It is also unreliable, and unreliable in ways the design cannot bound: a
fifteen-minute floor between runs, a network-connected constraint that only says
*a* network, Doze and app-standby buckets on top of that, and OEM vendors that
kill background work whatever the framework promised. So the trigger list is
identical and the heading is not — **on iOS a background drain is refused, on
Android it is merely never depended upon.** It may exist as a bonus that no
screen, no banner, no freshness figure and no guarantee refers to.
`architecture/09-connectivity.md` carries the trigger list and names which
reason belongs to which platform.

**One coupling, because it is the only place the two platform decisions touch.**
If the SQLCipher question below is answered *yes* on Android, the background
drain stops being possible at all: a passphrase wrapped by a Keystore key
requiring an unlocked device cannot be unwrapped while the device is locked.
That is the right way round — the confidentiality decision gets to foreclose the
convenience one — and it is cheap, because what it forecloses was already
something nothing may depend on.

#### File protection is one JSON key on iOS, and does not exist on Android

**Class A costs one JSON key.** `ios.entitlements` in `app.json` accepts
arbitrary entitlements and is applied
when the native project is generated, so
`com.apple.developer.default-data-protection` set to `NSFileProtectionComplete`
gives the container root its class from one JSON key — no native module and no
config plugin. Apple's inheritance rule does the rest:
*"the data protection value is inherited from the parent directory when you
create an item"*, so the database, the `-wal` and `-shm` siblings SQLite creates
afterwards, and the receipt spool are all covered by a key that was set before
any of them existed.

Two consequences follow from *newly created files only*. The entitlement has to
be in place **before the app's first launch on a device** — added afterwards it
protects nothing already written, and the remedy is rewriting every file rather
than setting a flag. And Apple's own advice against this entitlement is scoped
to *apps that run in the background*, which the row above already forbids: the
caveat and this design agree, and an app that drained in the background could
not take the entitlement at all.

**Android has no version of this at all**, which is the next section rather than
a footnote to this one.

#### Android's key is not evicted at lock, and cannot be

Every row in the Android column rests on one property of the platform.

Android encrypts per user, not per file. Credential-encrypted storage — where
an app's own files live — is unlocked at the first unlock after boot and stays
unlocked: *"Credential encrypted storage is available after the user has
successfully unlocked the device and until the user restarts the device. If the
user enables the lock screen after unlocking the device, credential encrypted
storage remains available."* That is
`NSFileProtectionCompleteUntilFirstUserAuthentication`, permanently, on every
Android device — the exact class the iOS row rejects, and it is the floor rather
than a default.

There is no opt-in to anything stronger. The eviction primitive exists and is
scoped away from us: `DevicePolicyManager.FLAG_EVICT_CREDENTIAL_ENCRYPTION_KEY`
*"can only be used by a profile owner when locking a managed profile"* — an
enterprise MDM locking a work profile, not a personal app locking itself.

So the honest statement of the Android floor is: **a locked Android phone
carrying this ledger is readable by anyone who can reach its storage while the
credential key is resident, which is every state short of a reboot.** Powering
the device off is therefore a real control on Android in a way it is not on iOS.
That is something to tell an owner, not something to design around.

It is also why the section below settles on one platform and stays open on the
other.

#### On full-database encryption — closed on iOS, open on Android

**One control, and the two platforms are not buying the same thing with it.**
SQLCipher protects a database against extraction from a phone seized in the
after-first-unlock state. On iOS the file is never in that state while locked,
because class A evicts its key; on Android it is in that state from first unlock
until reboot, and nothing evicts anything. So the same mechanism is a second
lock on one platform and the first lock on the other, and the difference belongs
to the operating systems rather than to the decision.

**On iOS: not adopted, and the reasoning is worth recording because two
reviewers disagreed.** The class A file protection above already evicts the key
at lock, so a locked phone is unreadable with or without SQLCipher. Against what
is left of the case: its own key would need `AFTER_FIRST_UNLOCK` for the app to
start reliably, which is *weaker* than the protection the file already has; it
costs about 30% on writes; and it needs a generated native project and a custom
dev client, which §4.3's managed-workflow choice exists to avoid. Only the first
of those is decisive — a redundant control is not worth any price — and it is
decisive on the strength of an iOS mechanism rather than a general one.

**On Android: load-bearing, because there is nothing behind the file.** With no
lock-time eviction, SQLCipher is not a second lock; it is the only mechanism
that can make a locked Android device behave like a locked iOS one, which is the
threat this whole section exists for.

The constructible shape needs less native code than it sounds like. `expo-sqlite`
ships `useSQLCipher: true` as a first-party config-plugin flag, so the encryption
itself is a build setting rather than a fork — though it does require a generated
native project and a dev client, exactly as on iOS. The part that genuinely needs
a local Kotlin module is the **key**: the passphrase must be wrapped by a Keystore
key created with `setUnlockedDeviceRequired(true)` (API 28+), because
`expo-secure-store` never sets that flag, and a passphrase available exactly
whenever the credential-encrypted storage is available buys nothing at all.

Three costs come with it:

- **The passphrase reaches JavaScript.** A SQLCipher database is keyed with
  `PRAGMA key`, so the plaintext passphrase exists as a JS string in the app's
  heap for the life of the process. That is a real weakening of the thing being
  bought, and it has no iOS analogue because iOS is not buying anything here.
- **`setUnlockedDeviceRequired` is asymmetric**, in a way nothing on iOS is: it
  blocks *decryption* while the device is locked and still permits *encryption*.
  A locked Android phone could therefore append to the outbox and could not drain
  it or read the ledger. That is coherent, slightly strange, and already turned
  into a design constraint by the drain section above.
- **Roughly 30% on writes**, and a generated native project — on the platform
  where the alternative to it is nothing at all.

**Not decided here.** It is §17 **O18**. It turns on the question the iOS
paragraph turns on too — whether device seizure is a real concern or a
theoretical one — and it is live on Android only because there the file system
answers nothing.

#### Backup exclusion is two mechanisms, and the Android one is a trap

**On iOS this is the highest-value single line in either table**, and it is the
only line that needs native code. `NSURLIsExcludedFromBackupKey` is a runtime
call against a URL, so it has to happen after the file exists, and nothing
declarative can make it: `expo-file-system` contains no occurrence of
`isExcludedFromBackup` or `setResourceValue` in either the current
`Paths`/`File`/`Directory` API or the legacy one, and its config plugin exposes
two iOS options, neither of them this. Worth pinning, because it is the whole
native-code budget of the iOS column: every other control there is declarative.

**On Android, `allowBackup: false` is not backup exclusion.** Auto Backup is on
by default, and on Android 12+ the flag *"disables cloud-based backup and restore
(such as Google Drive backups) but doesn't disable device-to-device transfers for
the app"* — which is the transport that copies an app's private files onto a new
handset, in a shop, at the owner's request, with nothing encrypted anywhere along
the path. `apps/mobile/app.json` carries that flag today, so the control reads
as satisfied on Android and excludes nothing (C33).

Two things actually exclude:

- **A rules resource.** `android:dataExtractionRules` (API 31+) **and**
  `android:fullBackupContent` (API ≤ 30) — both, because they cover different OS
  versions — pointing at `res/xml` resources with explicit `<cloud-backup>`
  **and** `<device-transfer>` sections. Android 16 QPR2 adds
  `<cross-platform-transfer>`, which will default open in exactly the same way.
  The semantics are the trap: *"If there are no rules for a particular backup
  mode… that mode is fully enabled for all content except for no-backup and cache
  directories."* **A missing section is not an exclusion. It is a grant.** There
  is no Expo config key for either attribute; it is a config plugin and no Kotlin,
  and `expo-secure-store`'s own plugin is the pattern to copy.
- **Or move the files.** `expo-sqlite`'s open functions take a third positional
  `directory` argument, and Android's `no_backup` directory is excluded from both
  transports by the platform and enforced on restore. The default is
  `filesDir + "/SQLite"`, which is inside Auto Backup. `expo-file-system`'s
  `Paths` exposes `document` and `cache` and not the no-backup directory, so the
  path is derived from the document path rather than read.

Two traps around `expo-secure-store`, both of which change what is true without
anyone having decided it:

- **Installing it already excludes our databases**, invisibly. Its rules
  `<include>` only `domain="sharedpref"`, and Android's rule is that the presence
  of any `<include>` makes everything not included excluded. So the ledger is
  out of Auto Backup today as a side effect of a dependency's packaging. Nobody
  chose that, nothing records it, and it reverses the day Expo edits its own
  rules.
- **Its plugin stands down when other rules exist**, warning that *"other backup
  rules are already present"*. So the moment we write the resource above we
  inherit the job of excluding `shared_prefs/SecureStore.xml` ourselves — and the
  failure mode is that the **session token starts being backed up**, silently, as
  a consequence of a change made to protect the ledger.

#### The launch gate is a device-credential test, not a biometric one

`expo-local-authentication` covers both platforms — `LocalAuthentication` on
iOS, `BiometricPrompt` on Android — and the gate must read
**`getEnrolledLevelAsync() >= SecurityLevel.SECRET`**, never `isEnrolledAsync()`.
The latter asks only about biometrics and returns false on a PIN-protected device
with nothing whatever wrong with it, so the naive check locks a correct user out
of their own ledger. That is a worse outcome than the exposure the gate exists
for, and it is the more likely one.

Two settings ride along. `biometricsSecurityLevel` defaults to `'weak'`, which
admits Android's Class 2 face unlock; a ledger passes `'strong'`. And
`SecurityLevel.BIOMETRIC` is deprecated and means different things on the two
platforms — WEAK on Android, STRONG on iOS — so a comparison written against it
is a stricter test on one target and a looser one on the other, which is the
shape of bug that never shows up in review. `architecture/13-identity-and-access.md`
§13.8 carries this alongside the credential-store traps it belongs with.

#### Web holds no ledger, so most of this does not apply

The web build reads through the server. It holds **no replica and no outbox**, so
file protection, backup exclusion, full-database encryption and the store
separation have nothing on that device to be about. What is left is the browser's
own session handling, which `architecture/13-identity-and-access.md` owns — an
httpOnly `Secure` `SameSite=Strict` cookie, because `expo-secure-store` has no web
implementation and a token in `localStorage` is not an option.

That is not a preference, and §3 defers to here for the reason. `expo-sqlite`'s
web build cannot host the ledger, on three counts:

- Its worker bridge writes a length header one byte wide and reads it four bytes
  wide — `resultArray.set(new Uint32Array([length]), 0)` — so any result over
  roughly 190 bytes is corrupted.
- The first synchronous call deterministically times out.
- `PRAGMA journal_mode = WAL` is a silent no-op, because the OPFS VFS implements
  no `xShmMap`. The WAL mode the store-separation row and
  `architecture/14-local-first.md` §14.6 both reason from is simply absent.

So web is a thin client by defect rather than by design, and its custody question
is the server's. If a local ledger on web is ever wanted it needs a different
SQLite for the browser, and every row above has to be re-argued against a third
storage model — the browser's, which has no equivalent of either phone's classes.

#### T1 does not extend to the device

§13.1's guarantee is enforced by a Postgres role holding `SELECT` on
`tax_ledger` and nothing else. **That mechanism has no device equivalent**, and
the replica holds business and personal rows side by side under no privilege
boundary at all.

The current design does not breach T1 — tax figures are server-only (§14.3, class
**S**). The exposure is that the *scope* was never stated, so the next feature
breaks it by construction: the first phone-side export or share sheet reads
SQLite directly, is outside T1 by definition, and will look correct because the
rows carry the right flag while `verify_t1()` passes.

**Stated, therefore: T1 covers the server export path only. The device replica is
never a source for any tax artifact.** A phone-side export calls the server and
receives rows already filtered through the view.

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
                        is_business, ownership (own | shared),   -- §6.7
                        archived, sort, external_id
categories              id, parent_id →self, name, kind,
                        is_leaf,                              -- group or leaf, never both
                        is_earnings,                          -- income only (§6.7)
                        icon, color, archived, sort, external_id
category_mappings       external_id PK, external_path, category_id, note
                                                              -- old MM category → new taxonomy
counterparties          id, name, kind (person|company), settlement_currency,
                        contact, note, archived, sort         -- debt (§6.6)
transactions            id, date, type, account_id, to_account_id, category_id,
                        counterparty_id, counterparty_role,   -- debt (§6.6)
                        is_capital,                           -- one-off (§6.8)
                        amount_original, currency, fx_rate,
                        fx_rate_estimated,                    -- §7.6
                        amount_pivot,                         -- GENERATED (§7.4)
                        to_amount, to_currency, to_fx_rate,   -- transfers (§7.5)
                        fee,                                  -- stated bank fee, distinct
                                                              -- from the rate margin (S31)
                        recurring_id, occurrence_date,        -- no double-post (§6.5)
                        counterparty_tax_id, document_ref, ksef_id,
                        ryczalt_rate,                         -- revenue rows (§13.6)
                                                              -- business rows only (§13.2)
                        payee, note, is_business,
                        source, external_id, deleted_at
dashboard_layouts       id, name, is_active, is_preset, sort  -- §14.5
dashboard_widgets       id, layout_id, kind, slot, size, config, sort
targets                 id, category_id, period, amount, currency,
                        active_from, active_to                -- not budgets (§14.7)
agent_auto_grants       id, session_id, operation_class, granted_at,
                        expires_at, max_operations, used_operations,
                        revoked_at                            -- §11.2
tags / transaction_tags id, name  ·  m2m
recurring_transactions  id, type, account_id, to_account_id, category_id,
                        amount_original, currency, payee, note,
                        rrule, next_date, end_date, enabled
receipts                id, transaction_id, image_key, ocr_json,
                        merchant, total, currency, purchased_at, confidence
transaction_lines       id, transaction_id, description, amount, quantity,
                        category_id, sort            -- optional breakdown (§6.10)
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
transactions_to_amount_positive  to_amount IS NULL OR to_amount > 0
transactions_to_currency_shape   (type = 'transfer') = (to_currency IS NOT NULL)
transactions_to_fx_rate_shape    (type = 'transfer') = (to_fx_rate IS NOT NULL)
transactions_fee_positive        fee IS NULL OR fee > 0
categories_no_self_parent        id <> parent_id
categories_earnings_income_only  kind = 'income' OR is_earnings = false
accounts_shared_not_business     ownership = 'own' OR is_business = false
currencies_decimals_sane         decimals BETWEEN 0 AND 8
fx_rates_rate_positive           rate > 0
fx_rates_distinct                base <> quote
```

The two `to_*` shape constraints matter more than they look. `to_amount` was
already guarded; `to_currency` and `to_fx_rate` were not, so a transfer could be
written with a destination amount and no way to value it — and since the
destination leg's pivot value is computed rather than stored (§7.4), that is a
balance that silently comes out wrong rather than a write that fails.

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
re-migration idempotent. The same mechanism prevents a recurring rule from
double-posting (§14.4):

```sql
CREATE UNIQUE INDEX transactions_occurrence_uq
  ON transactions (recurring_id, occurrence_date)
  WHERE recurring_id IS NOT NULL;
```

#### Three invariants a CHECK cannot express

Each spans two tables, so each is a trigger. They are listed here rather than
left to application code because every one of them is a rule the design
elsewhere claims as a guarantee:

| Invariant | Why it matters |
|---|---|
| `transactions.currency = accounts.currency` (and `to_currency` = destination's) | §7.1 states `amount_original` *is* in the account's currency. Nothing enforced it, so a USD amount could sit on a PLN account and every balance downstream would be wrong |
| Only leaves are assignable — `category_id` must reference a row with `is_leaf` | `TAXONOMY.md` R1 is called "the single rule that eliminates faults 1, 2 and 3", and it is the exact defect that put 705 transactions on the `Food` parent. It was unenforced |
| A business transaction cannot sit in a `shared` account | §6.7 says the combination "is invalid and constrained against". It was constrained on `accounts` only, so a transaction-level `is_business` flag bypassed it — a hole in T1 (§13.1) |

A trigger is heavier than a CHECK and is used here only where the alternative is
an unenforced claim.

The schema carries four further checks this section does not list individually:
`accounts_shared_not_business` (shared money is never reportable, §6.7),
`categories_earnings_income_only`, `currencies_decimals_sane`, and
`fx_rates_distinct`.

**`currencies_decimals_sane` bounds the number; two more guarantees hold it
against the rows it governs.** `assert_amount_scale` and its per-table
siblings (`transactions`, `transaction_lines`, `debt_reassignments`,
`accounts`, `recurring_transactions`, `targets`, `receipts`) refuse any money
column past its own currency's declared `decimals` — a figure never carries
more precision than its currency claims to hold. `assert_currency_decimals_safe`
is the other direction: a currency's `decimals` cannot be *lowered* while a
row already stores a figure past the narrower scale, including a
soft-deleted transaction — a restore must never walk a row past a guarantee
that held when it left. Both are cross-table (the row's own `currency` names
a second table's `decimals`), so both are triggers, in
`0012_transaction_scale_and_category_kind.sql`.

**The phone mirrors both, because SQLite carries no cross-table trigger of
its own.** Every local executor's own write path checks `assertMoneyScale`
(`packages/ledger/src/scale.ts`) against the replica's own `currencies`
table before a figure lands; `update_currency`'s own executor scans every
table the replica holds before admitting a shrink — accounts, transactions,
transaction lines, and recurring transactions. `targets`, `receipts` and
`debt_reassignments` are Postgres-only tables the replica does not carry, so
the phone's mirror cannot scan them and does not claim to; a shrink that
would only be caught by one of those three is a guarantee the server alone
still holds. The phone additionally refuses a shrink while a live
(non-archived, non-deleted) account or transaction still names the currency
at all — stricter than Postgres, which admits a shrink that leaves nothing
over-scale regardless of what still uses the currency.

**Validation status:** `drizzle-kit` generates clean PostgreSQL 16 DDL for all
of it — expression indexes, the `coalesce`-based sibling uniqueness index,
partial unique indexes, the generated `amount_pivot` column, and every check
constraint. Three migrations exist: `0000` (base), `0001` (the corrections in
this section), and `0002` (the cross-table triggers below, hand-written because
triggers are database behaviour and no ORM emits them).

**`0000` is applied and verified** against a live PostgreSQL 16 — every table,
constraint and expression index, with the taxonomy seeded and FX backfilled
against it.

**`0001` and `0002` are not applied**, and one detail matters when they are:
`0000` reached the database through `drizzle-kit push`, not `migrate`, so no
`__drizzle_migrations` ledger exists. `push` also **cannot apply `0002` at all**
— triggers are not part of the Drizzle schema, so there is nothing for it to
diff. Applying them means adopting `drizzle-kit migrate` and baselining `0000`
as already-run, which is the right move regardless: §15 requires migrations be
reviewed before applying, and `push` is a diff you cannot review.

`0001` also drops and recreates `amount_pivot` as a generated column,
recomputing every value from `amount_original × fx_rate` — harmless if the
invariant held, and a silent correction if it did not. Run it against a copy
first for that reason alone.

**Migrations `0002`–`0004` are hand-written**, and `drizzle-kit generate` will
not run until someone rebuilds the snapshot chain: it needs an interactive TTY to
disambiguate the `receipt_lines` → `transaction_lines` rename, and the meta
snapshots diverged when `0002` was written by hand. Adopt `drizzle-kit migrate`,
baseline `0000`, and **delete `db:push`** — `push` diffs the Drizzle schema and
therefore cannot see triggers, views or grants, which is most of what this
system's correctness rests on.

**Closed since `0001`**, all in `0004`: `to_amount_pivot` · `debt_currency` /
`debt_amount` · `fee` · `ryczalt_rate` / `ryczalt_activity` ·
`accounts.expected_balance` · `account_groups.institution` ·
`import_rows.model_id` / `rule_snapshot` / `retrieved_ids` · `ryczalt_rates` ·
`tax_period_locks` · `agent_memory` · the closed-period write guard · and the
covering indexes every aggregate needed.

**Still outstanding:**

| Change | Why |
|---|---|
| `receipt_lines` → **`transaction_lines`**, keyed on `transaction_id` | Lines belong to the payment, not the photograph (§6.10, §10.3). Today a hand-entered card payment cannot be broken down at all |
| `ryczalt_rate` on `transactions`; `ryczalt_rates` table; `counterparties.default_activity` | Revenue is live (§13.6) |
| `tax_period_locks` | Closing a period is an explicit act (§13.4) |
| GIN index on `receipts.merchant` and line descriptions | Receipt search (S10) |
| `import_rows.rule_snapshot` | Rule conditions as they were when they fired (§9.2) |

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
                   + counterparty_role       -- debt | contribution | reference
```

**`counterparty_role` decides what a reference *means*.** Naming a counterparty
is not the same as owing them, and three different things want the field:

| Role | Meaning | Debt ledger | Ageing |
|---|---|---|---|
| `debt` | Money moved that is expected back, in either direction | ✅ | companies only (O15) |
| `contribution` | An inflow to a shared account, attributed to who put it in (§6.7) | ❌ | never |
| `reference` | This transaction merely involved them — no obligation either way | ❌ | never |

Set at write time, never inferred. The alternative — deriving the distinction
from `accounts.ownership` — works today but silently rewrites the meaning of
five years of history the moment an account is reclassified.

**Debt is derived, never stored.** A counterparty's position is the running sum
of the `debt`-role transactions referencing them. Nothing is posted twice, so a
balance cannot drift from its history:

```sql
CREATE VIEW counterparty_balances AS
  SELECT t.counterparty_id,
         COALESCE(t.debt_currency, t.currency)                     AS currency,
         -- `signed_amount(type, amount_original, to_amount, side)` — the
         -- shape `packages/db/src/figures/signed.sql.ts` ships: `side`
         -- picks the leg carrying the counterparty (the destination leg for
         -- a transfer, since a repayment lands INTO an owned account; the
         -- only leg otherwise), `type` decides the cash-flow sign on the
         -- `from` leg the way `signedFromLeg` does, and the `to` leg passes
         -- through unsigned — a transfer's destination is always a plain
         -- positive inflow. `debt_amount`/`debt_currency` value the row
         -- wherever set (S14) — coalesced independently per leg, so a
         -- transfer's `to` amount never falls back to the `from` leg's own
         -- figure, in a different currency, when `debt_amount` is absent.
         SUM(-signed_amount(
               t.type,
               COALESCE(t.debt_amount, t.amount_original),
               COALESCE(t.debt_amount, t.to_amount),
               CASE t.type WHEN 'transfer' THEN 'to' ELSE 'from' END
             ))                                                    AS balance
  FROM   transactions t
  JOIN   counterparties c ON c.id = t.counterparty_id
  WHERE  t.counterparty_id IS NOT NULL
    AND  t.counterparty_role = 'debt'
    AND  t.deleted_at IS NULL
  GROUP  BY t.counterparty_id, COALESCE(t.debt_currency, t.currency), c.archived
  -- Archived is filtered here, in HAVING, after the fold — never in WHERE.
  -- Archiving hides a counterparty from pickers, but history keeps working;
  -- `update_counterparty`'s own gate (S15 §6) refuses archiving while a
  -- balance is open, so an archived counterparty is normally settled, but
  -- one archived before this coalesce fix landed can still carry a
  -- non-zero balance that must still be seen — a blanket
  -- `WHERE archived = false` can only see the raw row, never the sum this
  -- view folds it into.
  HAVING NOT (c.archived AND SUM(-signed_amount(
               t.type,
               COALESCE(t.debt_amount, t.amount_original),
               COALESCE(t.debt_amount, t.to_amount),
               CASE t.type WHEN 'transfer' THEN 'to' ELSE 'from' END
             )) = 0);
```

This view is documentation of the rule, not what runs it: the shipped
implementation is `packages/db/src/figures/counterparty-balance.ts`, a query
builder over the same fold, and no `counterparty_balances` view exists in the
migrations.

**The negation is the whole trick.** The ledger signs by *cash flow*; a debt
balance signs by *obligation*, and they are exact opposites. All four cases fall
out of one rule:

| Event | Cash | Debt delta | Reads as |
|---|---|---|---|
| You lend 200 | −200 | **+200** | they owe you |
| They repay 200 | +200 | **−200** | back to zero |
| You borrow 200 | +200 | **−200** | you owe them |
| You repay 200 | −200 | **+200** | back to zero |

So no direction field is needed, and the inversion that would have made every
receivable read backwards cannot occur.

**Sign convention:** positive means *they owe you* (a receivable); negative
means *you owe them* (a payable). One counterparty can hold both at once in
different currencies, which the account model made unrepresentable.

**Receivables sit outside net worth.** Lending is an ordinary expense
(`Debt & giving › Lent out`) and repayment an unearned inflow
(`Other inflows › Repayment received`), so net worth is money you hold, not
money you are owed. The counterparty ledger is a parallel record consulted on
S12 and S13; it does not reconcile to net worth and is not meant to.

The cost is stated rather than hidden: **net worth understates you by whatever
you are owed, and period spending includes money you expect back.** The debt
screens are where that gap is legible. The alternative — folding receivables
into net worth — buys accounting correctness at the price of a second class of
balance that no account holds, and was judged not worth it for a personal
ledger.

#### Cross-currency debt

A counterparty carries **one balance per currency**, plus two derived totals:
one in *their* `settlement_currency`, one in the current display currency. The first is
what you discuss with them; the second is what appears in your reports.

```
Counterparty · person · settles in EUR

    PLN    +840,00      they owe you
    EUR     −120,00     you owe them
    ─────────────────
    net in EUR   +74,44    @ 4,3200 · 2026-08-04
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

### 6.6a Debt reassignment — the transfer that moves nothing

The probe (§8.1a) found **173 transfers whose source and destination are the
same account.** They net to zero, which is why no balance check has ever seen
them, and every one sits on a Loan account:

| Account | Rows | Turnover |
|---|---|---|
| `Loan Zł (distributed)` | 157 | ~52 000 |
| `Loan Zł` | 6 | 3 136,23 |
| `Loan USD` | 6 | 413,40 |
| `Loan Zl (my)` | 2 | 296,30 |
| `Loan BYN (distributed)` | 1 | 105,00 |
| `Loan BYN` | 1 | 212,00 |

Their descriptions say what they are: *"Tomek and Ola. Total"*, *"Marek.
Total"*, *"Piotr. Total"*, *"PCIe Joined BD 2023. Darek's liability"*,
*"Доля Кати после реструктуризации"*. **These are debts moving between
people** — a group bill re-split, one person taking over another's share, a
restructuring. Money Manager has no counterparty, only accounts, so the only way
to record *"this 180 is now Marek's rather than Tomek's"* was a transfer from the
loan account to itself with the name in free text.

This is precisely what §6.6 says the new model is for, and it is also the case
the migration silently drops. Collapsing loan accounts into counterparties reads
each leg's counterparty from the account it sits on — and both legs sit on the
same account, so both resolve to the same counterparty and `debtDelta` sums to
zero. Every one of these 173 rows contributes nothing, and ~52 000 zł of
`Loan Zł (distributed)` ends up attributed to whoever the surrounding rows
happen to name. The balances still reconcile, because they netted to zero in
Money Manager too. Nothing fails.

**So they migrate as `debt_reassignments`, not as transfers** (migration
`0007`). A reassignment is one row with two counterparties —
`from_counterparty_id`, `to_counterparty_id`, an amount and a currency — and no
cash flow, because none occurred. It is not a transaction: a transaction has one
counterparty and a cash flow, and forcing this into `transactions` would mean
either a second counterparty column that is NULL on every other row, or two rows
kept in sync by convention. It applies
`+amount` to one balance and `−amount` to the other, leaving net receivables
unchanged, which is the invariant that makes it checkable: **a reassignment must
not move the total.** That is the `debt_reassignment_effects` view, so §15.1 can
evaluate it on a schedule rather than it being another sentence.

The counterparties cannot be resolved automatically. The names are in prose, in
three languages, and §6.6's own extraction rule already says merging two
spellings of one person silently would corrupt a balance — here it would corrupt
two. So all 173 land in the import review queue as proposals with the original
text attached, and unresolved ones import as zero-effect rows retaining their
description, which is exactly their behaviour today. **The migration must not
proceed as though these are ordinary transfers**, which is the one thing it
would do by default.

### 6.7 Ownership — mine, and ours

Two people bought a house. Each paid half. It is a common asset, so the money
the other owner put in is **not your income** — but it is also not invisible,
and the account it sits in is not a blind spot.

This is not exclusion. It is a **second aggregation level**.

```
accounts  + ownership   own | shared
```

A `shared` account is a completely ordinary account. It has a balance, it
appears in the balances list, it takes transactions and categories and
receipts, and **it can go negative**, because a jointly-owned account being
overdrawn is a real fact about a real account.

#### Totals nest, they do not exclude

```
Mine  = accounts where ownership = 'own'
Ours  = Mine + shared accounts
```

**Both are shown.** Every screen carrying a headline figure carries two: what
concerns only you, and what includes the shared pot. Neither is a filter on the
other, and neither is more real.

| Figure | Mine | Ours |
|---|---|---|
| Net worth | own accounts | own + shared |
| Spending this period | own accounts | own + shared |
| Earnings | income into own accounts | — see below |
| Inflows | — | all income, including contributions |

#### The scope control, and the two totals

Two distinct mechanisms, easily confused.

**The scope segment is a filter** — **All · Mine · Shared · Business** — and
its options partition the ledger exactly:

| Scope | Definition |
|---|---|
| **Mine** | `ownership = own`, `is_business = false` |
| **Business** | `is_business = true` — always in own accounts |
| **Shared** | `ownership = shared` — never business, never reportable |
| **All** | The union |

Every transaction is in exactly one, so the three subtotals always sum to All
and switching scope can never double-count.

**The two headline totals are not a filter.** Regardless of the scope setting,
any screen with a headline figure shows both *mine* and *ours* — they answer
different questions and both are wanted.

#### Income is what you earned

A general rule that happens to solve the family case as a side effect:

> **Not every inflow is income.** Income is what you *earned*. Money that
> merely arrives — a gift, a refund, a repayment, a withdrawal from a shared
> pot — increases your balance without being earnings.

```
inflows
├── earnings          counts as income
│   ├── business revenue        ← the only reportable slice under ryczałt
│   ├── salary
│   ├── bonus and equity
│   └── investment returns
└── unearned          increases balance, never income
    ├── gift received           ← from anyone: family, friends, birthdays
    ├── refund
    └── repayment received      ← a debt coming back is not a gain
```

Income categories carry an `is_earnings` flag, so *"what did I earn"* sums only
the first group. This is one rule covering gifts from a co-owner, birthday
presents from friends, and refunds alike — rather than a family-shaped
exception bolted onto each.

#### Why a co-owner's money is not your income

The account's ownership already carries this, so no flag on the transaction is
needed:

| Flow | Recorded as | Your earnings? | Counts in *ours*? |
|---|---|---|---|
| Salary → your account | Income | **Yes** | Yes |
| You → shared account | Transfer | No — it is a move | No — internal to *ours* |
| **Co-owner → shared account** | Income into a `shared` account | **No** | **Yes**, as an inflow |
| Shared account → building work | Expense | No | **Yes** |

**Income into a shared account is a contribution, not earnings.** So *"what did
I earn"* reads income into `own` accounts only, and a co-owner's half never
reaches it.

The rule that makes this hold: **personal income is never recorded into a
shared account.** If it arrives there, move it — the interface warns rather
than silently miscounting.

A transfer from your account into the shared one is meanwhile a genuine outflow
from *mine* and internal to *ours*, which is exactly right and needs no special
handling.

#### The shared boundary is asymmetric, and nets

Money you send to the shared pot is **spending from your point of view** —
it has left you. Money coming back is not earnings, because it was never
earned; it is your own contribution returning.

Both are transfers, so balances stay correct automatically. The asymmetry is in
**reporting**, and it nets:

```
my spending includes:  Σ(transfers out to shared) − Σ(transfers in from shared)
                       ── over the period, as one derived line ──
```

So sending 1,000 and taking 300 back reports **700**, not 1,200. Gross-only
would overstate your spending by every withdrawal you ever make, and after five
years that drift is both large and invisible.

The line can go negative in a period where you drew out more than you put in.
That is shown plainly rather than floored at zero — a negative contribution is
a real thing that happened.

**Two spending figures, never summed.** *My spending* counts your own outgoings
plus your net contribution; *ours* counts your outgoings plus what the shared
account actually spent. They measure different things in different frames, so
adding them is meaningless and the interface never places them where that
invites itself.

#### Contributions are attributed

Each inflow to a shared account carries a `counterparty_id` with
`counterparty_role = 'contribution'`, so *"he has put in X, I have put in Y"* is
answerable at any time. Your own contributions are already attributable because
they arrive as transfers from your accounts.

This uses counterparties for **attribution, not debt** (§6.6). There is no
settlement expectation and no ageing — a co-owner's contribution is not
something owed back. `counterparty_balances` filters on the role, so
`find_unsettled` and the ageing surfaces cannot see contributions at all; the
exclusion is structural rather than a rule each query has to remember.

#### What is deliberately not modelled

**The house is not an asset.** Only cash flows are tracked, so net worth is
money and does not include property. *"What did the house cost us"* is
answerable; *"what am I worth including the house"* is not, by choice.

Adding it later means an asset account kind, a revaluation operation, and a
decision about unrealised gains — a genuinely new concept in this ledger, and
not one worth introducing for a single house.

**Shared is never business.** Shared-account activity is never reportable and
never reaches a tax output (§13). Ownership and tax scope are independent
fields, but this combination is invalid and constrained against.

### 6.8 One-off capital transactions

A single property purchase accounts for **96% of its category** and roughly
seven times a normal year's spending in that area. Left as an ordinary expense,
it makes every year-over-year comparison, trend line and target meaningless
permanently — one row dominates the series forever.

```
transactions + is_capital   boolean, default false
```

Marked transactions are **excluded by default** from trends, targets, and
period comparisons, with the exclusion stated rather than silent:

```
2025 spending   34,200      excludes 1 one-off (see detail)
```

They remain fully present in balances, the ledger, search, and the calendar —
this affects *comparison*, not *record*.

Deliberately a flag rather than an asset model. Tracking property as an asset
would need an asset account kind, a revaluation operation, and a concept of
unrealised gains — a large addition for one house. The flag also generalises to
a car, a deposit, or a large medical bill, which an asset model would not.

> **Open:** this is a recommendation, not a settled decision. The distortion is
> demonstrated, and the fix is one boolean plus a report default — but say so
> if you would rather handle it with an isolated category and remember to
> exclude it manually.

### 6.9 Soft deletion

`transactions.deleted_at`. Money Manager carries 253 deleted rows it never
purges; the same escape hatch is wanted, and a hard delete in a financial
ledger is rarely the right default. Every read path filters
`deleted_at IS NULL`. Reference data (accounts, categories) uses `archived`
instead — never deleted, because history references it.

### 6.10 One transaction per payment event

The unit of a transaction is **the payment**, not the thing bought.

A single card tap at a petrol station covering fuel and a coffee is **one**
transaction — one payee, one amount, one date — with an optional line breakdown
underneath (§10.3). It is one movement of money out of one account, and
splitting it into two rows would invent a second payment that never happened,
put two entries on the statement reconciliation that only match one, and break
duplicate detection against the imported row.

Cash is the user's call. Two handovers at the same counter can honestly be one
row or two, because they genuinely were two events; nothing in the model
prefers either, and the interface should not either.

**The breakdown is optional and always subordinate.** The transaction's own
amount is the fact; lines are an allocation of it. So:

- Balances, reconciliation and duplicate detection read the **transaction**.
- Category reporting reads the **lines** where they exist, and the transaction's
  own category where they do not.
- A breakdown that does not sum to the total carries an explicit `unallocated`
  line rather than silently disagreeing (S07 §9).

This is what makes a receipt and a hand-entered split the same shape, and it is
why `is_business` splitting (§13.1 point 4) is deliberately *not* this: a
70%-business laptop becomes **two transactions**, because the tax boundary must
be visible in every report, and a line inside one row is not.

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
aggregation over income and expense is a plain `SUM`; only the final display
conversion joins `fx_rates`. When display equals pivot, that join is skipped
entirely.

#### Transfers are the exception, and deliberately do not net to zero

A transfer is one row (§6.1) carrying **one** `amount_pivot` — the source leg.
The destination leg's pivot value is `to_amount × to_fx_rate`, computed at read
time, because materializing it would mean a second stored derivation to keep
honest. So any aggregate spanning both legs — a balance, net worth — sums the
two sides separately rather than summing a column:

```
balance(account) = opening_balance
                 + Σ  signed leg where account_id    = account   (−amount_original)
                 + Σ  signed leg where to_account_id = account   (+to_amount)
```

Category and period spending are unaffected: transfers carry no category and
are excluded from both.

On a **cross-currency** transfer the two legs are valued at different rates, so
in pivot terms they do not cancel. That residue is not an error — it is the
bank's spread (§7.5), and it is the reason FX cost is a figure you can total
rather than an invisible leak. A model that forced the legs to net would have
to invent one of the two amounts to do it.

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

### 7.0a Dates and time

Two kinds of time field, and they follow opposite rules.

| | **Accounting date** | **System timestamp** |
|---|---|---|
| Columns | `transactions.date`, `fx_rates.date`, `receipts.purchased_at`, `targets.active_from` | `created_at`, `updated_at`, `approved_at`, `applied_at`, `audit_log.at` |
| Type | `date` — no time, no zone | `timestamptz`, stored UTC |
| Set by | The **device's local calendar at capture** | The server clock |
| Rendered | Verbatim. Never converted | Converted to the viewer's locale |

**An accounting date is not an instant.** It is a business fact: NBP publishes a
rate *for a date*, a tax period is bounded *by dates*, and a month's total is
the set of rows carrying that month. If the date were derived from a UTC instant
and re-resolved per viewer, a purchase at 00:30 in Warsaw would belong to the
previous day when read in New York — and a 31 December revenue row could move
into the wrong tax year purely because of where the phone was. So the calendar
date is resolved once, at capture, from the zone you were actually standing in,
and is thereafter immutable.

System timestamps have the opposite requirement: an audit entry answers *when
did this happen*, which is a genuine instant. Those are UTC and render local.

This matters here rather than being a footnote because the premise of §7.0 is
that time is split across three countries.

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
| `income` | `+amount_original` | — |
| `expense` | `−amount_original` | — |
| `transfer` | `−amount_original` | **`+to_amount`** |
| `adjustment` | `+amount_original` (may be negative in effect) | — |

**The destination leg uses `to_amount`, not `amount_original`.** On a
cross-currency transfer they are different numbers, and using the source amount
on the destination account is the single easiest way to corrupt a balance. The
signing helper takes both amounts for this reason; a helper that takes one
cannot express a transfer at all.

**Debt inverts this.** A counterparty balance signs by obligation rather than
cash flow, so it negates the figures above (§6.6). Nothing else in the system
does.

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
- `amount_pivot` is **a generated column** — `GENERATED ALWAYS AS
  (amount_original * fx_rate) STORED`. It is the figure every aggregate reads,
  so leaving it to application code to keep in step would make the system's
  most-read number the one most able to drift. Postgres computes it or the
  write fails; there is no third outcome.
- Because it is generated, changing the pivot (§7.0) is a rate backfill plus a
  column recompute rather than a data migration.

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

#### `to_fx_rate` is the reference rate, not the realized one

This was never stated, and the obvious reading makes the whole feature vanish.
`to_fx_rate` holds the **reference** rate for `to_currency` on that date, in the
same pivot-per-unit direction as `fx_rate`, so `to_amount_pivot` is a generated
`to_amount × to_fx_rate`. The realized rate is `to_amount ÷ amount_original` and
is **derived at read time, never stored**.

Store the *realized* rate in `to_fx_rate` instead and both legs value to exactly
the same pivot amount — the spread becomes identically zero for every transfer
ever recorded, and the FX-cost feature reports nothing while looking like it
works. The two legs are *meant* to disagree; that disagreement is the figure.

```
margin_pivot(t) = amount_pivot − to_amount_pivot
                = amount_original × fx_rate − to_amount × to_fx_rate
margin_pct(t)   = margin_pivot ÷ amount_pivot
```

Worked, from the transfer above with a reference rate of 3.8100 PLN per USD and
a pivot of USD:

```
amount_pivot     = 150.00 × 1.0        = 150.00 USD
to_amount_pivot  = 565.20 × (1/3.8100) = 148.35 USD
margin_pivot     =                       1.6535 USD (≈ 6.30 PLN)
margin_pct       = 1.6535 ÷ 150.00     = 1.10 %
```

Positive means the transfer cost you money, which is the ordinary case. A
negative margin is not an error — it means you beat the reference rate — and it
must render as such rather than being clamped.

**The margin and any stated fee are separate figures.** A transfer carries an
optional `fee`, so `FX Cost` (§12.2) reports them as distinct lines rather than
one blended number. They are different kinds of cost: a stated fee is avoidable
by choosing another route, a rate margin is not — and blending them makes the
total look like something you cannot act on when part of it is exactly what you
would act on.

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
2. **Per pair, over a date or a date range** — correct a bad or missing
   provider figure. A range writes one `manual` row per day across it from a
   single entry, which is what makes a dead source recoverable by hand: RUB has
   had no published quote since ECB delisted it in March 2022, and covering
   that day by day would be some 1,600 entries.
3. **Provider selection** — per currency, choose which source is authoritative
   (§7.7).

`fx_rates.source` carries the provenance: `nbp`, `ecb`, `nbrb`, `nbg`,
`manual`, or `carried_forward`. A manual entry always outranks a synced one for
the same pair and date, is never overwritten by a later sync, and writes to
`audit_log`. Reports can be filtered to show which figures rest on overrides —
useful when a period is being reconciled and you need to know what was asserted
rather than observed.

#### When no rate exists at all

Carry-forward is capped at ten days (§7.7), so a dead source eventually leaves
genuine holes. **A missing rate must never cost you the transaction.** The row
is written with the nearest available rate — nearest in calendar days on
either side of the row's own date, ties going to the rate already in effect on
it rather than one that only takes effect later — and
`fx_rate_estimated = true`, which:

- keeps every aggregate working, with no nullable `amount_pivot` to handle;
- marks the row so reports can filter to *figures resting on an estimate*,
  alongside the manual-override filter above;
- renders through `<FxAmount variant="stale">`, so the estimate is visible on
  the row rather than buried in a report.

The cap stays on `fx_rates` itself — the rate **table** never holds an invented
figure. The estimate lives on the transaction, where it is attributable to one
row rather than presented as a published quote. Setting a real rate by hand
(level 2 above) clears the flag on every affected row.

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

**Verified endpoints** — each tested against 2020-11-25, the first date in the
data, and each quotes directly against the USD pivot:

| Source | Endpoint | Verified |
|---|---|---|
| NBP | `api.nbp.pl/api/exchangerates/rates/a/USD/{date}/?format=json` | 3.7556 PLN |
| NBRB | `api.nbrb.by/exrates/rates/USD?parammode=2&ondate={date}` | 2.5548 BYN |
| NBG | `nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/en/json/?currencies=USD&date={date}` | 3.3193 GEL |
| ECB | Data Portal SDMX — EUR and GBP | — |

All three are free, unauthenticated, and need no API key.

**Reachable is not the same as backfilled.** Measured against the live table,
8,803 rate-days from 2020-11-25:

| Currency | Source | Coverage | Note |
|---|---|---|---|
| PLN, EUR, GBP, BYN | NBP · ECB · NBRB | **100%** | Complete over the full range |
| RUB | ECB | 23% | Stops **2022-03-11** — ECB delisted RUB, and the carry cap (below) correctly refused to invent four more years. Covered by a manual range override (§7.6, O5) |
| GEL | NBG | **0.5%** | **11 days of 2,080.** NBG answers a self-redirect once its bot defence trips, and the backfill stopped there |

GEL is the open one. The adapter reports the rate-limit honestly rather than as
a fetch failure, which is why nothing looked broken — but one of the three
countries in use has no usable rate history, and under §7.6 every GEL row would
otherwise be valued at a December 2020 rate and flagged `estimated` for five
years. That is not a fallback anyone should accept, so the backfill needs
re-running against NBG with request pacing, not merely retries.

Adding a currency means adding a source adapter — a function from
`(pair, date range)` to rates. Sources are plugins, so a new one is a module
and a row, not a schema change.

Missing days (weekends, holidays) carry forward the last published rate, marked
`carried_forward`. This is the standard convention and what NBP itself does.

---

## 8. Migration from Money Manager

The highest-risk transition in the system, with its own gates.

### 8.0 Scope — balances and income, not five years of history

**Migration is optional at first launch.** The importer is idempotent (§8.3), so
accounts, opening balances and income can move first while expense and transfer
history remains available for a later run. The verification gate governs the
data that moves; it does not block unrelated surfaces.

| What | Migrates | Why |
|---|---|---|
| Accounts + groups | ✅ | Structure you would otherwise retype |
| **Opening balances** | ✅ | Read from the `.mmbak` directly — accurate starting positions, zero typing |
| Currencies | ✅ | With their rate sources |
| Recurring rules | ✅ | 24 of them |
| **Income transactions** | ✅ | 498 active rows, so "what did I earn in 2023" works |
| Categories | ⚠️ **mapped, not copied** | A new taxonomy replaces them — see `TAXONOMY.md` |
| Expenses and transfers | ❌ *for now* | ~7,100 rows. Available any time via the same importer |
| Counterparty proposals | ⚠️ deferred | Names live in loan-transaction notes; extract when history does |

**Consequences of partial migration**

- Accounts, opening balances and income are enough for the first run; full
  history remains optional.
- The verification gate (§8.4) checks the balances that *did* come across
  without blocking the rest of the product.
- **R8 — the largest risk in the register — is bounded.** A partial migration
  leaves a usable system because the importer can resume idempotently.
- **Rules cold-start:** the classification cascade (§9.2) assumes rules
  accumulate from confirmed history. Starting near-empty means the first months
  lean harder on the model tier — more API calls, more review, self-correcting
  within a few months. A cost in euros, not in correctness.

### 8.1a Probe before you trust the extractor

`extract.py` computes every balance from an assertion in its own docstring: that
a transfer is two rows, each naming its own account. Two readings of the Core
Data layout fit the evidence, and the other one credits **no destination at
all** — every transfer nets to zero on the source.

That reading fails *plausibly*, which is what makes it dangerous:
`Clearing · PLN` is 636 transfers of 678 rows, so under the wrong reading it
computes to ≈0 — and §6.4 says a clearing account should trend to zero. The bug
reads as confirmation of the design.

```
python3 tools/migrate-mm/probe.py <backup.mmbak>
```

It exits non-zero on any blocking finding and answers seven assumptions the
extractor otherwise makes silently: the transfer layout, `ZDO_TYPE`'s storage
class (an integer makes every balance 0.00 while the income query still
matches), unmapped types, whether any account matches the hardcoded shared-name
test, unseeded currencies, negative income rows, and income heads missing from
`INCOME_MAP`.

**Run it against every backup, not once.** §8.3 relies on re-running the import
against progressively later exports, and each one may add a category, a
currency, or a type the map has never seen.

#### What it found — `<backup>.mmbak`

**Reading A is confirmed, at 100%.** All 1,680 OUT legs name a destination in
`ZTOASSETUID` that is the account of a same-dated IN leg, and the converse holds
for all 1,680 IN legs. `extract.py`'s docstring assumption is correct and every
destination is credited. This was the finding that gated everything downstream,
and it is now closed by evidence rather than by argument.

Getting there required fixing the probe itself. Its first test asked the weaker
question — *do IN and OUT legs share a `ZASSETUID`?* — expecting ~0% under
Reading A, and measured **17.4%**, which is neither answer. Two other mechanisms
produce a shared `ZASSETUID`: pass-through accounts that receive and send the
same amount the same day, and the same-account transfers below. A heuristic
three mechanisms can satisfy cannot decide between two readings, and a threshold
on it would have "confirmed" Reading A for the wrong reason. The direct test —
does `ZTOASSETUID` name the account the paired leg sits on — is unambiguous.

The remaining assumptions hold: `ZDO_TYPE` is stored as `text`, so the string-
keyed sign map is correct; no unmapped types; exactly one account matches the
hardcoded `family budget` test; seven currencies in use (USD 16 accounts, PLN
12, EUR 8, BYN 7, GEL 6, RUB 2, GBP 1); no negative income rows; all eight
income heads are in `INCOME_MAP`.

**One blocking finding, and it is new** — see §6.6a.

**`ZASSET.ZLEFTMONEY` is not the gate's missing right-hand side.** It looked
like Money Manager's own stored balance, which would have made §8.4's 52
hand-typed figures unnecessary. It is `0.00` on all 52 accounts — the column is
unused in this export. Recorded so it is not investigated twice; the balances
still have to be read off the UI.

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

**Go/no-go for imported data and cutover** — and the version that shipped could
not fail.

#### Why the obvious gate is decoration

`opening_balance` is derived as `computed_balance − Σ(imported income)`, and
§8.0 imports only income. So the gate

```
opening_balance + Σ(signed transactions) == computed_balance
```

evaluates `(computed − Σ) + Σ = computed` for every account, unconditionally.
Break the sign map so transfers never credit a destination and it still prints
`0,00` down all 52 rows. **A gate whose two sides share a derivation cannot
detect anything**, and this one was the sole check on the riskiest transition.

#### The right-hand side must come from outside the pipeline

Two independent sources, both required:

**1 · Balances typed from Money Manager.** 52 figures read off the app's own
account list into a CSV, loaded as `accounts.expected_balance`, compared per
account per currency. Money Manager stores no balance — `ZLEFTMONEY` is zero on
every account — so its *displayed* figure is the only value in existence that
was not computed by our own extractor. Tedious once, and unavoidable.

**2 · A structurally different second derivation.** The extractor computes
balances by signing each leg once, keyed on `ZASSETUID`. The check recomputes
them by crediting destinations through `ZTOASSETUID` on the OUT leg instead. The
two methods share no code path, so agreement is evidence and disagreement names
the transfer-layout question directly (§8.1a).

**3 · The bank's own running balance.** Bank A's `.xls` statements carry a
`Saldo po transakcji` column — a balance computed by the bank, in a file we did
not produce, about an account Money Manager only claims to describe.
`tools/migrate-mm/reconcile_bank.py` reads it.

All three must agree with the imported ledger. **Agreement of two derivations
that share an assumption is not evidence**, which is exactly what the first
version had.

#### Fidelity and completeness are different gates, and only one was specified

Sources 1 and 2 both ask: *does our reading of the `.mmbak` match what Money
Manager shows?* Neither can ask whether Money Manager matches **reality**,
because every figure on both sides comes out of the same file. That question
needs the bank, and asking it changes the answer:

| | `Bank A · PLN` | `Bank A · Business PLN` |
|---|---|---|
| Statement window | 2025-11-30 … 2026-03-29 | 2025-12-02 … 2026-03-29 |
| Statement self-consistent (Σ Kwota = Saldo span) | ✅ −349,47 | ✅ 5 879,00 |
| Bank movement | −349,47 (246 rows) | 5 879,00 (56 rows) |
| Ledger movement | −1 281,59 (101 rows) | −26,00 (22 rows) |
| Ledger rows matching a bank row **on signed amount** | 77 / 101 | 21 / 22 |
| Bank rows absent from the ledger | **169 / 246** | **35 / 56** |

Two conclusions, and they point in opposite directions.

**Fidelity is externally corroborated.** 98 ledger rows match a bank row on the
*signed* amount. An inverted sign map would match approximately none, so this is
independent evidence for `SIGN` — the one thing the `.mmbak` cannot tell us
about itself, and previously the entire reason source 1 was needed.

**Completeness is not.** 169 of 246 real transactions on `Bank A · PLN` are not in
Money Manager at all. The migration will copy that faithfully, and every
downstream figure — period spend, category totals, the ryczałt revenue check —
inherits it. This is not an extractor defect and no balance check can see it:
the ledger is internally consistent, just partial.

Statement sync is therefore permanent tooling rather than a migration-only
step. **A gate that passes on fidelity and is never run for completeness
certifies a faithful copy of an incomplete ledger** — which is the state this
backup is in, and worth knowing before five years of it becomes the system of
record.

#### The other checks

Plus:

To the cent, per account, per currency. Plus:

- Income row count matches (498 active) — and re-matches on every later backup.
  The full-history counts (7,621 active, 253 deleted) become part of this gate
  only when expenses and transfers are imported, which §8.0 defers.
- Net worth is reported **twice** — *mine* and *ours* (§6.7). Money Manager
  had only one figure, which corresponds to *ours*. The report states both so
  the difference reads as the new distinction it is, not as a shortfall.
- Every transfer has both legs, or appears on an explicit exception list.
- Category tree depth and membership match.
- Recomputed `amount_pivot` monthly totals are within a stated tolerance of
  Money Manager's, with divergence explained by the FX correction (§6.1) rather
  than by an error.

If balances do not reconcile, nothing derived from the imported rows is
trustworthy. Failure rolls back the import and blocks cutover until the mismatch
is understood.

**The migration runs inside one transaction, and abandoning rolls it back
entirely.** No accounts, no opening balances, no rows — the state before the
file was chosen. Nothing partial survives, because a partial ledger looks whole
at a glance and every figure built on it is quietly wrong. The discrepancy
report is written *before* the rollback, so the evidence of what failed outlives
the data that failed, and re-running against a corrected backup costs nothing
(§8.3).

### 8.5 Cutover

**The full procedure is `docs/specification/migration-runbook.md`** — eleven
steps, each with its gate, plus a rollback table and the point beyond which
rollback stops being practical. It exists because these four lines were the whole
procedure for the one operation in the system that cannot be comfortably undone.

The shape:

1. Enter the last transactions in Money Manager; export a final `.mmbak`.
2. **Probe** (§8.1a) — re-run on the final export, not just once.
3. **Reconcile against the bank** — fidelity and completeness are different
   questions and only one of them can be answered from the export alone (§8.4).
4. **Type the 52 balances** — the gate cannot fail without them.
5. Seed reference data; an unseeded currency now throws rather than skipping.
6. Rehearse into a scratch database. Twice.
7. Decide the 173 reassignments (§6.6a) — needs you, does not block.
8. Run it for real, in one transaction, with the invariant set **recorded**.
9. **Mark the tax position.** `is_business` defaults false and migration sets it
   nowhere; under ryczałt the damaging direction is omission (C5).
10. Parallel run for one period — Money Manager stays authoritative.
11. Money Manager becomes read-only. Archive the export and the tooling.

**The perimeter precedes the real-data step.** Migration puts five years of real
history on the machine, so Tailscale, authentication and the non-superuser role
must exist before step 8.

**Step 11 is the practical point of no return** — not technically, since the dump
restores, but a month of Waltning-only entries would be lost.

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
| ~~`CARD-C`~~ | — | **Dropped** — account dormant; historical rows migrate, nothing new arrives |
| Generic CSV | fallback | Column auto-detection, as `classify_statement_openrouter.py` does today |

`scripts/convert_pko_xls.py` ports directly.

### 9.2 Classification cascade

Three tiers, cheapest first:

```
raw row → [1] exact duplicate?  → skip
        → [2] rule match?       → classified, deterministic, free
        → [3] retrieve + one call → classified with confidence + reason
                                    deterministic, reproducible, scoreable
        → review queue            → refinable in place (S02c)
```

**Rules** (`rules` table) match on payee regex, amount range, account, and
currency; they apply a category, payee normalization, note, and business flag.
After a few months the recurring set — rent, salary, subscriptions, utilities —
is entirely rules, and the model only sees novel merchants.

**Rules accumulate from demonstrated repetition, not from prompting.** When the
same normalized payee has been confirmed to the same category three times with
no rule covering it, one prefilled suggestion appears, and is never raised again
for that payee. Confidence is the wrong trigger — a high score usually means an
obvious merchant, and a single confirmation is thin evidence it will recur.

**Conflicts resolve by specificity, then age.** When two rules match, the one
with more conditions wins — payee *and* account beats payee alone — and only
then does creation order decide. Priority integers stay as a manual override,
not as the mechanism, because hand-numbering rules to express "narrower" is a
bookkeeping task nobody sustains.

**`import_rows` snapshots the rule's conditions as they were when it fired**,
alongside `rule_applied`. Editing a rule afterwards changes future
classification and cannot rewrite the record of what happened — which is what
keeps the audit trail (§6.1) honest about machine-classified rows.

**Model tier is a deterministic pipeline, not a loop** (§11.4). Retrieval runs
first and the model runs once:

```
normalize payee → retrieve k most similar prior payees + their categories
                → one call: retrieved context + row batch → schema out
```

That is what makes a reason like *"matches prior Migros rows in this account"*
possible, and it is why the tier is far less dependent on rules having
accumulated yet (§8.0) — the model is handed history rather than having to go
find it.

**Reproducibility is the reason it stays a pipeline.** §9.4 keeps
`import_rows.raw` unmutated so a reparse is always available, and that promise
is empty if a reparse can return a different answer. It also keeps the tier
scoreable against fixture rows, which a loop is not.

It produces a **proposal per row**; nothing reaches the ledger without an
accept. It runs with the configured `classify` model, plus:

- Account list, full category tree, and active rules in the system prompt
  behind a `cache_control` breakpoint — the taxonomy is cache-written once and
  read at ~0.1× on every subsequent batch.
- Per-batch rows placed *after* the breakpoint so the prefix stays byte-stable.
- `output_config.format` with a JSON schema, so classifications arrive
  validated rather than parsed out of prose.
- `effort: "medium"` — bulk extraction, not reasoning.
- **Language is segregated by path, not mixed within one.** This was previously
  stated as "descriptions are trilingual, often in the same month", which is true
  of the *archive* and false of any single surface today:

  | Path | Who writes it | Reality |
  |---|---|---|
  | **Capture** — what you type or say | You | Overwhelmingly **English** in recent years |
  | **Statement import** — this tier | The bank | **~96% Polish.** Not a preference — the bank generates it |
  | **Receipts** | The merchant | Polish, and Georgian for the GEL accounts |
  | **Search over history** | The archive | Permanently mixed — a large Cyrillic tail from earlier years never goes away |

  **So this tier's problem is Polish**, specifically, and the classifier's prompt
  and fixtures should say so rather than hedging evenly across three languages.
  The category tree is supplied in one language and the model translates rather
  than guessing. This is most of the tail, not an edge case.
- Batches of ~50 rows.

### 9.3 Duplicate and transfer detection

Ports `mm/cleanup.py:find_duplicates` — same account, same amount, within a
date window. Materially easier than today, because the comparison is against
live data rather than a snapshot file, so there is no baseline drift.

Cross-account transfer detection also ports: a debit and a credit of equal
magnitude in different accounts within a few days is a transfer candidate, not
two independent transactions.

**Both run against the whole ledger, not the current batch.** A month means five
statements from five institutions, and a transfer's two legs land in two
different files — so batch-scoped detection would never pair them, and the
re-pairing would fall back to exactly the manual heuristic §6.1 exists to
remove. Candidates are matched against committed transactions plus every open
batch; the review queue names the counterpart's batch and date, and confirming
commits **one row carrying both legs and the realized rate**.

For a cross-currency transfer this is also where the realized rate comes from:
the two amounts are observed from two statements, and the rate is derived from
them rather than fetched (§7.5).

### 9.4 Review

Today this is editing CSVs in Excel. It becomes a screen: proposed rows with
confidence and reason, swipe to accept, tap to recategorize, long-press to
split, bulk-accept above a confidence threshold. `import_rows.raw` is never
mutated, so a reparse after a prompt change is always possible.

---

## 10. Receipt capture

### 10.1 Flow

```
camera → local queue (SQLite) → upload → the configured `receipt` model
       → structured extraction → draft transaction → confirm → commit
```

### 10.2 Extraction

JSON schema output: `{merchant, date, total, currency, tax, line_items[]}`.
Both the image and the raw model response are retained permanently — the image
is the evidence, and the raw response allows re-extraction after a prompt
improvement without re-photographing anything.

**Stored downscaled, and only after extraction succeeds.** A phone camera
produces ~3.5 MB per capture; a legible till receipt needs ~250 KB. The original
is held until extraction returns, then discarded — so the compression can never
cost a reading that had not happened yet. Retention stays unlimited, which is
what the evidence argument requires; this only removes the growth rate as a
concern on a Pi with a finite SSD.

**The merchant and line descriptions are indexed for search** (S10). They are
already structured columns, so this is a GIN index rather than a pipeline, and
it makes a business expense provable from its contents rather than only its
total. The raw response stays unindexed — it carries confidence scores and model
commentary alongside the text, and matches against those look like data without
being it.

**Currency is detected, not assumed.** A supermarket receipt from one country
is not in the same currency as a café receipt from another, and the app is used
across several. The FX rate is looked up for the *receipt* date.

### 10.3 Line-item splitting

One supermarket run split across `Food → Groceries` and `Household → Toiletries`.
Money Manager cannot do this at all.

**Lines belong to the transaction, not to the receipt.** A receipt *populates*
them; it does not own them.

```
transaction_lines   id, transaction_id, description, amount,
                    quantity, category_id, sort
receipts            id, transaction_id, image_key, ocr_json, …
```

This follows from §6.10: the breakdown exists because one payment covered
several things, and whether you photographed the till slip is irrelevant to
that. Binding lines to `receipts` would mean a card tap covering fuel and a
coffee — entered by hand, no photo — could not be broken down at all, while the
identical purchase with a photograph could.

The parent transaction holds the total and every balance reads it, so a
mis-summed breakdown can never move a balance.

### 10.4 Offline

Capture must work in a shop with no signal. Images queue locally in SQLite with
the pending transaction; the queue drains on reconnect. Conflict handling is an
outbox, not CRDTs — the server is the single writer of record, so a conflict is
resolved by **version on the server** (§14.2) rather than merged, which is
enormously simpler.

---

## 11. The agent

The component most likely to be built badly. Three rules make it safe.

### 11.0 One operation registry, two consumers

The agent is **not a separate surface with its own hand-written tool list.**
Every capability in the system is a named, typed operation in a single
registry; the UI calls it over tRPC, and the agent's tools are **generated from
the same registry**.

```
                    ┌────────────────────────┐
                    │  operation registry    │
                    │  typed · validated ·   │
                    │  audited · write-flag  │
                    └───┬────────────────┬───┘
                        │                │
                  tRPC router      generated tools
                        │                │
                   ┌────▼────┐      ┌────▼────┐
                   │   UI    │      │  agent  │
                   └─────────┘      └─────────┘
```

Separate lists drift. One registry means adding a feature makes it
agent-accessible for free, validation and audit cannot diverge between the two
paths, and there is a single place to reason about what the system can do.

**Reach is everything the UI can do** — including taxonomy changes and
dashboard configuration. *"Put family spending on my dashboard"* is a write to
`dashboard_widgets` (§14.5) through the ordinary approval gate, not a special
case. **Reach is not authority:** every write still gates (§11.2).

Each operation carries: typed input (Zod), validation, an audit entry with
actor, a write flag, a description written for the model to read, and
`agentVisible`.

**`agentVisible` is the one seam in "reach is everything the UI can do".** It
defaults to `true` and `toolSchemas()` filters on it, so an operation is
agent-reachable unless its declaration says otherwise — the default stays the
rule and the exception has to be written down where the operation is defined.

It exists for a narrow class: **operations that configure the agent itself.**
Every write on S33 is `agentVisible: false` — whether an assist runs at all,
which provider and model it runs on, its effort and its token budget. Choosing
whether it runs and choosing what it runs on are the same shape of decision, and
the gate is not sufficient protection against it: the agent can propose the
change, and the approval card then arrives carrying the agent's own account of
why it needs a more capable model. A person approving that is reading an
argument written by the thing it benefits.

This is not a second authority mechanism. §11.2's gate answers *may this run
without a person?*; `agentVisible` answers *may the model see this exists?* The
first is about authority over the ledger. The second is about the model's reach
over its own configuration, and the two are not the same question.

**It is deliberately not a general-purpose hiding mechanism.** Anything hidden
here is invisible to a system whose whole design is one registry with two
consumers, so every `false` is a small hole in §11.0's guarantee. One screen's
worth is the whole intended population; a second reason to use it needs its own
argument in this section, not a judgement call at a call site.

**Introspection.** The agent needs to know what exists, so the registry is
self-describing: the operation catalogue, the category tree, the account list,
the widget catalogue, and the current dashboard layout are all readable. An
agent that cannot enumerate its own capabilities cannot be asked open questions
about them.

### 11.1 Typed tools, not SQL generation

| Read — auto-runs | Write — requires approval |
|---|---|
| `search_transactions` | `create_transaction` |
| `get_balances` | `update_transaction` |
| `spend_by_category` | `set_transaction_lines` |
| `compare_periods` | `categorize_batch` |
| `find_duplicates` | `create_category` |
| `find_unsettled` (§6.4) | `propose_rule` |
| `get_category_tree` | `run_import` |
| `export_excel` | — |

**This table is illustrative, not the contract.** §11.0 is the contract: the
agent's tools are *generated from the operation registry*, so its reach is
whatever the UI can do — settling a debt, overriding a rate, editing a rule,
configuring a widget, archiving an account. Enumerating a fixed list here would
recreate the drift that having one registry exists to prevent. What the two
columns fix is the **read/write split**, which is a property of each operation
and the thing the approval gate keys on.

Text-to-SQL over a financial ledger trades unbounded blast radius for marginal
flexibility. A bounded typed surface is also far easier to evaluate.

### 11.2 Writes render a diff card

Reads run freely. Anything mutating renders a before/after card that must be
tapped to approve. Nothing is written on the model's own authority, ever.

Implemented with the SDK's tool runner, gating inside each write tool's run
function — rejecting returns a "declined" result and the loop continues
normally rather than breaking.

#### Auto mode

Gating every write is correct as the default and tiring as the only option —
recategorising forty import rows by voice should not be forty approvals.

**Auto mode is opt-in, explicit, and visible.** You turn it on deliberately;
the interface shows unmistakably that it is on; and it is scoped rather than
global:

| Property | Behaviour |
|---|---|
| Default | **Off.** Every write gates |
| Scope | Per operation class — e.g. recategorisation on, deletion never |
| Duration | The session, or a stated number of operations. Never permanent |
| Never eligible | Deletes, configuration changes, anything touching tax scope or the pivot currency |
| Field ineligibility | Enforced per **field**, not per operation — see below |
| Audit | Unchanged — auto-applied writes are logged identically, marked `auto` |
| Exit | One tap, and any single write can still be reverted (§11.2) |

**The tax boundary is a field boundary, and the grant is an operation
boundary.** *"Anything touching tax scope"* is not expressible as a list of
operation names, because the operation you would obviously auto-grant is the one
that can cross it: `update_transaction` sets `category_id` — which is
recategorisation, the motivating example — and the same operation sets
`is_business`, `ryczalt_rate` and `ryczalt_activity`. Grant recategorisation for
the session and a single tool call can move forty rows into or out of the tax
view with no approval and no distinguishing mark. Under ryczałt the damaging
direction is *out*, and §13.1's whole argument is that this cannot happen.

So eligibility is evaluated against the **fields the call actually writes**, not
the operation it belongs to. The registry (§11.0) marks each writable field
`tax_sensitive`; a call under an auto grant that names one is gated
individually, whatever else it also sets, and the approval card shows only the
sensitive fields with the rest already applied. The ineligible set is
`is_business`, `ryczalt_rate`, `ryczalt_activity`, `counterparty_tax_id`,
`date` (it decides the period), `accounts.ownership`, and `currencies.is_pivot`.

A category change *can* alter tax scope indirectly, since `is_earnings` feeds
`tax_omission_candidates`. That is a report, not a write, and it is checked at
close (§13.4) rather than gated per row — the point of the field list is that
nothing silently changes a filed figure, not that no figure can ever move.

The grant itself is stored, not just its consequences:

```
agent_auto_grants   id, session_id, operation_class, granted_at,
                    expires_at, max_operations, used_operations, revoked_at
```

`agent_tool_calls.auto` records that a write was auto-applied; this records
**what was permitted, and until when**. Without it the scope and duration rules
above are enforced only by whatever the running process happens to remember,
which is not a property you want on the one feature that bypasses approval.

The model is Claude Code's own: gate by default, opt into speed deliberately,
and make the state you are in obvious at a glance.

### 11.3 Everything is logged

`agent_tool_calls` records input, output, approval time, and application time.
`audit_log` marks agent-originated changes with `actor = 'agent'`. Sessions are
retained as an audit trail.

### 11.4 Loops where you are present; pipelines where you are not

The dividing line is **not** read-versus-write, and it is not extraction versus
conversation. It is whether a person is sitting inside the interaction while it
happens.

| Assist | Shape | Reproducible | Why |
|---|---|---|---|
| `quick_add` — **Quick add, conversational** (S05) | **Agentic loop**, read tools | No | You are present, working on **one** transaction, and correcting as you go |
| `agent` — **Agent** (S03) | **Agentic loop**, read + write | No | Conversational by definition |
| `receipt` — Receipt (§10.2) | Pipeline, one pass · refinable | Per pass | Queued and extracted in the background |
| `classify` — **Classification** (§9.2) | **Deterministic pipeline** | **Yes** | Hundreds of rows, reviewed in bulk |
| `voice` — Voice (S08) | One pass · refinable | Yes | J2 targets **under 10 seconds** at a till |

#### Retrieval is not agency

The distinction I need to make, because conflating them is what pushed loops
into places they do not belong.

S02c specifies a model reason reading *"Swiss grocery chain, matches prior
Migros rows in this account"*. That requires the model to **have** prior-merchant
context. It does not require the model to be able to **go looking** for it.

A deterministic step does it better:

```
raw row → normalize payee
        → retrieve the k most similar prior payees + their categories
        → one call, that context in the prompt, schema out
```

Same reason string, same quality — and reproducible, cheap, fast, and
benchmarkable against fixtures. This is retrieval, not a tool loop, and it is
what the classification tier should be.

#### Why bulk import must stay deterministic

Beyond speed and cost, **replayability is a stated guarantee**. §9.4 keeps
`import_rows.raw` unmutated so a reparse after a prompt or parser change is
always possible — and that promise only means something if the earlier answer
can be accounted for. An agentic loop cannot offer that: two runs over the same
row may take different paths.

**Be precise about what is being promised, because a pipeline is not a pure
function either.** Three things move underneath it independently of the row: the
model version behind a floating alias; the retrieved neighbours, which come from
the *live* ledger and therefore change as you keep using the system; and batch
co-tenancy, since row 37 shares a context with rows 1–36 and a different batch
boundary gives it different company. Nothing here pins temperature or a seed. A
claim of bit-identical reruns would be false in three independent ways.

What is actually guaranteed is that **every classification can be explained and
re-derived from its recorded inputs.** `import_rows` stores `model_id`, the rule
conditions as they fired (`rule_snapshot`), and the ids that retrieval returned
(`retrieved_ids`) — added in migration `0004`. Replay pins those neighbours and
that model rather than re-retrieving, so the run is reproducible against the
state it actually saw. Re-running against *today's* ledger is a different
operation with a different name, `reclassify`, and it is expected to differ;
conflating the two is how a "reproducible" system quietly stops being one.

The deterministic shape is what makes this possible at all: with no tool loop
there is one call whose entire input is those three recorded things plus the
untouched raw row.

Determinism also makes the tier *evaluable*. Three hundred fixture rows scored
against known-good classifications is a number you can watch move when you
change a model or a prompt. A loop gives you an outcome without a trajectory.

So: one call per row (or per batch), cached stable prefix, retrieved context,
structured output. **No tool loop in the import path.**

#### Where the loop earns its place

Tapping `+` and starting a transaction is the opposite situation. One row, you
are present, and the interaction *is* the iteration:

> *"coffee at that place near the office"*
> → searches recent payees near prior transactions
> → *"the café near the office?"*
> → yes
> → draft filled, with its trail

That cannot be a pipeline, because the useful move — asking you a question — is
only available to something that can take another turn. It is also the one place
where a slower, smarter interaction is what you asked for by choosing to talk
rather than type.

#### The ten-second target is per path, not per screen

J2's target belongs to the **keypad** path, which involves no model at all and
should stay instant. Choosing to converse is choosing a different trade, and the
budget follows the choice:

| Path | Budget |
|---|---|
| Keypad | **Under 10 s**, no model call |
| Photo | Queued; background |
| Voice — dictating a transaction | One pass, tight |
| **Conversational capture** | As long as it takes to get it right |

#### What every model surface shares

Read tools only, except the agent. Extractors and the capture loop are generated
the **read half** of the registry and nothing below it — not a restricted write,
no write operation at all. The boundary is which tools exist for that surface,
so it survives a confused model, a prompt injection inside a receipt image, and
a future refactor that forgets why the rule was there.

And every machine-produced draft is refinable in one sentence (`RefineRequest`),
whether it came from a loop or a pipeline. Refinement is a second pass, not a
conversation, on the surfaces that are pipelines.

#### Quality still matters inversely to how much review the output gets

The instinct is to buy the best model for the chat surface. That is backwards
here.

Every agent write passes a gate you tap (§11.2), so a weak proposal costs a
decline — annoying, never corrupting. But import classification is **bulk
accepted** above a confidence threshold, and a receipt fills a draft saved in
under ten seconds. Those are the paths where a mediocre model writes wrong data
into the ledger without anyone reading it.

So: **spend on the extractors, economise on the agent.** Receipt, classification
and voice carry the quality bar; the conversational agent is the one surface
that can afford a smaller model, because it is the one whose every output is
already read by a human before it takes effect.

Giving the extractors tools does not soften this — it sharpens it. A model that
can look up prior decisions is a model whose mistakes are better-informed and
therefore more plausible, which is exactly the kind that survives a bulk accept.

#### The model is configuration, per assist

**Assist**, not surface. Everywhere else in this system a surface is web or
mobile (`architecture/11`), and one word carrying two meanings is how a column
ends up meaning whichever one the reader arrived with. The five rows above are
the assists.

```
models     assist (quick_add | agent | classify | receipt | voice)
           enabled, provider, model_id, effort, max_tokens

settings   assists_enabled            the master switch
```

**Five, not four.** The table above has always named five and the schema listed
four — `quick_add` was missing, silently, because nothing cross-checked the two.
S33 is where that surfaced.

**`enabled`, and a master switch above it.** Every assist can be turned off
individually, and one switch stops all model calls at once. The master switch
**overrides** rather than clears: the five per-assist settings survive it and
come back when it is turned on. Off means degraded behaviour, not a broken
feature — the deterministic path underneath each assist still runs, and the UI
says the assist is off rather than pretending it worked. S33 specifies this.

**A provider is configuration *and* an adapter.** The row is configuration —
which assist points where, changeable without a migration and comparable by
swapping one value. Reaching a provider at all is code: one gateway interface
with an implementation per vendor, carrying `listModels()` so the catalogue comes
from the provider rather than from a list in this repo that would be wrong within
a month. Treating the provider name as pure configuration would mean a string
nobody can speak to.

**What is recorded, and what is not.** The ledger, the registry and the UI carry
no ambient knowledge of which model is configured. That is not the same as
recording nothing: `import_rows.model_id` stores which model answered each
classified row (§9.4, C10, migration `0004`), because the replayability
guarantee above depends on it. An earlier version of this paragraph said nothing
records which model answered — that was true before `0004` and contradicts the
replayability argument a hundred lines up.

#### Cost is not the constraint at this volume

Measured against ~2,000 transactions, ~200 receipts and ~200 agent turns a
year, total annual model spend runs between roughly **$0.50 and $25** depending
entirely on which tier is chosen — and stays under $250 at ten times the usage
on the most expensive option.

This retires the assumption behind **R7**. The reasons to prefer a smaller model
are **latency** (receipt extraction targets 2–5 s, agent turns 3–15 s) and
**routing** (below), not cost. Choosing a cheap model to save money here is
optimising a rounding error.

#### What is provider-specific, and must not be treated as architecture

Four things in this spec are one vendor's API surface written as though they
were design:

| Currently specified | Reality |
|---|---|
| `cache_control` breakpoints (§9.2) | Caching semantics and discounts vary by provider and, through a router, by upstream. §9.2's cost argument **must be measured, not assumed** |
| `stop_reason: "refusal"` (§11.4) | One vendor's response shape. `RefusalCard` (S03) needs a normalized signal |
| The SDK tool runner (§11.2) | An implementation detail. The gate is ours; the loop is theirs |
| `effort` and adaptive thinking | Not universally available |

The approval gate, the audit trail and the operation registry are ours and
survive any provider change. These four do not, and the provider adapter is
where they belong.

#### Routing is the real question, and it is a §5 question

Going through an aggregator means receipt images and transaction descriptions
transit a third party **in addition to** the upstream model provider. §1 opens
with physical custody of the data; §5.5 keeps receipt images indefinitely
because they are the evidence trail; §5.4 now encrypts them before they reach
Backblaze precisely so a storage provider holds ciphertext only.

Sending the same images to a router in plaintext is not inconsistent with that
by accident — it is a different decision about a different provider, and it
should be made deliberately rather than inherited from a convenience. **O17.**

#### Still true regardless of provider

- Context carries the category tree, account list and recent activity — not all
  7,874 rows. Tools fetch what is needed.
- The stable prefix (taxonomy, account list, tool definitions) is cacheable
  where the provider supports it, and the per-batch payload goes after it.
- Structured output is a schema contract, not prose parsed afterwards.
- A refusal is handled before content is read.

### 11.5 Category proposals

The agent may **propose** a new category when nothing fits; it never creates one
silently. This is the guardrail that keeps a dynamic taxonomy from becoming 400
junk categories — and the risk is not hypothetical, given 122 categories with 13
name collisions today.

### 11.6 What the agent keeps in mind

A loop that forgets everything between turns re-asks questions you have already
answered. But this system has a property most agent memory designs do not: **the
facts are already queryable.** Balances, history and categories live in Postgres
and are always current. That decides most of what follows.

#### Three mechanisms, three different problems

| Mechanism | Handles | In Waltning |
|---|---|---|
| **Clearing** | Bulky, re-fetchable tool results | Aggressive. A `search_transactions` result is large and perfectly re-fetchable — the ledger is authoritative and always there |
| **Compaction** | Long dialogue and reasoning | On long agent sessions only. Capture loops are short by construction |
| **Memory** | Knowledge that must survive a session | Narrow, and deliberately so — see below |

Memory tool results are **excluded from clearing**, so the loop can rely on what
it wrote still being present.

#### Memory holds behaviour, never facts

The tempting mistake is to let memory accumulate financial knowledge — *"Nina
owes 840 PLN"*, *"the flat cost 380k"*. That would create a second source of
truth that drifts from the first, which is the exact defect §6.6 removed by
deriving balances instead of storing them.

**Memory holds what the ledger cannot answer:** conventions, preferences, and
resolved ambiguities.

```
✅  "Calls BANK-A/BIZ 'the business account'"
✅  "Georgia trips are usually business — ask, don't assume"
✅  "Nina's shares are always debt, never reference"
✅  "Splits restaurant bills by shares, not evenly"

❌  "Nina owes 840 PLN"                  → derived, query it
❌  "Żabka is Groceries"                 → this is a RULE
❌  "The February statement had 340 rows" → query it
```

**Enforced, not merely stated** — `agent_memory_no_figures`, a `CHECK`. This is
content prepended to *every* turn and, under O17, the most-exposed data in the
system, so a screen is not enforcement.

The predicate refuses a ledger **figure**, not any number: a quantity carrying a
currency code or symbol, a run of four or more digits, or a two-decimal amount.
The first version was `[0-9]{2,}`, which also rejected *"split group dinners
50/50"*, *"anything from Żabka after 22:00"* and *"round cash to the nearest
10"* — every one of them behaviour, none of them capable of drifting, and all
three precisely what this feature exists to learn. A guard that blocks the main
use case with an unreadable constraint violation, on the one write that bypasses
the approval gate, is worse than a slightly loose one (C20, migration `0008`).

**It is a guard, not a proof.** *"Rent went up by a third"* still passes. The
`CHECK` stops the mechanical failure — a figure copied out of the ledger into a
prompt prefix, where it silently goes stale — and S32 covers the remainder by
keeping every memory listed, editable and deletable.

#### Prefer a rule to a memory

Anything expressible as a rule (§9.2) **must be one**. A rule is deterministic,
inspectable, editable on S20, carries hit counts, and applies for free without a
model call. A memory is prose that costs tokens on every turn and cannot be
tested.

So the hierarchy is: **schema for facts · rules for deterministic behaviour ·
memory for the rest.** Memory is the smallest of the three by design, and a
memory that could have been a rule is a bug.

#### Memory does not gate, and is not opaque

§11.2 says nothing is written on the model's own authority. Memory is a write —
but it is not ledger state, so it moves no balance, changes no report, and
reaches no tax output. Gating every memory write would be exhausting and would
defeat the point.

**The accountability substitute is inspection.** Everything the agent believes is
readable and deletable on one screen (S32), in the prose it was written in.
Where the ledger is protected by a gate, memory is protected by being legible.

#### Memory ships on every turn, which bounds it

Whatever memory holds is prepended to every call on every surface that reads it.
That makes it simultaneously the **most-repeated** content in the system and, if
routing goes through an aggregator (**O17**), the **most-exposed**.

Two consequences:

- **A hard size bound**, enforced rather than encouraged. When it is reached the
  agent consolidates — distilling entries and dropping stale ones — as an
  ordinary operation.
- **No amounts, no counterparty balances, no account numbers.** Not as a
  guideline: memory is the one place where a careless line is transmitted
  hundreds of times.

#### Shape

Organised by domain rather than chronology — one entry per convention, not one
per session. A session log would grow without bound and be re-read entirely to
find one preference.

```
memory   id, scope (global | counterparty | account | category),
         subject_id, body, created_at, last_used_at, source
```

`last_used_at` is what makes consolidation possible: an entry that has not
informed anything in months is the first candidate to drop.

**Read by** the capture loop (S05 `💬`) and the agent (S03). **Written by** the
same two. The deterministic pipelines do not read it — retrieval gives them
their context (§11.4), and a pipeline that consulted a mutable prose blob would
stop being reproducible.

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
  SELECT ... FROM transactions t JOIN accounts a ON a.id = t.account_id
  WHERE t.is_business = true
    AND t.deleted_at IS NULL
    AND a.ownership = 'own';
```

**The ownership join is load-bearing and was missing for a long time.** With
only the first two predicates, 5a below is defeated by a write to a different
table: S16 makes `own → shared` explicitly retroactive across 498 rows, and a
trigger on `transactions` does not fire on an `accounts` update. Business rows
would sit in a now-shared account and remain visible to every tax adapter.

**3 · Enforced by the database, not by discipline.** The export path connects
as a Postgres role holding `SELECT` on `tax_ledger` and **no privilege at all**
on `transactions`. A tax adapter that tried to read personal data would fail
with a permissions error rather than succeed quietly. This is the part that
makes T1 a guarantee: correctness no longer depends on every future query being
written carefully.

The role, the view, and the `REVOKE`s are `packages/db/drizzle/0005_tax_ledger_roles.sql`.
Until that migration existed, `tax_ledger` appeared in the repository's SQL
exactly once — inside a comment — and this section described a mechanism that
had never been built. Two details the DDL has to get right and the prose above
does not say:

- The denials are **enumerated**, not implied. Personal rows also live in
  `receipts.ocr_json`, `import_rows.raw`, `agent_tool_calls.output`,
  `agent_memory` and `transaction_lines`; an `ALTER DEFAULT PRIVILEGES … REVOKE`
  keeps anything added later out by default, because `GRANT SELECT ON ALL
  TABLES` is what a tired person types at 2am.
- `POSTGRES_USER` is the bootstrap **superuser**, and a superuser bypasses every
  `GRANT`. `createDb()`'s default argument means an export module written the
  obvious way silently connects as it — converting *fails loudly* into *succeeds
  quietly*, which is the worst available outcome. The export path must take its
  connection explicitly.

**4 · Mixed purchases are split, not apportioned.** A laptop that is 70%
business becomes two transactions — one business, one personal — rather than
one row with a percentage. Percentages hide in a column; two rows are visible
in every report and each carries its own evidence.

**5 · Every flip is audited.** Changing `is_business` writes to `audit_log`
with the actor. Bulk changes by the agent require approval like any other write
(§11.2).

**5a · Shared money cannot become business.** `accounts_shared_not_business`
blocks it at the account level, and a trigger blocks it at the transaction level
(§6.5). Without the second, a transaction flagged `is_business = true` in a
jointly-owned account would pass every check and land in `tax_ledger` — a hole
in exactly the guarantee this section exists to make.

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

**Residency is modelled as a dated timeline and surfaced on S22**, so scheme
resolution keys on *(jurisdiction resident in, transaction date)* rather than
date alone. Building it while only Poland is live is deliberate: every scheme
lookup would otherwise change shape the moment a second jurisdiction arrived.

**It selects which jurisdiction's forms apply, and nothing more.**
Double-taxation relief, treaty positions and foreign tax credits are not
modelled and remain deferred (O11). A period resolving to `DE` yields a
German-shaped projection of German-resident activity; it does not tell you what
is owed after relief. The interface states this, because a residency timeline
otherwise looks like a system that understands being taxed in two places.

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
| FX | NBP rates — which is why NBP is preferred over ECB for PLN in §7.7 |

#### United States — `US`

| | |
|---|---|
| Form | [Schedule C (Form 1040)](https://www.irs.gov/forms-pubs/about-schedule-c-form-1040), Profit or Loss from Business |
| Structure | Expenses on Part II, **lines 8–27b** — a fixed, well-documented line set |
| Lines | 8 advertising · 9 car and truck · 10 commissions · 11 contract labor · 12 depletion · 13 depreciation · 14 employee benefits · 15 insurance · 16 interest · 17 legal and professional · 18 office expense · 19 pension · 20a/20b rent (equipment / property) · 21 repairs · 22 supplies · 23 taxes and licenses · 24a travel · 24b meals · 25 utilities · 26 wages · 27b other |
| Quirks | Meals 50% deductible, entertainment 0%, commuting never. Line 27a is reserved for §179D, so "other" sits on **27b** |
| Deductibility test | IRC §162 — ordinary *and* necessary |
| Mileage | 72.5 ¢/mile for 2026, or actual costs |
| Currency | USD is the pivot every rate is already stored against (§7.0), so no conversion layer is needed |

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
resolution by transaction date rather than by export date.

**A scheme is immutable once a period closes against it — and closing is an
explicit act.** It is yours to perform, from S28, because you know when you have
filed and the software does not. Closing records who closed it and when, freezes
the scheme for that period, and requires every completeness warning to be
cleared **or explicitly acknowledged** — so the lock also carries a record of
what was known to be incomplete at the time, rather than implying it was clean.
Reopening is possible and audited.

```
tax_period_locks   jurisdiction, period_start, period_end,
                   scheme_id, closed_at, closed_by,
                   acknowledged_warnings jsonb, reopened_at
```

The lock is load-bearing beyond the tax layer. A closed period's rows are
frozen, which is what lets an export rebuild be **guaranteed byte-identical**
(S27) and what stops a later FX correction silently re-rating figures you have
already filed against (S18). Automatic alternatives were rejected: an export
gets built to check a figure, and a deadline would lock periods you never filed.

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

#### Which day's rate values a foreign-currency revenue row

Unspecified until now, and **the system's general FX path is the wrong answer
here.** §7 converts by triangulating through the USD pivot, which produces a
cross-rate NBP never published. A tax authority uses the rate its own central
bank actually printed.

**The rule: the average NBP rate from the last working day *preceding* the day
the revenue arose.** Not the day itself, and never derived through another
currency. An invoice issued in EUR on a Monday is valued at the NBP EUR table-A
rate published for the preceding Friday.

It is **stamped per row** — `tax_fx_rate`, `tax_fx_date`, `tax_fx_source`
(migration `0009`) — for the same reason `ryczalt_rate` is stamped: a later rate
correction must not reprice a period you have already filed. Adapters read the
stamped value and never recompute one.

A foreign-currency business row with no stamped rate **cannot be filed**, and
that is reported rather than refused (`tax_unvalued_revenue`, surfaced on S28's
completeness list). Refusing the write would block capture at the moment of
entry — and the preceding working day's rate may not be published yet when you
record the invoice.

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

#### Revenue is live, which moves this earlier

The JDG is trading and revenue rows exist **now**, so the revenue fields are not
export-only metadata. Three fields must be available when business revenue is
recorded:

```
transactions  + ryczalt_rate      numeric — per revenue row, from the ACTIVITY
              + counterparty_tax_id            (already present)
              + ksef_id                        (already present)
```

`ryczalt_rate` is the one field that exists nowhere else in the design and
cannot be inferred from the expense taxonomy. It resolves from a **dated rate
table**, keyed by activity, using the same by-transaction-date rule schemes
already follow (§13.4):

```
ryczalt_rates     id, activity, rate, valid_from, valid_to
counterparties  + default_activity
```

The resolved figure is **stamped on the row**, not left as a lookup — so a rate
change next January cannot reprice last year, and correcting the table does not
rewrite history. Two clients at different rates and an annual rate change become
the same mechanism rather than two special cases.

**What is and is not urgent.** KSeF has been mandatory for JDG since
2026-04-01, the ≤10,000 PLN/month relief expires 2026-12-31, penalties resume
2027-01-01, and electronic record-keeping binds from the same date. None of
that is Waltning's obligation to discharge — N1–N3 hold, and the invoices are
issued elsewhere. What Waltning owes is the **reconciliation and evidence** side:
somewhere to record the NIP and KSeF id against each revenue row, and a view
that says what is missing. That is S28 and the completeness list, and it wants
to exist before the first period it is used to check.

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

**The canonical statement of this design is `architecture/14-local-first.md`;
this section applies it to the mobile client.** The phone is complete — it
holds the whole ledger — and not authoritative — every write is still one-way
intent, admitted or refused by the server.

**The phone is self-sufficient.** It does not need the backend to do the job a
phone does: capture. With no connectivity you enter transactions, transfers and
settlements, capture receipts, read your balances and history, and edit what you
entered. An expense tracker that needs a network at the till is not an expense
tracker.

What you lose is the agent, and that is stated rather than degraded.

This section was rewritten after an eight-way adversarial review. Three of its
previous claims were false and are corrected below: that the phone never
computes, that offline is a matter of hours, and that the mirror has no
eviction problem — the last of these was itself later superseded again: the
local-first reframe (`architecture/14-local-first.md`) doesn't budget the
eviction problem more carefully, it deletes it, by making the replica the
whole ledger.

#### Offline is days to weeks, not hours

The earlier draft argued that Tailscale makes the Pi reachable wherever there is
internet, so offline is a plane or a basement. That is wrong for this system, and
the rest of the specification is the evidence: §7.0 splits time across Poland,
the United States and Germany, changing several times a year; §1.3 lists active
accounts in Georgia and Belarus, outside EU roaming; §5.1 deliberately leaves
Tailscale node-key expiry **on**; and `01-context-and-containers.md` does not
say Tailscale loss is brief — it says **"Total loss of access — accepted."**

Sync also requires the **Pi** to be reachable, not merely the phone to have
signal. Add an ISP outage, a power cut, an SD-card failure (R6, rated High over
years) or a house move, and the honest sizing is **days to weeks**.

The 90-day window in the earlier draft correctly estimated how long offline can
run; the prose around it was what was wrong. Storage no longer needs to track
that estimate at all — the replica holds the whole ledger regardless of how
long the phone stays offline (`architecture/14-local-first.md` §14.0) — but the
days-to-weeks sizing below still governs everything about *reconnecting*: the
outbox, the fold, and how stale a figure is allowed to look.

#### The phone captures; the backend reconciles — and the phone may still compute

The division is about **write authority**, not about arithmetic:

| | Phone | Backend |
|---|---|---|
| Create a transaction, transfer, settlement, receipt | ✅ | ✅ |
| Edit or delete what it created | ✅ | ✅ |
| **Admit a write against the ledger's invariants** | ❌ | ✅ |
| Compute figures classified **F** or **R** (below) | ✅ | ✅ |
| Compute figures classified **S** | ❌ | ✅ |
| Import, migration, bulk review, period close, rerate | ❌ | ✅ |
| Agent, receipt extraction, classification | needs a model, so needs a network | ✅ |

**The phone is never an authoritative writer.** Every guarantee in §6.5 is a
Postgres mechanism — cross-table triggers, `CHECK`s, an `EXCLUDE` constraint,
generated columns, role privileges. SQLite has no equivalent, so an authoritative
phone would either reimplement them (the *asserting is not enforcing* failure
this specification's register documents twenty times) or be quietly weaker and
accept rows the server later refuses. A sync-time refusal after days of
authoritative operation has no clean recovery: the balances shown for those days
were wrong, and you cannot un-show a number someone acted on.

**But that argument is about write admission, and it says nothing about
arithmetic.** `SUM(-amount_original)` over rows the phone holds needs no
`EXCLUDE` and no trigger. The earlier blanket ban was wrong, and the draft broke
it two paragraphs later with its own balance formula.

#### The rule: checkpoint-plus-fold

> The phone may combine a **server-issued checkpoint** with its own
> **unacknowledged outbox entries**, using the shared functions in `money.ts`.
> It may also compute figures classified **R** over a range its replica covers
> completely. It may never compute a figure classified **S**.

Since the replica is now the **whole ledger**, not a recent window, "a range
its replica covers completely" is in practice the entire history back to 2020
— the mechanism is unchanged, only what it ranges over has grown.

Every figure in `computations.md` carries a class:

| Class | Meaning | Examples |
|---|---|---|
| **F** — foldable | A checkpoint plus outbox arithmetic, using `signed()` / `debtDelta()` | Account balance (§2), net worth mine and ours (§3), counterparty balance per currency (§7), clearing balance (§8) |
| **R** — replica-computable | Derivable from replicated rows, **only over a range the replica covers completely** | Transaction list and detail, calendar day/week/month nets, period spend over a covered range, substring search (§13) |
| **S** — server-only | Has a documented way to be subtly wrong, or depends on state the device holds staler than it knows | `spend_by_category` (§6), shared-boundary netting (§5), capital-excluded comparisons, FIFO ageing and largest-remainder allocation (§7–8), duplicate detection (§9), confidence (§14), all of §12, **every tax figure** |

The **S** list is not timidity. Each entry has a defect in the register behind
it: a `LEFT JOIN` with `COALESCE` counting a four-line transaction four times;
netting that silently uses the source amount without `to_amount_pivot`; a
reciprocal rate error of 14.1×. A TypeScript second implementation is a permanent
drift surface exactly where drift is invisible.

#### Fold against a watermark, never against a clock

A checkpoint carries `(value, server_seq)`. The fold includes only entries **not
acknowledged at or below that `server_seq`**.

This matters more than it looks. Drain and checkpoint-refresh are two operations
with no inherent ordering: refresh first and drop entries after, and the figure
**double-counts**; drop first and refresh after, and it **under-counts**. A
wall-clock stamp cannot distinguish either from ordinary staleness — it produces
a balance wrong by exactly one coffee, wearing an honest-looking timestamp. That
is the class of failure this register opens by naming.

The clock is for the human; the sequence is for the arithmetic.

The fold covers three entry shapes, not one:

```
create           → + signed(input, side)
delete           → − signed(cached_row, side)
patch (amount)   → + signed(patch, side) − signed(cached_row, side)
```

Any entry whose target is **not in the replica** suppresses the adjustment
entirely: the figure falls back to the bare checkpoint with the pending count
shown but not applied. An honestly incomplete number beats a confidently wrong
one.

**`blocked` and `sending` entries still count.** The money moved in the world
regardless of the server's opinion of the row. Excluding them makes a balance
*rise* by the value of purchases you actually made, at the moment a drain
finishes — and then you spend against it.

#### What the phone holds — the whole ledger, budgeted in bytes

The earlier claim, *"kilobytes… no pagination or eviction problem to design"*,
was wrong about the number. It was corrected once already, to a **90-day
window budgeted across four tiers** — and that correction is itself
superseded. `architecture/14-local-first.md` (§14.0) settles the question a
different way: the replica holds the **whole ledger**, not a window, so there
is no size compromise to budget and no eviction to make safe. ~8,000 rows
costs single-digit megabytes, which the hardware and the network both have to
spare.

| What | Contents | Size | Growth |
|---|---|---|---|
| **Reference** — complete, never evicted | Accounts, category leaves, counterparties with last-used category, currencies, **all** period locks, cached checkpoints | ~157 KB | flat |
| **Transaction rows** — the whole ledger, complete | Every transaction, transfer and settlement the replica may hold, soft-deleted rows included as tombstones (below) | ~5–6 MB | tracks the ledger — §15 projects the rate rising from 5.5 to 9.5 a day |
| **FX** | Last-known rate per currency pair, for pricing a *new* capture | ~15 KB | flat |
| | **Total live** | **~5–6 MB** (§14.0's "single-digit megabytes") | tracks the ledger |

**There is no day-aggregate tier, and none is needed.** The calendar promises
virtualized scroll across ~2 100 days; with the whole ledger resident, its day,
week, month and year nets are **R**-class figures (below), computed directly
from the transaction rows the replica always covers completely, across the
whole history since 2020 — not a 90-day slice of it.

**There is nothing left to bound.** The earlier tiers protected a row
referenced by a pending outbox entry with a union clause against its own
eviction; a complete replica has no eviction for that clause to guard against.

**Historical FX rates are not mirrored.** Mirroring six pairs across 2 100 days
costs 1 MB — and is unnecessary, because the replica carries each row's
**already-converted display amount**, computed server-side. Last-known rates
remain for their one legitimate use: pricing a *new* capture. Changing display
currency is an online settings action that bumps the replica epoch.

**"Last-known" is, per pair: the last real-source row, and every
`carried_forward` row after it — never a carried row mirrored alone.** A
carried row with no real-source row behind it in the replica is exactly the
orphan `readNearestRate` (§7.6/§7.7) refuses to serve, so a sync that mirrored
only the newest row for a pair could hand a weekend-carried phone a copy with
nothing to trace to — `capturable` would read `true` from a real row the
replica once held, while `readNearestRate` had nothing left to find. Mirroring
the trailing carried run alongside its origin keeps `capturable` and
`readNearestRate` answering the same question from the same rows.

#### Replication, not caching

The replica syncs by `(updated_at, id)` cursor and **includes soft-deleted rows**,
(the cursor is a *watermark over the server's own clock*, which is a different
job from the per-row conflict token and correctly stays a timestamp),
so `deleted_at` propagates as a tombstone. Without that, a transaction deleted on
the laptop lives on the phone forever — in the list, and in every locally
computed total that included it.

A server-side `replica_epoch` is bumped by any bulk operation: rerate, import,
migration, period close, display-currency change. On mismatch the phone drops and
refetches. That now costs one round trip of a few megabytes — the whole ledger,
not a window (§14.0) — and it is affordable precisely because **nothing in the
replica is a source of truth.**

A §15.1 invariant compares a device replica checksum against the server's at the
same watermark. It is the only check in the system that would catch a sync bug.

**Excluded from the replica**, deliberately: `receipts.ocr_json`,
`import_rows.raw`, `agent_tool_calls.output`, `agent_memory`, `audit_log`. T1 is
a guarantee about the *export path* (§13.1) and does not extend to the device —
so the device must never become a source for a tax artifact. Any phone-side
export calls the server and receives rows already filtered through `tax_ledger`.

#### The client never stamps a rate

`fx_rate`, `to_fx_rate`, `tax_fx_rate` and `ryczalt_rate` are all resolved
**server-side at commit**, from the row's own date. The phone's cached rate is
display only, and an explicitly agreed rate (§7.6 level 1) travels as a separate
field marked `manual`.

This is not a detail. The earlier design had the client stamping four valuations
that freeze into `GENERATED` columns and are not re-derivable afterwards:

- A foreign-currency capture was valued at whatever rate the phone last held —
  and three documents disagreed about whether it would ever be corrected. §14.3
  promised a firm-up offer, H8 said only a manual rate clears the flag, S18
  attached the offer solely to `set_manual_rate`. The ordinary path had **no
  mechanism at all**, and `amount_pivot` materialized the stale figure forever.
- A cross-currency transfer captured offline pre-filled its destination amount
  from the cached reference rate, so both legs valued to the same pivot amount
  and **the margin was identically zero** — the exact failure §7.5 exists to
  prevent, indistinguishable from a genuinely fee-free transfer.
- The same stale `to_fx_rate` fed `to_amount_pivot`, corrupting the
  shared-boundary netting in `computations.md` §5 — a headline figure.
- A business revenue row landed with `tax_fx_rate` and `ryczalt_rate` unstamped
  and nothing to stamp them later, so it was permanently unfilable under a scheme
  whose failure direction is under-declared revenue (C5).

Server-side resolution collapses all four. `fx_rate_estimated` is set by
whichever side values the row: the **server**, at drain, if and only if no
published rate exists for that date; or the **phone**, at capture, when it
must price the row from a quote not in effect on the row's own date — §7.6's
*"when no rate exists at all"*, the carry-forward cap exhausted or nothing
held for the pair on either side of that date. A weekend or holiday carried
forward within the cap is not an estimate on either side: §7.6's table lists
it as the ordinary answer for that date, not a fallback. Clearing the flag
when a published rate is substituted is a correction of provenance, not a
model rewriting your data, so §11.2's gate does not apply and it is
automatic.

Offline, a cross-currency transfer leaves the destination amount **empty**, with
the stale reference shown only as a hint. An unedited destination amount is then
impossible.

**The row the phone writes locally is a separate question, and it has a
different answer.** `transactions.fx_rate` is `NOT NULL`, so a capture made with
no backend has to carry *something*. What makes that safe is two properties of
where the number lands. `amount_pivot` and `to_amount_pivot` are a view —
`transactions_valued` — and are absent from the device table entirely, so a
local rate materializes nothing and is re-derived on every read. And the drain
applies the server's canonical row over the local one (`architecture/08`), so
the correction arrives on the ordinary path rather than as an offer attached to
some other operation.

The phone therefore writes a **provisional** rate — exactly `1` for a
same-currency capture, which is not an estimate; otherwise the rate nearest
the row's own date that the replica holds (§7.6/§7.7: carry-forward first,
the nearest real-source row on either side only when carry-forward has
nothing), flipped once from `fx_rates.rate`'s units-per-pivot to the
pivot-per-unit this column holds. Who *decides* is unaffected: the phone
never sends that number as an assertion, and the server still resolves the
real rate at commit from the row's own date, replacing whatever the phone
wrote. **`fx_rate_estimated` is set by whichever side values the row** — the
phone, at capture, only when it had to reach past carry-forward for a quote
not in effect on the row's date; the server, at drain, when it re-resolves
from the row's own date and finds no published rate. A provisional figure no
reader can identify as provisional would be the same defect wearing a
different name, so the line that matters is that the phone's number never
leaves the phone.

#### Validate at entry, not at sync

The phone holds every period lock, all account currencies and the category tree,
so it refuses locally what the server would refuse anyway. That is the difference
between a refusal you can act on while you still remember the purchase and a
blocked entry found three days later.

It is an optimisation, never the guarantee — the server still enforces all of it.
Two consequences follow from the copy being stale:

- The mirror holds **every** lock row, not a 90-day slice. They are a handful of
  rows and they span years.
- Near a boundary — within 24 h, or when the lock cache is older than the
  session — the local refusal is a **warning with an override**, not a wall. A
  1 January purchase mis-dated 31 December must not be unfixable at the till.

**A period closed while the phone was offline is a decision, not an error.**
`close_period` reads the same unsynced-writes signal `computations.md` §9
defines, and refuses — or requires explicit acknowledgement — while any device
reports outstanding writes in the range. Otherwise the lock claims completeness
it cannot have. When a drain does hit a closed period, the row lands in a
server-side quarantine and the user chooses: reopen and amend, or record at
today's date with an audited note. The date is never silently mutated (§7.0a).

#### The accounting date, and the timezone that lags the border

§7.0a resolves the date once at capture, from the zone you were standing in, and
makes it immutable. The hole is that the device's timezone is not that zone: land
in Tbilisi at 01:00 after four hours in airplane mode and the phone still says
Warsaw, where it is 23:00 the previous day. Every capture in that window is dated
**yesterday**, permanently. Across a New Year's Eve flight that is a revenue row
in the wrong tax year — precisely what §7.0a exists to prevent.

So: the entry records `capturedTz`, `capturedOffsetMinutes` and `capturedAtUtc`;
the resolved date is an **editable field on the capture sheet**; and a drain
flags any entry whose timezone differs from its predecessor — *"you changed
timezone — check these 4 dates."*

#### Capture with no model — two tiers, not three

| Tier | Needs | Gives you |
|---|---|---|
| **1 · Deterministic grammar + on-device memory** | nothing | Amount, account, payee, and a category proposed by fuzzy nearest-neighbour over your own payee history, with an alias table (Polish for imports, a small legacy Cyrillic set). **Always available** |
| **2 · Cloud model** | a network | The conversational loop, receipt extraction, and the classifier that reads bank Polish |

**The on-device generative model tier was assessed and dropped.** Four reasons,
in descending force:

1. **It has no input.** S05 *mobile* has a keypad, voice, camera and the
   conversational mode — and **no text field**. The grammar that produces a payee
   string is the *web* command bar, which reaches the Pi over Tailscale; "offline"
   there means no server at all. Building tier 2 would first require designing a
   text-entry mode that does not exist.
2. ~~**Apple's on-device model does not support Polish or Russian.**~~ **This
   argument has mostly fallen away.** It was made on the assumption of a
   trilingual capture path; capture is in fact overwhelmingly **English**, which
   Apple's model does support. Russian is a legacy tail, not current input.
   What survives is narrow: a Russian or Polish capture would throw
   `unsupportedLanguageOrLocale` rather than degrade, so the tier would need a
   fallback for the case it was supposed to handle. That is a wrinkle, not a
   blocker — arguments 1, 3 and 4 are what carry the decision.
3. **The neighbours are the classifier.** `computations.md` §14 already defines
   confidence as *agreement among the k retrieved neighbours*, with the model's
   own figure a tiebreak. Trigram similarity is language-agnostic by
   construction — which is exactly why §13 chose `pg_trgm` over `tsvector` — and
   that property is as valuable on the phone as on the Pi.
4. **It converts a visible gap into a silent error.** A blank category self-heals
   through the reconnect offer. A wrongly-filled one does not, because
   re-processing is never automatic (§11.2). That is §11.4's rule — quality
   matters inversely to how much review the output gets — applied to the weakest
   model in the system on the path with the least review.

The addressable slice is roughly 16–70 captures a year, and the saving is at most
one tap — against S06's finding that a machine-filled chip must be *read*, while
a stable position is hit from muscle memory.

**Tier 1.5 replaces it, with no model:** exact normalised payee → last confirmed
category; else trigram nearest-neighbour over distinct payees with the modal
category and neighbour-agreement confidence, computed exactly as §14 defines it;
plus a hand-written alias table. This is a genuine improvement over
the bare grammar and it ships no weights.

**The redirect worth taking: on-device speech recognition** — and the English
finding makes it substantially more promising. S08 states that transcription
requires the network. iOS has had on-device recognition for years
(`SFSpeechRecognizer.supportsOnDeviceRecognition`, now `SpeechAnalyzer`), and
**English is the best-supported locale on every platform.** Since capture is
overwhelmingly English, the case that used to need three languages to work now
needs one.

If `en-*` is covered on-device — and it almost certainly is — offline **voice**
capture is available. That delivers far more than a classifier could, ships no
model, and gives the phone the text input tier 2 lacked. `pl-PL` and `ru-RU` are
then a bonus rather than a prerequisite. It is a one-line runtime check and it
should be run before anything else in this area.

#### Reconnecting

Two different things happen, and they deserve opposite treatment.

**The drain is automatic and is never asked about.** Losing a capture is the
worst outcome in the system; entries are idempotent; requiring a tap to save data
you already entered would eventually cost you data. A prompt reading *"you're
back online — sync?"* either asks permission for something already done, or gates
the drain and lets a dismissed modal strand real financial data. There is no
coherent third reading, so there is no prompt.

What appears instead is a **result**: a passive line on the sync control, and a
toast — `12 saved · 14:22`, or `11 saved · 1 blocked  [Show]`.

**Re-processing degraded work is offered and never automatic**, because rewriting
rows you already accepted on a model's authority is what §11.2 forbids. The offer
is a **view, not a notification**: a card that persists while its count is
non-zero, routing to the transactions list pre-filtered to *Needs attention* —
category is `Uncategorized`, a receipt is attached but unextracted, or a rate is
still estimated. Dismiss collapses it for the session, not forever.

That filter is also the durable marker the earlier design lacked. Without it, a
row the grammar guessed at becomes visually identical to one you typed the moment
the pending dot clears, and the quality debt is invisible three weeks later.

| Automatic, never asked | Offered, never automatic | Asked because it needs credentials |
|---|---|---|
| Outbox drain | Re-processing tier-1 captures | Re-authentication (401) |
| Rate refresh, replica refresh | Re-rating estimated rows | TOTP step-up |
| | Duplicate resolution (H14) | |
| | Counterparty merge candidates (H13) | |

#### Freshness is shown on figures, not as a mode

There is no global "offline mode" banner. Three parts of this specification
already reject one: `design-system/08` §8.3 — *"Offline is a statement about
freshness, not a failure… `Showing data as of 14:06` beats `Offline`"* — J02's
success measure of *"the same flow, same timing, no degraded mode"*, and this
section's own argument that a banner which cries wolf gets dismissed.

Only one capability genuinely disappears, and it says so itself: the agent tab
and S05's `💬` mode render **disabled, with the reason inline on tap**. One
disabled surface is not a mode.

What is persistent is a neutral counter in the shell header — `12 pending` — and
freshness stamps on the figures themselves, whose granularity follows age:

| Age | Rendered |
|---|---|
| < 12 h | `1 240,50 zł · includes 3 unsynced · as of 14:20` |
| < 48 h | `… as of yesterday 14:20` |
| > 48 h | `… as of Tue 11 Aug`, stamp amber, labelled `unverified` |

A bare clock time is unreadable the next morning: at 09:00, `as of 14:20` reads
as *this afternoon*. And `3 pending` beside a figure invites reading them as
excluded, when the fold includes them — hence `includes 3 unsynced`.

**What is never shown is a bare "Offline".** The connectivity state machine
(`architecture/09-connectivity.md`) distinguishes a dozen conditions with
different remedies — Tailscale not running, node key expired, another VPN holding
iOS's single tunnel slot, the Pi not answering, Postgres down, session expired —
and each names its own. *"Your Tailscale key expired on 3 Aug — reconnect in the
Tailscale app"* is actionable. *"Offline"* is not, and for that failure it is
also wrong.

#### Sync state

| State | Behaviour |
|---|---|
| Reachable | Direct tRPC; optimistic updates; FX and replica refresh on foreground |
| Unreachable | Reads from the replica; writes to the outbox; captures continue unchanged |
| Reconnect | Outbox drains automatically, in `seq` order; **server is authoritative** |
| Conflict | Resolved by **version, not clock** — the write carries the `version` it last read, a `bigint` the database advances rather than a timestamp anything may rank, audited. A same-field divergence follows the conflict setting (latest-applied-wins or ask); the tax-sensitive set always asks (§14.2). One person, two devices |
| **Drain trigger** | Foreground, in-foreground network change, user tap, silent push. **Never while locked** — see §5.7 |

**"Single writer" is not true, and the design does not lean on it.** The phone
and the laptop both write. Conflicts are resolved by comparing the version each
write last read, never "whichever landed last" — `architecture/14-local-first.md`
§14.2 states why: a phone offline for days can otherwise land an older edit
over a newer correction, wearing an honest-looking timestamp. That is not a
substitute for low conflict probability; it is what makes relying on low
conflict probability safe. One *person* still means conflicting intent is
vanishingly rare, and capture-only narrows it further: a genuine conflict needs
the same row edited on two devices inside one sync window.

The web client is nonetheless the writer that makes the *largest* changes —
import, bulk review, rerating, period close — so a checkpoint is marked
**superseded**, not merely aged, when one of those has landed since it was
issued.

The transport mechanics — response authentication, the idempotency ledger,
ordering, entry states and the status-code table — are
`architecture/08-offline-and-concurrency.md`. Connectivity detection is
`architecture/09-connectivity.md`.

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

**A rule posts each occurrence at most once.** The posted row carries
`recurring_id` and the `occurrence_date` it satisfies, under a unique index
(§6.5), so a second attempt at an occurrence already materialized is rejected by
the database rather than avoided by a scheduler that has to remember what it
did. An occurrence you deliberately skip is simply a date with no row, and the
calendar renders it as still-projected.

**That index does not catch the case you actually hit.** A rent row you typed by
hand has `recurring_id = NULL`, so the index predicate excludes it — it is not
in the index at all. Nothing about it collides with the rule's own row. The
guarantee is *this rule fires once per occurrence*, which is a scheduler
property; it is not *this rent is in the ledger once*, which is the property
that matters to you and the one an earlier draft of this section claimed.

The claim-or-post decision is therefore a match, not a constraint, and it is
why materialization is manual (`computations.md` §11). Before offering an
occurrence, the system looks for an unlinked row within ±3 days carrying the
same account and a within-3% amount — the duplicate rule of `computations.md`
§9 — and if one exists the card offers **Link** rather than **Post**. Linking
stamps `recurring_id` and `occurrence_date` onto the row you already entered,
which both satisfies the occurrence and puts the row into the index, so the
question cannot be asked twice. A rule that could post silently would have to
resolve this ambiguity without you, and it has no basis on which to.

**Amounts follow the FX rules.** A day containing foreign transactions shows
its net in the current display currency, and opening the day reveals each entry with its
own `local · rate · display` (§7).

### 14.4a Subscriptions

One page (S34) answering *"what am I actually paying for?"* — every paid
service with its brand icon, cost normalized to per-month, next charge, and
price-rise detection.

**A subscription is a recurring rule, not a new entity.** Migration `0010` adds
two independent columns to `recurring_transactions`:

| Column | Meaning |
|---|---|
| `is_subscription boolean not null default false` | Puts the rule on S34 and into the ≈ totals |
| `service text` (nullable, free text) | Slug into the bundled catalog → brand icon. Legal on any rule — a utility may carry an icon without being a subscription. Free text deliberately: the catalog is versioned code, and a `CHECK` against it would turn adding a service into a migration |

Everything else is S21's machinery unchanged: pause is `disable_recurring`, a
price rise is the existing `amount drifted` health state surfacing beside the
figure you pay, and the editor is the same rule editor — one entity, two views,
no second write path.

**Icons ship in the bundle, never from a logo CDN.** The catalog lives in
`packages/core`: `slug → name, simple-icons slug, matching aliases`. A logo API
(Clearbit, logo.dev) would broadcast the subscription list to a third party on
every render — precisely the leak this system exists to avoid — and would break
offline rendering, which S34 otherwise has for free since rules and catalog are
both in the replica (`computations.md` §16 is class **R**). Unknown or missing
slug → deterministic monogram avatar; never blank, never a fetch, never an
error. Matching against payee/counterparty **proposes** — never sets — the
service and flag, the same consent model as amount drift.

### 14.5 Dashboard layout

The dashboard is a **configurable grid of widgets**, not a fixed page.

```
dashboard_layouts   id, name, is_active, is_preset, sort
dashboard_widgets   id, layout_id →dashboard_layouts, kind, slot, size, config, sort
```

**Layouts are rows, not constants.** Presets ship as seeded `is_preset` rows, so
switching between them preserves each one's per-widget configuration instead of
overwriting a single stored grid. It also makes *"put family spending on my
dashboard"* an ordinary audited write through the operation registry (§11.0)
rather than a special case the agent cannot reach.

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
| `system_health` | S | — · backup age, FX coverage, reachability (S30) |
| `revenue_ytd` | M | Period · reads `tax_ledger` |
| `completeness` | M | Missing NIP, KSeF id, uncategorized, estimated rates |
| `tax_period_status` | S | Scheme in force, open or closed |
| `targets` | S · M | Which targets shown, period. §14.7 promised *"one widget, one settings row"* and the catalogue had neither |
| `subscriptions` | S · M | Monthly ≈ total; M adds the next three charges with icons (§14.4a). Tap-through to S34 |

**Four presets ship** (S24), each answering one question rather than serving one
mood: **Standing** (where do I stand), **Flowing** (where is it going),
**Owing** (who owes whom), **Business** (what is reportable). The last earns
little daily space and is included anyway — it is the highest-stakes journey with
the longest gap between uses, which is the combination that leaves you
re-learning it every April.

**The first dashboard release ships preset layouts** — three or four
arrangements you pick between. Free drag-and-drop placement is added only if the
presets prove insufficient. A layout engine is a lot of work to build before
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
| Latency | **Full budget table: `docs/specification/architecture/06-quality-attributes.md`.** Headlines: a simple ledger query < 100 ms; an *aggregate* < 200 ms warm and < 400 ms cold, since grouping over 25k rows is a different class of work and only stays fast because every index carries `WHERE deleted_at IS NULL`; receipt extraction 2–5 s (model-bound); agent turns 3–15 s; **voice capture end-to-end < 10 s (J02)** — the one budget where missing it changes behaviour rather than perception |
| Availability | Best-effort. It is one Pi in a flat; offline-capable mobile covers outages |
| Backups | §5.4. The quarterly restore drill is mandatory |
| Observability | Structured JSON logs, 30-day retention. Health endpoint. **Model spend tracked per assist**, not per feature — §11.4 configures a model per assist and may point them at different providers, so per-feature totals would not add up. No metrics stack: S30 is the operational surface, and it exists to make the four *silent* failures loud — stale backups, FX coverage, invariant results, spend |
| Testing | §15.1 — four layers, weighted by what actually goes wrong |
| Upgrades | `docker compose pull && up -d`. Drizzle migrations reviewed before applying — never auto-applied on boot |
| Hardware | **Raspberry Pi 4**, 4 GB+. Comfortable here — 8k rows is nothing, and receipt extraction is model-bound rather than CPU-bound |
| Storage | **SSD over USB3, not SD card.** SD cards fail under database write patterns and fail silently for a while first. On a Pi 4 this is the single highest-value hardware decision |
| Tuning | Postgres `shared_buffers` and `work_mem` sized for 4 GB shared with MinIO, the API and Caddy — defaults assume a bigger host |

### 15.1 Verification

This system's whole argument is that correctness is **structural** rather than
remembered — a role that cannot see personal rows, an index that cannot hold two
rents, a component that cannot render a converted amount without its rate. That
argument is only as good as the evidence that the structures hold.

Four layers, weighted by what actually goes wrong in a ledger.

#### 1 · Continuous invariants — the most valuable layer

A ledger's characteristic failure is not a crash. It is a number that has been
quietly wrong for months. So the invariants are checked **against the live
database on a schedule**, not only against fixtures in CI, and the result is
reported on S30 beside the backup status.

| Invariant | Violation means |
|---|---|
| `amount_pivot = amount_original × fx_rate` | Free — it is a generated column (§7.4). Listed so its absence from the failure list is deliberate |
| Every account: `opening_balance + Σ signed legs` equals its stored balance | The balance query and the write path disagree |
| Every transfer has `to_currency` and `to_fx_rate` | A destination leg that cannot be valued (§6.5) |
| Every transaction's currency equals its account's | The trigger was bypassed — by a migration, a bulk load, or a dropped constraint |
| Every `category_id` points at a leaf | `TAXONOMY.md` R1 broken (§6.5) |
| `pg_get_viewdef('tax_ledger')` still filters `is_business`, `deleted_at` **and** `ownership` | The view was redefined or dropped and recreated — the only way its own `WHERE` stops being true |
| The export role gets `42501` probing `transactions` | The role is missing, the `REVOKE` was lost in a restore, or the connection is the superuser (§13.1) |
| `tax_ledger`'s count equals the same predicate evaluated against the base table | The two derivations disagree — a grant, a rewritten view, or a stale materialization |
| Zero income rows with an earnings category, in an `own` account, not marked business | **Under-declared revenue** — the ryczałt failure mode, and the one nothing else in the system looks for (C5) |
| No `is_business` row sits in a `shared` account | §6.7 breached |
| Every clearing account trends toward zero | Not a defect — a **prompt** (§6.4). Reported as an amount and an age |
| `counterparty_balances` equals the negated sum of its `debt`-role rows | The derivation drifted from the definition (§6.6) |
| `debt_reassignment_effects` sums to zero per currency | A reassignment changed what is owed in total, which is the one thing it must not do (§6.6a) |
| No two rows share `(recurring_id, occurrence_date)` | Free — unique index (§6.5) |
| Every currency in active use has ≥95% rate coverage | The GEL condition (§7.7), which went unnoticed for months |
| `tax_residency` has no gaps across the ledger's date range | A transaction dated inside a gap has **no jurisdiction**, so every tax figure for that period is silently incomplete. Overlaps are refused outright by an `EXCLUDE` constraint; gaps are legitimate and therefore reported (§13.6, `0009`) |
| No foreign-currency business row lacks a stamped `tax_fx_rate` | It cannot be filed (§13.6). Reported, never refused — the preceding working day's rate may not exist yet when you record the invoice |

The first four replace a single earlier line — *"`tax_ledger` contains zero rows
with `is_business = false`"* — which was **unfalsifiable**. It restated the
view's own `WHERE` clause, so it returned true whether or not the view existed
as specified, whether or not the role existed, and whether or not something held
`SELECT` on the base table. It could not detect any way T1 actually fails. The
replacements are `verify_t1()` and `verify_no_omitted_revenue()` in `0005`, and
each can return false.

Note the direction of the fourth. Every other mechanism in §13.1 stops a
personal row from *entering* a tax output. Under ryczałt only revenue is
reportable, so the material failure is the opposite one: a revenue row never
marked business and therefore silently **absent**. `is_business` defaults false
and the migration sets it nowhere, which makes this the likely state on day one
rather than an unlucky one — and it is the direction a tax authority penalises.

**A violation is a defect report, not an exception.** Each writes an
`audit_log` entry with `actor = 'system'` and surfaces on S30; none of them
block a write, because a check that can halt the ledger is a new failure mode.

#### 2 · Property tests on money

Money arithmetic is where a bug is both easy to write and invisible. These are
properties, not examples — generated inputs across all seven currencies:

- Signing is an involution: `signed(tx, from)` and `signed(tx, to)` sum to the
  spread on a cross-currency transfer, and to zero on a same-currency one.
- `debtDelta(tx, side)` is exactly `−signed(tx, side)` for all four debt cases
  (§6.6) — **on both sides**, since a repayment arrives as a transfer whose
  counterparty sits on the `to` leg and defaulting to `from` inverts it.
- Round-tripping a decimal string through storage and back is lossless at
  scale 8.
- Conversion at a row's own date is order-independent: summing then converting
  a same-currency set equals converting then summing.
- An allocation always sums to its total, including the remainder line (S07).
- No arithmetic path produces a JS `number`. This is checkable statically and
  worth doing so — `0.1 + 0.2` is the failure the whole representation exists
  to prevent (§7.1).

#### 3 · Fixtures — parsers, extraction, classification

| Suite | Shape | Passing means |
|---|---|---|
| Parsers | Real statement files per institution, redacted, with expected `RawRow[]` | A format change is caught on the file rather than in the queue |
| Receipt extraction | ~50 photographs with hand-checked expected fields | A model or prompt swap is scored, not guessed at |
| Classification | ~300 rows with known-good categories | Same, and it is why §11.4 keeps this tier deterministic — a pipeline is scoreable, a loop is not |

**The extraction and classification suites are what make §11.4's model choice a
measurement instead of an opinion.** Swap Luna for Gemini Flash, run 300 rows,
read the number. Without them, "which model" is unanswerable and every future
provider change is a leap.

#### 4 · Contract tests on the registry

Every operation in `operations.md` is checked for: input schema rejects
malformed input; the write flag matches whether it mutates; an `audit_log` entry
appears with the right actor; a read is genuinely side-effect free.

The one that matters most: **for every non-agent surface, assert that no write
operation was generated at all.** That is the boundary §11.4 rests on, and it is
exactly the kind of thing a refactor removes without noticing.

#### What is deliberately not tested

No end-to-end UI suite. Single user, one deployment, and the cost of maintaining
one exceeds what it would catch here — the failure modes this system has are in
arithmetic and in state, and layers 1–3 address both more directly. If that
proves wrong, the evidence will be a defect that reached the ledger through a
path all four layers were blind to, and that defect is the argument for adding
the fifth.

---

## 17. Open decisions

Ordered by how much they block.

| # | Question | Blocks | Default if unanswered |
|---|---|---|---|
| ~~**O1**~~ | ~~Tax form?~~ | — | **Answered: ryczałt.** Revenue-only *ewidencja przychodów*, no cost side, outside JPK_PKPiR entirely. `PL_RYCZALT` is the first adapter built; `PL_KPIR` is defined but unimplemented. See §13.6 |
| ~~**O2**~~ | ~~VAT registered?~~ | — | **Answered: not registered.** Opting in later must not require a migration, so `counterparty_tax_id`, `document_ref` and `ksef_id` exist as optional fields from day one — but **no JPK_V7 handling is built**. Electronic KPiR therefore binds from 2027-01-01, not 2026-01-01 |
| **O3** | Does dedicated filing software already exist in your workflow? | §13.3 handoff | Assume yes; build export, not integration. Lower stakes under ryczałt — the record is a revenue register, not a book |
| ~~**O4**~~ | ~~BYN and GEL historical FX?~~ | — | **Verified available.** NBP, NBRB and NBG all serve 2020-11-25 and all quote **directly against USD** — no triangulation for primary pairs, no snapshot fallback. Endpoints in §7.7 |
| ~~**O5**~~ | ~~RUB post-2022 accuracy?~~ | — | **Decided: set it by hand.** ECB delisted RUB in March 2022, so the range is covered by a **manual override over a date range** (§7.6), entered once and outranking every synced source. No extractor, no snapshot import — the figure is asserted by you and labelled as such. Rows falling outside any override carry `fx_rate_estimated` |
| ~~**O6**~~ | ~~`CARD-C` statement format?~~ | — | **Answered: the account is dormant.** Historical rows migrate; nothing new arrives, so no parser exists for this source |
| ~~**O7**~~ | ~~Budgets?~~ | — | **Answered: targets, not budgets.** A monthly spend target shown as progress against actual — no per-category envelopes, no rollover. See §14.7. The 13 Money Manager budgets are preserved in the migration dump but not imported |
| ~~**O8**~~ | ~~Off-site backup target?~~ | — | **Answered: Backblaze B2**, age-encrypted before upload so the provider holds ciphertext only. S3-compatible, so MinIO points at it by configuration |
| ~~**O9**~~ | ~~Pi model?~~ | — | **Answered: Pi 4.** Ample for the workload — 8k rows is nothing. **Boot from SSD over USB3, not SD**; see §15 |
| ~~**O10**~~ | ~~Are US and German obligations live?~~ | — | **Answered: all three eventually, none urgent.** Build the full adapter layer and **all three scheme definitions** (`PL_KPIR`, `PL_RYCZALT`, `US_SCHED_C`, `DE_EUER`) now while the design is fresh; implement adapters on demand. Poland first |
| **O11** | ~~Residency periods~~, and any treaty / foreign-tax-credit interaction | §13.2 | **Split.** *Residency periods:* **answered — build now.** A dated timeline on S22; scheme resolution becomes *(jurisdiction resident in, transaction date)*, which removes a restructure later since every lookup would otherwise change shape. *Treaties and foreign tax credits:* **still deferred**, and S22 states so rather than letting a residency control imply them |
| **O17** | **Does financial data leave through an aggregator?** Routing through OpenRouter means receipt images and transaction descriptions transit a third party *in addition to* the model provider | §5.5, §11.4 | Undecided, and it is a §5 question rather than a §11 one. The project opens with physical custody; receipt images are age-encrypted before Backblaze so a storage provider holds ciphertext only. A router sees them in plaintext. Options: direct provider APIs only · router for text surfaces, direct for images · accept it deliberately. **Not to be inherited from a convenience** |
| ~~**O12**~~ | ~~Business backfill scope?~~ | — | **Answered: 2026 forward only.** Earlier rows stay personal unless explicitly marked. Nothing becomes reportable by omission, and it matches when the current rules took effect |
| ~~**O13**~~ | ~~"Synced with banks"?~~ | — | **Decided:** central-bank reference rates, quoted against the USD pivot. Realized rates are implied by the two amounts on a transfer or settlement, never fetched |
| ~~**O14**~~ | ~~Counterparties replace the loan accounts?~~ | — | **Decided: replace.** They exist only because Money Manager had no counterparty concept. `loan_receivable` / `loan_payable` survive as `account_kind` values for migration fidelity |
| ~~**O15**~~ | ~~Ageing on counterparty balances?~~ | — | **Decided: companies only.** Putting a 60-days-overdue badge on a friend's share of dinner is absurd; on an unpaid invoice it is the point |
| ~~**O16**~~ | ~~Dashboard layout?~~ | — | **Decided: presets first.** A layout engine is a lot of work to build before knowing which arrangements are wanted; presets answer that cheaply. Free placement only if they prove insufficient |
| **O18** | **Does the Android build encrypt its database?** Android has no lock-time key eviction (§5.7), so SQLCipher is the only mechanism that makes a locked Android device unreadable — and it has no bearing on iOS, where class A already does it | §5.7, the Android build | Undecided, and it must be answered before the Android build ships rather than after: keying an existing database is a rewrite of it. **For:** it is the only control that survives a locked stolen phone on that platform. **Against:** the passphrase lives in JS memory via `PRAGMA key`, the Keystore wrap needs a local Kotlin module, ~30% on writes, and a generated native project. Answering *yes* also forecloses the opportunistic background drain, which nothing may depend on anyway |

---

## 18. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Migration balances do not reconcile | Medium | Critical | Migration stops until the mismatch is understood |
| R2 | Unmatched transfer legs (OUT 1,734 ≠ IN 1,754) | **High** | Medium | Explicit exception list; manual resolution before cutover |
| R3 | ~~Historical FX unavailable for BYN/GEL~~ → **GEL backfill blocked by NBG rate-limiting** | **Materialized** | Medium | BYN came back 100% complete; GEL holds 11 of 2,080 days (§7.7). Needs a paced re-run, not a retry. Until then GEL rows carry `fx_rate_estimated` against a 2020 rate — visible, but not good enough to build on |
| R4 | Scope creep into full tax compliance | **High** | High | §13 boundary is explicit; N1–N3 are non-goals |
| R5 | RN Web insufficient for the dashboard | Medium | Low | §14.6 escape hatch designed in |
| R6 | Pi SD card failure | **High** over years | High | SSD boot; nightly off-site backups; tested restore |
| ~~R7~~ | ~~Model spend higher than expected~~ | — | — | **Retired.** Measured at real volume, total annual spend is $0.50–$25 depending on tier, and under $250 at 10× usage on the most expensive option (§11.4). Cost was never the constraint; latency and routing are |
| **R13** | Financial data exposed to an aggregator | Medium | **High** | O17 — undecided. A router sees receipt images and transaction descriptions in plaintext, against a project premise of physical custody (§5.5) |
| R8 | Project stalls half-migrated, data split across two systems | Medium | **High** | Money Manager stays authoritative and repeated imports are idempotent until the explicit cutover in J15 |
| R9 | Agent writes bad data | Low | High | Approval gates on every write; full audit; soft delete |
| R10 | A personal expense reaches a tax output | Low | **Critical** | §13.1 — separate DB role with no privilege on `transactions`; fails loudly rather than quietly |
| R11 | `is_business` misclassification on 5 years of history | Medium | Medium | O12 — default personal, classify forward only; bulk reclassification is an audited, approved operation |
| R12 | Multi-jurisdiction generality never used, cost paid anyway | Medium | Low | Only the schema is built now (§13.2); US and DE adapters wait on O10 |

R8 is the one to watch. The failure mode for personal projects is not building
the wrong thing — it is abandoning it halfway with data in two places.

---

## Appendix A — Money Manager data inventory

From `exports/<backup>.mmbak`, 4.0 MB, SQLite (Core Data).

**Volume**

| Metric | Value |
|---|---|
| Transactions | 7,874 total · 7,621 active · 253 deleted |
| Date range | 2020-11-25 → 2026-03-28 |
| By year | 2020: 57 · 2021: 1,051 · 2022: 1,397 · 2023: 1,313 · 2024: 2,133 · 2025: 1,855 · 2026: 68 |
| By type *(all rows, deleted included)* | income 506 · expense 3,878 · transfer-out 1,734 · transfer-in 1,754 · adjustment 2 |
| By type *(active only)* | income 498 · expense 3,763 — the basis `TAXONOMY.md` measures against |
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
