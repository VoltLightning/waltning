# 5 · Deployment

`SPEC.md` §5 specifies the *policy* — Tailscale-only, Argon2id, TOTP, nightly
`pg_dump`, quarterly restore drill. This is the plan that makes it operable:
what runs where, in what order, and what to do when it breaks.

**Target:** one Raspberry Pi 4 (4 GB), booting from SSD, on a home network,
reachable only over Tailscale.

---

## Environments

| | Purpose | Data | Perimeter |
|---|---|---|---|
| **dev** | Local development | **Real, from day one** — see below | Tailscale bind from the start |
| **prod** | The Pi | Real | Tailscale + auth + non-superuser role |
| **scratch** | Migration rehearsal, restore drills | Throwaway copies | Local only, dropped after |

**Development uses real data, so its perimeter is a prerequisite.** Bind to the
tailnet interface before the importer runs. Otherwise a laptop on a café network
is one `docker compose up` away from binding five years of financial history to
`0.0.0.0`.

---

## Boot order

```mermaid
graph LR
    A["postgres<br/><i>healthcheck: pg_isready</i>"] --> B["migrate<br/><i>run-once, exits 0</i>"]
    B --> C["api"]
    A --> D["minio"]
    D --> C
    C --> E["caddy"]

    classDef s fill:#1f6f4a,stroke:#0d3a26,color:#fff
    class A,B,C,D,E s
```

**`migrate` is a separate one-shot service, not an API startup step.** Two
reasons that matter here: a failed migration must stop the deploy rather than
leave an API serving a half-migrated schema, and migrations `0003`–`0007` create
triggers, views, roles and grants — so the API's own role does not have (and
should not have) the privileges to apply them.

### The `db:push` prohibition

`drizzle-kit push` was removed from `package.json` and must not come back. It
cannot see triggers, views, grants or generated columns — which, after `0003`
through `0007`, is most of what this schema's guarantees consist of. A push that
silently drops `assert_period_not_closed` leaves a database that looks correct
and enforces nothing.

**Two migrations, and the split is deliberate.**

```
0000_schema.sql             generated from schema.ts by drizzle-kit
0001_database_objects.sql   hand-written: everything the ORM cannot express
```

The ten hand-written migrations that preceded these were squashed into this
pair while nothing was deployed and no data existed — the only window in which
squashing is free, and the reason to take it was that `drizzle-kit generate`
had become unusable: the snapshots stopped at `0001` while the migrations ran
to `0009`, so it would have emitted a migration re-creating everything. The
answer was to make `generate` work again rather than to forbid it.

`0000` is now regenerable at any time. `0001` holds the triggers, the functions
behind them, the views, the two roles and their grants, the exclusion
constraint, and the five CHECK predicates Drizzle has no syntax for — which is
to say, most of this system's guarantees. **When the table layer changes, run
`pnpm db:generate`; when a guarantee changes, edit `0001` by hand.**

The squash was verified rather than trusted: a database built from the old ten
and one built from the new two were compared object by object — 33 tables, 320
column definitions, 10 triggers, 5 views, 31 CHECK constraints, 1 exclusion
constraint, 2 roles, and the `agent_memory` predicate byte-for-byte. The only
differences are constraint *names*, where Drizzle's generated names are longer
than the hand-written ones.

That comparison earned its keep twice. It caught a composite foreign key —
`category_tax_map(tax_line_id, scheme_id) → tax_lines(id, scheme_id)`, which
stops a category mapping to a line from a different tax scheme — that Drizzle
cannot express and that a naive squash would have dropped silently. And it
caught `schema.ts`'s `agent_memory_no_figures` predicate being *weaker* than
the applied one, because the regex lives in a template literal and JavaScript
had eaten `\s`, `\$` and `\M` before Postgres ever saw them.

**Migrations connect as the bootstrap superuser** — `MIGRATE_DATABASE_URL`.
`0005` creates a role and issues `GRANT`s, which `waltning_app` has no privilege
to do. This is the only place that connection is correct: the app takes
`APP_DATABASE_URL` and the tax export takes `EXPORT_DATABASE_URL`, and §13.1's
separation holds only because everything else refuses the superuser. A single
URL serving all three would leave T1 unenforceable while every query succeeded.

---

## Serving the web dashboard

**Nothing specified this.** Caddy appeared four times across the documents and
was described only as TLS termination; §4.1's diagram draws `caddy ─── api` and
stops. But 19 screens specify a `≥1024px` web layout with keyboard navigation,
and something has to serve them.

**The web app is a static export of the same Expo codebase** (§4.3, §14.6) —
`expo export --platform web` produces a client bundle. Caddy serves it directly
and reverse-proxies the API. There is no Node process rendering HTML.

```
                    waltning.<tailnet>.ts.net
                              │
                    ┌─────────▼─────────┐
                    │       caddy       │  Tailscale-issued cert
                    └─────────┬─────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        /trpc/*  ────→   api:3000        /*  ────→  static bundle
        /healthz              │                      SPA fallback → index.html
        /readyz               │
                              ▼
                        postgres · minio
```

| Route | Served by | Notes |
|---|---|---|
| `/trpc/*` | `api` | The only dynamic path |
| `/healthz` `/readyz` | `api` | The probe contract (`09-connectivity.md`). **Must not be cached** |
| `/assets/*` | Caddy, from the export | Content-hashed → `immutable`, one year |
| `/*` | Caddy, SPA fallback to `index.html` | **`no-cache` on `index.html` itself**, or a deploy ships a stale bundle pointing at assets that no longer exist |

**The bundle is built at image build time**, not on the Pi. Metro bundling an
Expo web app on a 4 GB ARM board is slow enough to matter, and it puts a
toolchain on the appliance for no reason. The compose service is a volume of
static files.

**Cache invalidation is the failure to design for.** The client checks
`/healthz`'s `build` field against its own on foreground; a mismatch prompts a
reload. Without it, a phone browser holds a bundle whose `opVersion` the server
no longer accepts — the version-skew row in the status table.

**No public certificate.** There is no public name, so Caddy uses the
Tailscale-issued cert for `waltning.<tailnet>.ts.net` and auto-renews it. The
tailnet is the only path in.

### If RN Web fights the dense screens

§14.6 says the fork is a decision, not a failure: add `apps/web` as Vite +
React reusing the same tRPC client and `packages/core`. The monorepo exists
partly to make that split cheap.

**The trigger should be stated rather than felt.** Take the fork if the import
review queue (S02) or reports (S25) cannot hold their budgets — 300 ms search,
800 ms dashboard paint — on the target hardware after one honest attempt at
optimisation. Those two screens are the dense-grid case §14.6 names, and they
are the ones to build first on web for exactly that reason.

Serving does not change if the fork is taken: a Vite build is also a static
bundle behind the same Caddy routes.

---

## Roles and secrets

```mermaid
graph TB
    SU["POSTGRES_USER<br/><b>superuser</b><br/><i>bootstrap + migrate only</i>"]
    APP["waltning_app<br/><i>DML, no DDL</i>"]
    EXP["waltning_export<br/><i>SELECT on tax_ledger</i>"]
    SU -->|creates| APP
    SU -->|creates| EXP
    API["api container"] --> APP
    TAXP["tax export path"] --> EXP

    classDef danger fill:#8f3f3f,stroke:#5c2020,color:#fff
    class SU danger
```

**The API must never connect as `POSTGRES_USER`.** A superuser bypasses every
`GRANT`, so T1 is unenforceable until this is true — and `createDb()`'s default
argument silently supplies it. Make the connection an explicit parameter with no
default, so the mistake is a type error rather than a quiet success.

**Roles are cluster-wide and `pg_dump` does not carry them.** After any restore
into a fresh cluster, `0005` must be re-applied. `verify_t1()` is what detects
that it was not — run it as a post-restore assertion, not as an afterthought.

| Secret | Lives | Never |
|---|---|---|
| Model provider key(s) | Pi environment, injected by Compose | App bundle, git, or a prompt |
| Postgres password | Docker secret / `.env` (0600, gitignored) | Committed |
| Session signing key | Generated first boot, persisted to a mounted volume | Hard-coded |
| Backup encryption key | `age` key on a hardware token + paper copy off-site | On the Pi alone |

All model calls originate from `api`. **The phone never holds a provider key.**

---

## Backup and restore

| What | Cadence | Where |
|---|---|---|
| `pg_dump --format=custom` | Nightly | Local volume → age-encrypted → Backblaze B2 |
| Receipt images | On write | age-encrypted **then** mirrored to the same bucket |
| Retention | 30 daily · 12 monthly · 3 yearly | — |
| **Restore drill** | **Quarterly**, to a scratch container | — |

### Restore runbook

1. Fresh Postgres 16, matching ICU locale settings — `--locale-provider=icu
   --icu-locale=und-x-icu`. A different collation changes `ORDER BY` and breaks
   trigram search behaviour.
2. `pg_restore` the newest verified dump.
3. **Re-apply `0005`** — roles and grants are not in the dump.
4. Run `verify_t1()` and `verify_no_omitted_revenue()`. Both must return true
   before the API is pointed at the restored database.
5. Run the §15.1 invariant set and record the result.
6. Spot-check one balance against a bank statement
   (`tools/migrate-mm/reconcile_bank.py`).

**Steps 3–4 are the ones a drill exists to catch.** A dump that restores cleanly
and silently loses the tax isolation role is the failure this design is most
exposed to, precisely because nothing about it looks wrong.

### An untested backup is not a backup

The drill is quarterly and belongs in the calendar, not in intent. Boot from SSD,
never an SD card — SD cards fail under database write patterns, and they fail
silently for a while first.

---

## Cutover (J15)

```mermaid
graph LR
    P1["probe.py<br/><i>✅ Reading A confirmed</i>"] --> P2["type 52 balances"]
    P2 --> P3["migrate + both gates"]
    P3 --> P4["parallel run<br/><i>Waltning + Money Manager</i>"]
    P4 --> P5["Money Manager read-only"]
```

**Parallel run before read-only.** The migration's fidelity is checkable; its
*completeness* is a property of the source, and 169 of 246 real transactions on
`Bank A · PLN` are not in Money Manager at all (C19). The parallel period is when
that becomes visible in daily use rather than in a report.

**The sync tooling is permanent, not a migration step.** That the ledger is
partial is an ongoing property of how it was kept, not a cutover event.

---

## Operational monitoring

There is no observability stack, and there should not be one for a single-user
system on one Pi. What replaces it is **S30**, which surfaces the four things
whose silent failure would be expensive:

| Signal | Silent failure looks like |
|---|---|
| Backup status + last successful offsite push | Backups stopped three weeks ago |
| FX coverage per active currency | GEL at 0.5% coverage — went unnoticed for months |
| §15.1 invariant results | A trigger was dropped by a restore |
| Model spend per surface | A loop retrying against a paid endpoint |

**A violation is a defect report, not an exception.** Each writes an `audit_log`
entry with `actor = 'system'` and surfaces on S30; none block a write, because a
check that can halt the ledger is a new failure mode.

---

## Resource budget — Pi 4, 4 GB

| Container | Memory | Notes |
|---|---|---|
| `postgres` | ~1.5 GB | `shared_buffers` 512 MB; the working set is small but the aggregates are index-dependent |
| `api` | ~400 MB | Single Node process |
| `minio` | ~200 MB | Blob throughput is trivial |
| `caddy` | ~50 MB | |
| Headroom | ~1.5 GB | Page cache — this is what keeps the dashboard warm |

**Every ledger index must carry `WHERE deleted_at IS NULL`.** Without it no
aggregate can be index-only, and the dashboard costs ~300 ms cold after any
memory-pressure event — which is exactly when you open it. Budgets in
[`06-quality-attributes.md`](06-quality-attributes.md).
