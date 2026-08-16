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

### Types: parameters, not escape hatches

**Reach for a type parameter before `unknown`, `any` or `never`.** `any` is a
lint error and fails the gate. The other two are legal and usually wrong.

The tell is a cast at the call site. `unknown` and `never` used as placeholders
do not remove a type problem, they relocate it: every consumer casts to get
back the type the producer already knew. `Registry` was declared with its
context fixed to `never` — not a type so much as an admission — and every use
needed a cast until it became `Registry<Ctx>`. `ToolSchema.inputSchema` was
`Record<string, unknown>`, which accepts a `Date` and a function as readily as
JSON; it is now a `JsonSchema`. The importer forced a string into an enum
column with `as never`, which is a way of telling the compiler to stop asking —
it now narrows against `accountKind.enumValues` and names the offending value.

Legitimate uses are narrow, and each is worth a comment saying which one it is:

| Where | Why it is not a placeholder |
|---|---|
| `catch (e)` | The language binds `unknown`. Narrow once, at the boundary |
| JSON off the wire | Genuinely untyped until someone asserts a shape |
| A constraint over a heterogeneous collection | TypeScript has no existential type for "returns *something*" — see `AnyOperation` |
| `never` for exhaustiveness | The value really cannot occur, and the compiler proves it |

**A loose type at a seam is where this gets tested.** A registry is held
generically by the router and the agent runtime, so its element type cannot
know each operation's input. That made `widened.handler("garbage", ctx)`
compile — the concrete declarations were airtight and the seam was not, which
is the shape worth hunting because it is the shape that survives review.

The fix is not a better cast. `AnyOperation` **omits `handler`**, and
`defineOperation` builds an `invoke(raw, ctx)` that parses against the declared
schema first. A generic consumer therefore holds something it cannot run
without validation — enforced by the type rather than by both call sites
remembering. Seven deliberate violations were written against the registry;
six failed to compile before this, and this is the seventh.

One consequence worth knowing, because it looks like a style choice and is not:
`Operation.handler` is declared with **method syntax**, not as an arrow
property. Under `strictFunctionTypes` a property-form function is
contravariant in its parameters, so a handler accepting a specific input is not
assignable to one accepting a looser input — and a registry holding many
operations needs exactly that. Method syntax is bivariant, which is the case it
exists for.

### Import specifiers, and the one rule that is not obvious

§4.2 has always claimed that source-only packages import each other by real
path — `./money.ts`, extension included — and that Metro handles it. **Verified
by spike**, against a throwaway Expo app: an explicit `.ts` specifier resolves
for both `web` and `ios`, relative *and* inside a linked package with an
`exports` map, with the marker strings present in both the web bundle and the
Hermes bytecode. A deliberately broken specifier fails the build loudly, so the
successes are real rather than silently skipped.

**But an explicit extension defeats platform resolution, silently.** Measured
in the same spike:

| Import | `…web.ts` sibling present | What web bundled |
|---|---|---|
| `./lib/rel.ts` | yes | **the base file** — override ignored |
| `./lib/noext` | yes | the `.web.ts` override |

Nothing errors. The web build simply keeps the native implementation, which is
the worst shape a build problem can have.

**So: any file that has — or may later gain — a platform variant must be
imported extension-less.** In practice that is components in `packages/ui` and
`apps/mobile`; nothing under `packages/core`, `packages/db`, `apps/api` or
`tools/` has a platform variant, so the explicit-specifier convention stays.

`tsc` does not know about platform extensions either, so a `.web.tsx` is only
typechecked as a standalone file. That is the accepted cost — Bluesky's
production RN Web app ships a single native-biased `moduleSuffixes` and lives
with the same gap. Add a second typecheck projection only if platform files
ever become common, which in production RN Web codebases they are not.

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
