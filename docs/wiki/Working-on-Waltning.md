# Working on Waltning

Actively developed and changing fast. Read
[CONTRIBUTING.md](https://github.com/VoltLightning/waltning/blob/main/CONTRIBUTING.md)
and open an issue before building anything — contributions are welcome but not
solicited, and an unannounced pull request is likely to collide with work in
flight.

## The gate

```sh
pnpm verify        # Biome + strict TypeScript + tests
```

**Never `--no-verify`.** There is no CI; the pre-commit hook is it. That is a
deliberate decision with a stated cost — see [[Decisions]] — and it only works
if the hook is treated as the CI it replaces.

Database tests need Postgres running (`pnpm db:up`). The hook does not skip them
when the database is unreachable, because a gate that disappears exactly when
someone is working in a hurry is worse than no gate.

## Building a feature

**schema + migration → registry operation → service → tRPC procedure → screen.**

Hard requirement, in that order. Never start at the screen; UI-only work is the
exception and starts where it says. The reasoning is in [[Architecture Map]].

Some rules that will fail your commit if you skip them:

- **Money is `numeric(20,8)` strings end to end**, arithmetic only via
  `money.ts`. A JavaScript number holding an amount is a bug.
- **Accounting dates are bare `YYYY-MM-DD` strings.** No `Date` arithmetic, no
  timezone conversion.
- **Every write is a registry operation** — named, validated, audited,
  `offlineEligible` declared. No ad-hoc mutations from screens or the agent.
- **`any` and `!` are lint errors.** Type parameters before `unknown`, `any` or
  `never`.
- **New guarantee → new database constraint**, and break it once to prove it
  fires.
- **No module imports another.** Compose at the registry or in routes.
- **Explicit `.ts` specifiers**, *except* files with platform variants, which
  must be extension-less.

## Migrations

Two files, and knowing which is which saves an hour:

| File | Nature |
|---|---|
| `0000_schema.sql` | **Generated.** Edit `schema.ts`, run `pnpm db:generate` |
| `0001_database_objects.sql` | **Hand-written.** Triggers, views, roles, grants, and the constraints Drizzle cannot state |

`pnpm db:reset` rebuilds from nothing. Nothing is permanent yet, so changing the
schema should never mean hesitating.

Never `drizzle-kit push` — it cannot see triggers, views, grants or generated
columns, which is to say it cannot see the guarantees.

## When code and spec disagree

**Change the specification in the same pull request. Never silently.** The
specification is the design record; code that quietly diverges turns it into
fiction, and the next person — including you in six months — will trust it.

## Reviewing

The project's review posture is adversarial by default: *"looks good" is a
non-result.* The attack order is ranked by where this project has actually been
wrong, and the first item is the one that keeps paying — grep for
*structurally*, *impossible*, *cannot*, *guaranteed*, *never*, *always*, and for
each one ask which layer enforces it. "The prose says so" is a finding. That
single check accounted for 28 of the register's critical defects.

The fourth item is worth internalising too: **failure that looks like health.** A
clearing account at zero is both correct and a transfer that credited nothing. A
superuser makes every query succeed and every guarantee void. Of each success
path, ask what it would look like if it were wrong.

## Editing this wiki

**Do not edit pages here.** The source is
[`docs/wiki/`](https://github.com/VoltLightning/waltning/tree/main/docs/wiki) in
the repository, and publishing overwrites whatever the wiki holds.

That indirection is the point. The wiki is a separate git repository, so the
pre-commit hook — the personal-data sweep in particular — cannot run on it. A
public surface for this project that no gate covers is not acceptable, so the
pages live where the gate is and get mirrored out by `pnpm wiki:publish`.
