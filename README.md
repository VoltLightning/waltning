# Waltning

Self-hosted personal finance system — React Native app, web dashboard, receipt
scanner, and an LLM agent over your own Postgres ledger.

Replaces [RealByte Money Manager](https://www.realbyteapps.com/) and the
`mm-tools` Python pipeline in `<path-to-mm-tools>`.

See **[SPEC.md](SPEC.md)** for the architecture, data model, and build phases.

## Status

Pre-implementation. Spec written; Phase 0 (schema + migration) not started.

## Stack

TypeScript throughout — Hono + Drizzle + Postgres 16 on the server, tRPC for the
API layer, Expo for mobile, Vite + React for the web dashboard. Deployed via
Docker Compose behind Tailscale. Agent and receipt extraction run on
`claude-opus-5`.

## Data handling

This repository contains no financial data. Ledger contents, receipt images,
database dumps, and `.mmbak` backups are excluded by `.gitignore` and must stay
out of version control.
