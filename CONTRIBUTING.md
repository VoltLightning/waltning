# Contributing

## The honest part, first

**This repository is under active construction and is going to change shape
underneath you.** The specification is being implemented, which means files get
rewritten, directories move, and decisions recorded three months ago get
overturned by a review that found them wrong. Three claims in the offline design
were reversed in a single pass. The defect register has eighty-three findings,
and the ones that closed did so by changing the design rather than by patching
around it.

So I am not looking for contributions, and I would rather say that plainly than
let you find out by having a pull request sit against a file that no longer
exists. It is a personal finance system for one person's ledger, built in the
open because the reasoning is worth reading, not because it needs a team.

**That said — if you want to contribute, you are genuinely welcome.** Not
grudgingly. The invitation is real; the warning is just about timing and about
not wasting your evening.

The one thing I would ask: **open an issue before you build anything.** Not for
permission — to find out whether the thing you are about to touch is scheduled
to be rewritten next week. That conversation costs you five minutes and can save
you a weekend.

## What is actually useful

Roughly in order:

**Specification defects.** This repository is mostly specification, and the
defect register's central finding was that *asserting a guarantee is not
enforcing it*. If you find another sentence containing *structurally*,
*impossible*, *cannot* or *guaranteed* with nothing underneath it, that is the
most valuable thing you can send. It needs no code and it does not go stale.

**Correctness bugs in what exists.** The migrations, `money.ts`, the FX
backfill, the Money Manager import. This is where being wrong is expensive and
where a second pair of eyes genuinely helps — a 10× error in a worked example
survived several readings before someone did the arithmetic.

**Anything that makes a failure louder.** A check that turns a silent wrong
answer into a crash is worth more here than a feature.

## What is unlikely to land

Not because it is bad work — because of where the project is.

- **New features.** The roadmap is `SPEC.md`, and it is already longer than the
  time available.
- **Restructuring, renaming, or moving files.** These collide with in-flight
  work almost by definition.
- **Formatting and style changes.** Biome decides this, the pre-commit hook
  enforces it, and there is nothing left to discuss.
- **Adding dependencies.** Every layer of the stack has a recorded reason in
  `SPEC.md` §4.3, including the ones deliberately refused. A new dependency
  needs to beat that bar, and "it is popular" does not.

## Setting up

Node 22 or newer, pnpm 10 or newer, and Docker for Postgres.

```sh
pnpm install                 # also installs the git hooks, via `prepare`
cp .env.example .env         # then fill it in — see the note below
pnpm db:up                   # postgres:16 on 127.0.0.1, loopback only
pnpm db:migrate              # ten migrations, in order
pnpm db:seed                 # currencies and the category tree
pnpm verify                  # biome + typecheck, about two seconds
```

**There are three database URLs and that is not an accident.**
`MIGRATE_DATABASE_URL` is the bootstrap superuser and is correct only for
migrations, because `0005` creates a role and issues grants. `APP_DATABASE_URL`
is `waltning_app`, which is what everything else uses. `EXPORT_DATABASE_URL` is
the tax export role, which can read one view and nothing else. Pointing all
three at the superuser makes every command work and quietly destroys the
guarantee in §13.1 — a superuser bypasses every `GRANT`, so the revokes stop
meaning anything while nothing appears to be wrong. Note that `waltning_app` and
`waltning_export` only exist after `0005` has run.

**Do not run `pnpm db:generate`.** The snapshots in `drizzle/meta` stop at
`0001` while the migrations run to `0009`, so it would emit a migration
re-creating everything already built. The journal is the source of truth. There
is a longer note in `docs/specification/architecture/05-deployment.md`.

## The rules that are not negotiable

**No financial data, ever.** This is a public repository about a personal
ledger. Amounts, payees, counterparties, account numbers, statements, database
dumps and backups do not belong in it. `.gitignore` covers the file types and
the pre-commit hook refuses them even when force-added, but neither can catch a
real payee typed into a markdown example.

**Institutions and people are placeholders.** `Bank A · PLN`, `Clearing · PLN`,
invented first names. Examples keep the *shape* of a real ledger — a debt
reassigned between three people, a bank description in another language, a
clearing account that never quite settles — because the design reasoning only
holds if they are realistic. The identities in them are not real, and anything
you add should follow the same rule. Structural facts are real and stay real:
row counts, the currency list, the tax scheme.

**Do not use `--no-verify`.** There is no CI here — that is a recorded decision,
not an oversight — which makes the pre-commit hook the only automated thing
between an edit and history. It runs in under two seconds precisely so that
skipping it is never worth it. If it blocks you wrongly, that is a bug in the
hook and worth an issue.

You will see it print `no .githooks/private-terms.txt — personal-data sweep
skipped`. That is expected. The list holds the real names the public
specification replaced with placeholders, so it cannot live in the repository —
it *is* the private data. Nothing is wrong on your machine.

## Commit messages

This repository writes real commit bodies: what changed, and **why**, including
what was rejected and what it cost. Not a convention imported from elsewhere —
it is the same reason the specification records reasoning rather than only
decisions. Six months later the *why* is the part that is hard to reconstruct
and the part that stops someone re-litigating a settled question.

A one-line message for a one-line change is fine. A one-line message for a
design decision is not.

## Pull requests

Run `pnpm verify` before you push. Say which issue it came from, and what you
considered and rejected — that section gets read closely.

Reviews may be slow. It is one person, and the specification is the priority.

## License

Apache 2.0. Contributions are accepted under the same license, and you keep your
copyright — there is no CLA and there will not be one.
