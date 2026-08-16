# 10 · Code structure

Where a file goes, and why the answer is never "wherever".

`02-components.md` describes the runtime components. This describes the
**source layout** that produces them — a different question, and one that
becomes expensive to answer late. A hundred files laid flat in `src/` is a
decision too, just an unexamined one.

Two conventions, one per side, chosen because each is the standard vocabulary
in its own ecosystem rather than something invented here.

---

## Backend — layered

```
apps/api/src/
  index.ts          bootstrap: env, listen. Nothing else
  config/           every process.env read, in one place
  common/           errors, envelope, pagination — no domain knowledge
  middleware/       cross-cutting request concerns
  http/             the Hono app and the probe endpoints
  trpc/             tRPC init, context, error formatter, root router
  routes/           tRPC routers per domain — dispatch only
  registry/         operation declarations — the controller layer
  services/         domain logic, one module per aggregate
  infra/            adapters to outside systems: db, blobs, model providers
```

**Dependencies point one way**, and this is the rule worth enforcing over all
the others:

```
http → trpc → routes → registry → services → infra
                          ↘ common ↙
```

A service never imports from `registry/`, `routes/` or `http/`. It takes plain
arguments and returns plain values. The moment a service reaches back up, the
agent — which calls the registry directly and never touches HTTP — silently
gets different behaviour from the UI, which is the exact drift the registry
exists to prevent.

### `registry/` is the controller layer

In a conventional stack a controller validates input, applies policy, calls a
service, shapes a response. That is what an operation does here — it just also
generates the agent's tool list, so the layer earns a different name (`§11.0`,
`operations.md`).

| Layer | Does | Never |
|---|---|---|
| `routes/` | Authenticate, dispatch, return the envelope | Contains an `if` about domain state |
| `registry/` | Validate, gate, audit, orchestrate one or more services | Arithmetic, or a business rule |
| `services/` | Business logic, one aggregate each | Sees a request, header, or tRPC context |
| `infra/` | Talks to Postgres, MinIO, model providers | Knows what a transaction *means* |

**Services compute; Postgres enforces.** Anything phrased as "must never" gets
both — the service check for a good error message, the constraint for when the
service is wrong.

---

## Frontend — atomic design

Mobile and web are **one Expo codebase** (§4.3), so there is one component
library rather than one per surface: `packages/ui`.

```
packages/ui/src/
  atoms/        no domain knowledge      Button, Input, Tag, Icon
  molecules/    domain meaning, no data  Amount, StatTile, TransactionRow
  organisms/    a whole section          DiffCard, Shell, CalendarGrid

apps/mobile/
  app/          expo-router tree — the screens, and the only layer that fetches
  features/     screen-local composition that is not yet shared
```

**The boundary between layers is what a component knows**, not how big it is:

- An **atom** that knows what a transaction is has been misfiled.
- A **molecule** carries domain meaning — `Amount` knows sign, currency,
  decimals and P1's rule that every figure renders through it — and knows
  nothing about where the figure came from.
- An **organism** composes molecules into a section and still fetches nothing.
- A **screen** is a route. It owns data fetching, and it is the *only* layer
  that may.

That last line is the one with teeth. A molecule that calls tRPC cannot be
rendered in a diff preview, in a test, or offline from the replica — and the
offline design (§14.3) depends on being able to render from folded local state.

### This is not a second vocabulary

The design system already names 97 components across
`docs/specification/design-system/`. Atomic design is a **filing rule** for
them, not a re-classification:

| Design system | Atomic layer |
|---|---|
| §3 Primitives | `atoms/` |
| §5 Composites — rows, tiles, messaging | `molecules/` |
| §5 Composites — gate, dashboard, tax, data surfaces | `organisms/` |
| `screens/S01`–`S34` | `apps/mobile/app/` |

**Screens still never invent components** (working rule 1). Atomic design says
where a component lives; the design system says whether it may exist.

---

## Shared

```
packages/core/   contracts: money.ts, shared types, Zod schemas, F/R/S classes
packages/db/     Drizzle schema, migrations, seed — depends on core
packages/ui/     the component library — depends on core
```

`core` is the bottom of the graph and must run identically on phone, web and
server: decimal.js and zod only, no Node APIs, no database driver. **`mobile`
never imports `db`** — that would drag the Postgres driver into a phone bundle.

---

## Related

- `02-components.md` — the runtime components these files produce
- `operations.md` — what an operation declaration carries
- `design-system/` — which components exist
- `SPEC.md` §4.2 — the repository tree
