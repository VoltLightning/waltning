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
- **Type parameters before `unknown`, `any`, `never`.** `any` and `!` (non-null
  assertion) are lint errors and fail the gate.
  `unknown`/`never` as placeholders are a design smell — they push a cast to
  every call site and discard the type the caller had. Make it generic instead.
  Narrow legitimate uses, each worth a comment: `catch` bindings (the language
  gives no choice), JSON off the wire, `unknown` in a *constraint* position for
  a deliberately heterogeneous collection, `never` for exhaustiveness.
- **A loose type at a seam is where contracts leak.** Concrete declarations are
  usually fine; the generic collection that holds them is where `unknown`
  creeps in and validation gets skippable. Pin those with compile-time
  assertions (`contract.types.ts`) and break them once to prove they fail.
- Gate: `pnpm verify` before work is done. Never `--no-verify`; there is no CI,
  the hook is it.

Traps:

- Three DB URLs: `MIGRATE_` (superuser — migrations only), `APP_` (everything
  else), `EXPORT_` (tax view only). A privilege error usually means the design
  is working; switching to a stronger URL silently voids the tax guarantee.
- Migrations are two files: `0000_schema.sql` (generated — change `schema.ts`,
  run `pnpm db:generate`) and `0001_database_objects.sql` (hand-written —
  triggers, views, roles, grants, the CHECKs Drizzle can't state). `pnpm
  db:reset` rebuilds from nothing.
- Public repo, private ledger: placeholders only (`Bank A · PLN`, invented
  names) — in code, examples, commits, and logs.
