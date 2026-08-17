# Getting Started

Two paths: a laptop, where you want it running in five minutes, and a Raspberry
Pi, which is what it is actually for.

## On a laptop

Node ≥ 22, pnpm ≥ 10, Docker.

```sh
git clone https://github.com/VoltLightning/waltning && cd waltning
pnpm install                 # also installs the git hooks
cp .env.example .env         # fill it in — note the three database URLs
pnpm db:reset                # drop, migrate, grant, seed — one command
pnpm dev
```

`pnpm db:reset` is the one to reach for. Nothing in the schema is permanent
yet, so changing it should never mean hesitating: edit `schema.ts`, run
`pnpm db:generate`, reset. The four-step form (`db:up`, `db:migrate`, grant,
`db:seed`) exists for when you want to watch a single step.

### The three database URLs

`.env.example` declares three, and they are not redundant:

| Variable | Role | Can do |
|---|---|---|
| `MIGRATE_DATABASE_URL` | superuser | Run migrations. Nothing else, ever |
| `APP_DATABASE_URL` | `waltning_app` | Everything the API does |
| `EXPORT_DATABASE_URL` | `waltning_export` | Read one business-only view |

**The separation is the tax guarantee**, not hygiene. If a query fails with a
privilege error, the design is working — the fix is to change what the query
asks for, never to reach for a stronger URL. Doing that silently voids
[[Tax Isolation]] and nothing will tell you.

The app role is deliberately not a superuser, because a superuser bypasses
every `GRANT` and makes the entire boundary decorative while every test still
passes.

### Running the tests

```sh
pnpm test        # against real Postgres — pnpm db:up first
pnpm verify      # Biome + strict TypeScript + tests. The gate
```

There are no database mocks. Each test file gets its own database, cloned from
a migrated template and dropped afterwards, because a mocked constraint tests
the mock rather than the constraint — and constraints are where the guarantees
live.

## On a Raspberry Pi

The real deployment: Docker Compose, Tailscale, Caddy with tailnet
certificates, nightly encrypted dumps to Backblaze B2. The full procedure,
including what to do when a restore is needed, is in
[`architecture/05-deployment.md`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/architecture/05-deployment.md).

Two things worth knowing before you start:

**Postgres binds to loopback only,** and every device reaches the API over
Tailscale. There is no port forwarded, no reverse proxy on the public internet,
and no login page for anyone to find. Access control is the tailnet; §5.1 of
[`SPEC.md`](https://github.com/VoltLightning/waltning/blob/main/SPEC.md)
explains why that is a stronger position than an auth form, and §5.2 covers the
authentication that still sits behind it.

**Backups are encrypted before they leave the machine.** The restore path is
part of the spec, because a backup nobody has restored is a hypothesis.

## Migrating from Money Manager

`tools/migrate-mm` is a one-shot importer with verification gates, run as
`pnpm mm:all`. It is deliberately not a five-year history import — §8.0
explains the scope decision, and the eleven-step procedure with its gates and
its rollback boundary is in
[`migration-runbook.md`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/migration-runbook.md).

The gate that matters is §8.4: it compares computed balances against balances
you type in by hand. Without those hand-entered figures it evaluates
`(computed − Σ) + Σ = computed` and **cannot fail** — a check that always
passes, which is worse than no check at all.
