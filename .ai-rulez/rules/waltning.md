---
priority: critical
---

# Waltning

Spec-first. Implement from: `docs/specification/operations.md` (the registry —
every write in the system), `computations.md` (every derived figure, classed
F/R/S for offline), `screens/` + `flows/` (behavior), `architecture/01–09`
(containers, offline/sync, connectivity), `SPEC.md` (data model, FX, security,
tax — with the reasoning). When code must diverge from spec, change the spec in
the same PR — never silently.

Conventions that hold everywhere:

- Money is `numeric(20,8)` **strings** end to end; arithmetic only via
  `money.ts` (decimal.js). A JS number holding an amount is a bug.
- Accounting dates are bare `YYYY-MM-DD` strings. No `Date` arithmetic, no
  timezone conversion on them; `capturedTz` is a separate field.
- Every write is a registry operation: named, Zod-validated, audited,
  `offlineEligible` declared. No ad-hoc mutations from screens or the agent.
- Guarantees are enforced in Postgres — CHECK, trigger, role grant — not only
  in app code. New guarantee → new constraint, and break it once to prove it
  fires.
- Database tests run against real Postgres (`pnpm db:up`), never mocks.
- Gate: `pnpm verify` (~2s) before work is done. Never `--no-verify`; there is
  no CI, the hook is it.

Traps:

- Three DB URLs: `MIGRATE_` (superuser — migrations only), `APP_` (everything
  else), `EXPORT_` (tax view only). A privilege error usually means the design
  is working; switching to a stronger URL silently voids the tax guarantee.
- Never `pnpm db:generate` — drizzle snapshots stop at `0001`, migrations are
  hand-written through `0009`, the journal is the source of truth.
- Public repo, private ledger: placeholders only (`Bank A · PLN`, invented
  names) — in code, examples, commits, and logs.
