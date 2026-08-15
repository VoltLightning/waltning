---
priority: critical
---

# Waltning

Mostly specification, deliberately. Built so far: migrations, schema,
`money.ts`, seed, FX backfill, MM import. No API or app yet — tasks that sound
like app work usually mean changing the spec. Reasons for past decisions are in
`SPEC.md`; known problems in `docs/specification/defects.md`; build sequence in
`docs/specification/build-order.md`.

**Correctness**

- Money is decimal strings end to end (`numeric(20,8)`, decimal.js). Never JS
  numbers.
- Accounting dates are bare dates. No `Date` arithmetic on them.
- A claim like "cannot happen" needs an enforcing layer — constraint, trigger,
  role, type. Prose isn't enforcement. Verify by running, not reading; if you
  add a check, make it fail once on purpose.

**Traps**

- Three DB URLs. `MIGRATE_` (superuser) is for migrations only; app code uses
  `APP_`, tax export uses `EXPORT_`. Never fix a privilege error by using a more
  privileged URL — that silently voids the tax guarantee (§13.1).
- Never run `pnpm db:generate`: drizzle snapshots stop at `0001`, migrations at
  `0009`. Journal is truth; migrations are hand-written.
- Public repo, private ledger. No real names, payees, amounts, institutions —
  anywhere, including commit messages. Placeholders like `Bank A · PLN`.
- Never `git commit --no-verify`. `pnpm verify` (~2s) before saying work is
  done.
