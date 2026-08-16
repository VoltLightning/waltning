# Contributing

**This repo is actively being rewritten.** The spec is being implemented; files
move and decisions get reversed. I'm not soliciting contributions — a PR against
a file that's about to change wastes your time, not mine. If you want to
contribute anyway, you're welcome. **Open an issue first** so I can tell you
whether the area you're touching is about to move.

## Worth doing

- **Correctness bugs** — wrong money, wrong dates, wrong FX, silent failures.
- **Specification defects** — a claimed guarantee with nothing enforcing it.
  The register (`docs/specification/defects.md`) is full of these; find another.
- **Checks that make silent failures loud.**

## Unlikely to merge

- New features. The roadmap is `SPEC.md`.
- Refactors, renames, file moves — they collide with in-flight work.
- Style changes. Biome decides; there's nothing to discuss.
- New dependencies. Every layer in `SPEC.md` §4.3 has a recorded reason,
  including the refusals. Beat that bar or don't propose it.

## Setup

Node ≥22, pnpm ≥10, Docker.

```sh
pnpm install        # installs git hooks via `prepare`
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm verify         # biome + typecheck, ~2s — run before every push
pnpm test           # suite against a real Postgres; no database mocks
```

Three database URLs, on purpose: `MIGRATE_` is the superuser (migrations only —
`0005` creates roles), `APP_` is the app role, `EXPORT_` reads one view.
Pointing everything at the superuser makes every command work and silently
voids the tax guarantee (§13.1) — a superuser bypasses every `GRANT`. The app
roles exist only after `0005` runs.

`pnpm db:reset` rebuilds from nothing — drop, migrate, grant, seed. Change the
table layer in `schema.ts` and run `pnpm db:generate`; change a trigger, view,
role or grant by editing `0001_database_objects.sql` by hand.

## Hard rules

- **No real financial data, anywhere.** Not in code, docs, examples, commit
  messages, or issues. People and institutions are placeholders (`Bank A ·
  PLN`, invented first names). Amounts, payees, accounts: never.
- **Don't use `--no-verify`.** There is no CI; the pre-commit hook is the only
  gate, and it runs in ~2s. If it blocks you wrongly, that's a bug — file it.
  The `no private-terms.txt` notice on your machine is expected.

## PRs

`pnpm verify` passes, the template is filled in, and the **How** section says
what you considered and rejected. Reviews may be slow — it's one person.

Apache 2.0. No CLA. You keep your copyright.
