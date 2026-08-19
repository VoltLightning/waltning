# Getting Started

Two paths: a laptop, where you want it running in five minutes, and a Raspberry
Pi, which is what it is actually for.

## On a laptop

Node ≥ 22, pnpm ≥ 10, Docker.

```sh
git clone https://github.com/VoltLightning/waltning && cd waltning
make setup                   # install, create .env, build the database
make dev                     # api + web, from source
```

`make doctor` says what is installed, what is missing, and what to run about it.
`make help` lists everything.

**Make orchestrates; pnpm implements.** No target reimplements a pnpm script —
`make verify` runs `pnpm verify`. Two places that both know how to run this
project is two places that drift, and the one nobody is looking at is always
the stale one. A test runs `make help` and asserts every declared target
appears in it, and that every pnpm script Make names exists.

`pnpm db:reset` is the one to reach for. Nothing in the database design is
settled yet, so changing it should never involve hesitation: edit the schema
file, regenerate, reset.

```mermaid
graph LR
    A["<b>recreate</b><br/><i>drop and create<br/>an empty database</i>"] --> B["<b>migrate</b><br/><i>tables, then triggers,<br/>views, roles, grants</i>"] --> C["<b>grant</b><br/><i>hand out permissions<br/>to each role</i>"] --> D["<b>seed</b><br/><i>currencies and<br/>the category tree</i>"]
```

The four steps exist separately for when you want to watch one of them; `db:reset`
runs all four.

### The three database URLs

`.env.example` declares three connections, and they are not redundant. Each
connects as a different database user with different permissions.

| Variable | Connects as | Allowed to |
|---|---|---|
| `MIGRATE_DATABASE_URL` | the superuser | Run migrations. Nothing else, ever |
| `APP_DATABASE_URL` | `waltning_app` | Everything the API normally does |
| `EXPORT_DATABASE_URL` | `waltning_export` | Read one business-only view |

**The separation is the tax guarantee itself**, not tidiness. If a query fails
with a permission error, the design is working — the fix is to change what the
query asks for, and never to swap in a more powerful connection. Doing that
quietly voids [[Tax Isolation]], and nothing will tell you.

The API's user is deliberately not a superuser, because a superuser ignores
every permission in the database. Running as one makes every query succeed and
every boundary decorative, while the whole test suite still passes.

### All three surfaces at once

One Expo codebase serves the phone and the browser, and the API is a separate
process — so it is three terminals rather than one.

```sh
make dev        # the API and the web app together, Ctrl-C stops both
make dev-web    # just Metro, when you want its interactive key commands
make dev-ios    # the same app, iOS simulator
```

```mermaid
graph LR
    subgraph surfaces["<b>surfaces</b>"]
        WEB["<b>browser</b><br/><i>React Native Web<br/>localhost:8081</i>"]
        IOS["<b>iOS simulator</b><br/><i>the same bundle,<br/>Hermes bytecode</i>"]
    end
    WEB -->|"<i>tRPC over HTTP<br/>needs DEV_CORS_ORIGIN</i>"| API["<b>API</b><br/><i>Hono + tRPC<br/>127.0.0.1:3000</i>"]
    IOS -->|"<i>tRPC over HTTP<br/>loopback is the Mac</i>"| API
    API -->|"<i>as waltning_app</i>"| PG["<b>Postgres</b><br/><i>in Docker<br/>127.0.0.1:5442</i>"]
```

`make e2e` then checks that chain against what is actually running — the probes,
[[Offline and Sync|Rule 0]] authenticating a real response, a read returning
seeded rows with its declared fields, and a refusal arriving as a domain error
rather than a transport failure. Read-only unless you pass `--write`.

**Two settings, each for one surface only.** The browser needs
`DEV_CORS_ORIGIN=http://localhost:8081`, because Metro and the API are two
origins in development and one behind Caddy in production; without it the page
loads and every request fails as *no answer*. A **real device** needs
`EXPO_PUBLIC_API_URL`, because loopback on a phone is the phone — the app
refuses to guess rather than failing in a way that looks like an outage. The
simulator needs neither.

The simulator itself needs Xcode proper rather than the command-line tools:
`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`, then
`xcodebuild -downloadPlatform iOS`.

### Running the tests

```sh
pnpm test        # against a real Postgres — pnpm db:up first
pnpm verify      # formatting + types + tests. This is the gate
```

There are no database fakes. Each test file gets its own database, copied from
an already-migrated template and thrown away afterwards.

```mermaid
graph LR
    T["<b>template db</b><br/><i>migrated once</i>"] --> A["test file A<br/><i>own copy</i>"]
    T --> B["test file B<br/><i>own copy</i>"]
    T --> C["test file C<br/><i>own copy</i>"]
    A --> X["dropped"]
    B --> X
    C --> X
```

A faked constraint tests the fake rather than the constraint — and constraints
are where this system's guarantees actually live, so testing against anything
else would be testing the wrong thing.

## On a Raspberry Pi

The real deployment. Everything runs as containers under Docker Compose, and
there are two routes in — **neither of which puts anything on the public
internet.** Tailscale is a private network connecting your own devices to each
other and nothing else, and it works wherever you are; the alternative is your
own home network, which is simpler and stops at your front door. The phone uses
Tailscale, because the whole point of the phone is that it leaves the house.

```mermaid
graph TB
    subgraph tailnet["Tailscale"]
        DEV["your phone<br/>and laptop"]
        subgraph pi["Raspberry Pi"]
            CADDY["<b>caddy</b><br/><i>HTTPS with tailnet certificates</i>"]
            API["<b>api</b>"]
            MIG["<b>migrate</b><br/><i>runs once, then exits</i>"]
            PG[("<b>postgres</b><br/><i>bound to localhost only</i>")]
            MINIO[("<b>minio</b><br/><i>receipt images</i>")]
            CRON["<b>cron</b><br/><i>nightly dump · rate sync ·<br/>invariant checks</i>"]
        end
    end
    B2["Backblaze B2"]

    DEV --> CADDY --> API
    PG --> MIG --> API
    API --> PG
    API --> MINIO
    CRON --> PG
    CRON -->|"encrypted before it leaves"| B2
```

Three things worth knowing before you start:

**Migrations are their own container, not something the API does on startup.** A
failed migration has to stop the deployment rather than leave an API serving a
half-changed database — and the later migrations create triggers, views, roles
and permissions, which the API's own user does not have (and should not have)
the rights to apply.

**PostgreSQL listens only on the machine itself.** Devices reach the API over
Tailscale or over your own LAN; nothing is forwarded from your router, and there
is no public address to scan in either case.

**On the LAN, use a real certificate rather than plain HTTP.** This is not
tidiness: the session cookie is marked `Secure`, browsers refuse to send those
over an unencrypted connection, and the visible symptom is being logged out on
every single request rather than anything that looks like a security setting.

**Backups are encrypted before they leave the Pi**, and restoring is part of the
written procedure. A backup nobody has ever restored is a hypothesis.

One consequence of restoring that is easy to miss: **database roles are not
included in a normal dump.** After restoring into a fresh database, the
permission setup has to be applied again, or the export boundary silently is not
there. There is a check that detects it.

The full procedure is in
[`architecture/05-deployment.md`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/architecture/05-deployment.md).
Note that this diagram is the specified target — see [[Project Status]] for what
is actually built today.

## Migrating from Money Manager

`tools/migrate-mm` is a one-shot importer with verification gates, run as
`pnpm mm:all`. It deliberately does not import five years of history; §8.0
explains that scope decision, and the eleven-step procedure with its gates and
the point past which rollback stops being practical is in
[`migration-runbook.md`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/migration-runbook.md).

```mermaid
graph LR
    A["<b>probe</b><br/><i>confirm the export<br/>can even be read</i>"] --> B["<b>type in the<br/>real balances</b>"] --> C["<b>import</b><br/><i>+ both gates</i>"] --> D["<b>parallel run</b><br/><i>both apps, side by side</i>"] --> E["<b>old app<br/>read-only</b>"]
```

The gate that matters is the one comparing calculated balances against balances
you have typed in by hand from the old app. **Without those hand-entered
figures it compares a number to itself and cannot fail** — a check that always
passes, which is worse than no check, because it produces confidence instead of
a gap.

The parallel run is there for a different reason. Whether the import was
*faithful* can be checked automatically. Whether the source was *complete* is a
property of how the old records were kept, and that only becomes visible by
using both for a while.
