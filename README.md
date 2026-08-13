# Waltning

Self-hosted personal finance system — React Native app, web dashboard, receipt
scanner, statement import, and an LLM agent over a Postgres ledger you own.

Built to replace [RealByte Money Manager](https://www.realbyteapps.com/), which
has no API, no bulk editing, and limited export — and the file-based Python
pipeline that grew up around it.

## Documents

| | |
|---|---|
| **[SPEC.md](SPEC.md)** | Architecture, data model, FX semantics, security, migration, tax layer, phasing |
| **[docs/specification/](docs/specification/)** | The interface: principles, design system, 15 journeys, 29 screens |
| **[TAXONOMY.md](TAXONOMY.md)** | Proposed category tree, derived from five years of transaction data |

## Status

Specification, with the data foundation built.

**Done** — schema applied to Postgres and its invariants verified; taxonomy
seeded (57 leaves live, 59 in the seed pending a re-run); FX backfilled against
a USD pivot from 2020-11 — 8,803 rate-days, complete for PLN, EUR, GBP and BYN.

**Known gaps** — GEL holds 11 of 2,080 days (NBG rate-limits aggressively); RUB
stops at 2022-03-11, where ECB delisted it. The Money Manager import has been
written but not yet run, so there are no accounts or transactions.

**Next** — specifying the interface (`docs/specification/`), then the API and
the app. Specification comes first deliberately: the pass that produced this
spec found twenty defects in the model, and every one was cheaper to fix as
prose than as a migration.

## What makes it different

- **Multi-currency done properly.** Every transaction stores its local amount
  plus the FX rate *on its own date*, rather than one global rate applied
  retroactively across years of history.
- **Transfers are a single row**, not two rows that have to be re-paired.
- **Tax reporting is a pluggable adapter layer.** The ledger stays
  jurisdiction-neutral; Poland (KPiR), the US (Schedule C), and Germany
  (Anlage EÜR) are projections over it, versioned by effective date.
- **Personal expenses are structurally unreportable.** Tax adapters read a
  business-only view under a database role with no privilege on the underlying
  table, so a personal row reaching a tax output fails loudly rather than
  slipping through.
- **The agent gets typed tools, not SQL.** Reads run freely; every write
  renders a diff card that must be approved, and every tool call is audited.

## Stack

TypeScript throughout. Hono, tRPC, and Drizzle over PostgreSQL 16 on the
server; Expo for mobile, with the web dashboard built from the same codebase
via React Native Web. Deployed as Docker Compose on a Raspberry Pi, reachable
only over Tailscale — no public ingress. Receipt extraction and the agent run
on `claude-opus-5`.

## Data handling

This repository contains no financial data. Ledger contents, receipt images,
database dumps, and app backups are excluded by `.gitignore` and stay out of
version control.

Institutions and accounts are referred to by role (`BANK-A`, `Clearing · PLN`)
rather than by name throughout the specification.

## License

[Apache License 2.0](LICENSE) — © 2026 Vitaliy Pankov.
