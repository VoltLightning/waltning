---
priority: critical
---

# Non-negotiable

These are the things that are expensive or irreversible when they go wrong.

## Never put private data in this repository

Public repository, personal ledger. No real names, payees, counterparties,
account numbers, institution names, amounts, statements, dumps or backups — in
code, in documentation, in examples, in commit messages, or in a PR description.

Institutions and people are **placeholders**: `Bank A · PLN`, `Clearing · PLN`,
invented first names. Examples keep the *shape* of a real ledger because the
design reasoning depends on it, but the identities are invented. Structural
facts stay real: row counts, the currency list, the tax scheme.

The pre-commit hook sweeps for known terms, but it only knows the list it is
given. **It is a backstop, not the control.**

## Never bypass the gate

No `git commit --no-verify`. There is no CI here by decision, so that hook is
the only automated check between an edit and history, and it runs in under two
seconds precisely so skipping it is never worth it. If it blocks something
wrongly, fix the hook.

Run `pnpm verify` before proposing any change is finished.

## Never widen database privilege to make something work

Three URLs exist because the separation *is* the tax guarantee (§13.1).
`MIGRATE_DATABASE_URL` is the superuser and is correct only for migrations.
`APP_DATABASE_URL` is the app role. `EXPORT_DATABASE_URL` reads one view.

A superuser bypasses every `GRANT`, so pointing anything else at it makes every
query succeed and the guarantee unenforceable at the same time. If a connection
fails on privilege, that is usually the design working.

## Never run `pnpm db:generate`

Snapshots in `drizzle/meta` stop at `0001` while migrations run to `0009`, so it
would emit a migration re-creating everything already built. Migrations
`0002`–`0009` are hand-written and the journal is the source of truth.

## Do not add a dependency casually

Every layer in `SPEC.md` §4.3 has a recorded reason, including the ones
deliberately refused. A new dependency has to beat that bar, and popularity is
not an argument. Say what it replaces and what it costs.
