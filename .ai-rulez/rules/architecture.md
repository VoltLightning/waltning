---
priority: critical
---

# Architecture

Dependency direction, strictly one-way — `core` is the bottom:

```
apps/api ──→ packages/db ──→ packages/core ←── apps/mobile
```

`core` is the contract layer: operation definitions, shared Zod schemas,
`money.ts`, F/R/S classifications. It must run identically on phone, web and
server — decimal.js and zod only, no Node APIs, no db driver. `db` is schema +
Drizzle. **`mobile` never imports `db`.** A wrong-direction import is an
architecture change, not a feature.

**Where files go** (`architecture/10`). Backend layers, dependencies one way:

```
apps/api/src/  index · config · common · middleware · http · trpc
               routes → registry → services → infra
```

`routes/` dispatch only · `registry/` = the controller layer: validate, gate,
audit, orchestrate · `services/` domain logic, one aggregate each, never sees a
request · `infra/` talks to Postgres/MinIO/models. A service importing from
`registry/` or `http/` is a bug: the agent calls the registry directly, so
logic above it is logic the agent silently doesn't get.

Frontend is atomic, in `packages/ui` (one library — mobile and web are one Expo
build): `atoms/` no domain knowledge · `molecules/` domain meaning, no data ·
`organisms/` a whole section. Screens live in `apps/mobile/app` as expo-router
routes and are **the only layer that fetches** — a molecule calling tRPC can't
render in a diff preview, a test, or offline from the replica.

Imports use explicit `.ts` specifiers (verified: Metro resolves them on web and
iOS) — **except any file with a platform variant**, which must be
extension-less. `./Button.tsx` silently ignores `Button.web.tsx`; `./Button`
picks it up. Nothing errors, so this one is caught only by knowing it.

**A feature is a vertical slice, built in this order — hard requirement:**

1. Schema change + migration (if data changes)
2. Operation in the registry: name, Zod input, `offlineEligible`, gate class
3. Service function (apps/api)
4. tRPC procedure — dispatch only
5. Screen

Never start at the screen. Slices touching no data start at 5.

- **Routers are dumb.** A procedure authenticates, dispatches, returns the
  envelope. An `if` in a router is logic leaking somewhere untested/unaudited.
- **Services compute; Postgres enforces.** Every "must never" gets both: the
  service check (good error) and the constraint (holds when the service is
  wrong).
- **Clients render.** The phone computes only F-class figures, via `core`'s
  `money.ts`. A screen needing a figure that doesn't exist is a
  `computations.md` change first.
- **No abstraction before the third use.** No repositories over Drizzle, no
  generic helpers, no events, no manager classes. Same reasoning that refused a
  message bus (§4.1).
- **Errors are the envelope or a throw** — never a nullish "didn't work". On
  clients, Rule 0: a response authenticates before its status is trusted.
