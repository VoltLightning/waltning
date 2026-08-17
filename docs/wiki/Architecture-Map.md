# Architecture Map

There are two specification trees and it is not obvious which one answers a
given question. This page is the index.

**[`SPEC.md`](https://github.com/VoltLightning/waltning/blob/main/SPEC.md)
specifies the system.** Data model, FX semantics, security, the agent, tax.
Everything underneath the interface, with the reasoning kept next to each
decision.

**[`docs/specification/`](https://github.com/VoltLightning/waltning/tree/main/docs/specification)
specifies the interface.** Principles, design system, 17 journeys, 32 screens,
the operation registry, every computed figure.

## Which document answers what

| Question | Document |
|---|---|
| What are the entities and their constraints? | `SPEC.md` §6 |
| How do amounts, rates and conversions work? | `SPEC.md` §7 → [[Money and FX]] |
| Why can't a personal row reach a tax report? | `SPEC.md` §13 → [[Tax Isolation]] |
| What can the agent do, and what needs approval? | `SPEC.md` §11 → [[The Operation Registry]] |
| What runs where, and how is it deployed? | [`architecture/01`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/architecture/01-context-and-containers.md), [`05`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/architecture/05-deployment.md) |
| What happens with no network? | [`architecture/08`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/architecture/08-offline-and-concurrency.md), [`09`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/architecture/09-connectivity.md) → [[Offline and Sync]] |
| Where does a new file go? | [`architecture/10`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/architecture/10-code-structure.md) |
| How is any given figure calculated? | [`computations.md`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/computations.md) |
| What writes exist at all? | [`operations.md`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/operations.md) |
| What does this screen do? | [`screens/`](https://github.com/VoltLightning/waltning/tree/main/docs/specification/screens) — S01–S34 |
| What is the user actually trying to do? | [`flows/`](https://github.com/VoltLightning/waltning/tree/main/docs/specification/flows) — J01–J17 |
| What is known to be wrong? | [`defects.md`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/defects.md) |
| In what order is this being built? | [`build-order.md`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/build-order.md) → [[Project Status]] |

## The packages, and which way dependencies point

```
apps/api → packages/db → packages/core ← apps/mobile
```

`core` sits at the bottom and runs **identically on the phone and the server** —
decimal.js and zod only, no Node APIs, no database driver. That constraint is
what makes an offline figure and an online figure the same number rather than
two implementations that agree most of the time.

**`mobile` never imports `db`.** A boundary test enforces it.

| Package | What it holds |
|---|---|
| `apps/mobile` | Expo / React Native — iOS and web from one codebase. Offline capture, outbox, replica |
| `apps/api` | Hono + tRPC. Operation registry, agent runtime, import pipelines, FX sync, exports |
| `packages/core` | The contract: `money.ts`, shared types, Zod schemas, the registry definition |
| `packages/db` | Drizzle schema, migrations, seed, FX backfill |
| `packages/ui` | Shared components — anything a *second* feature needs |
| `tools/migrate-mm` | One-shot Money Manager importer with verification gates |

## How the code is laid out

**Modules are the primary axis; layers live inside them.** Not
`controllers/`, `services/`, `models/` as three global folders — a change to
one feature would touch all three and read as three unrelated edits.

```
apps/api/src/modules/<domain>/     operation + service + tests, one slice
apps/mobile/src/features/<name>/   ui/{atoms,molecules,organisms} · model · api
```

Only `index.ts` is public, and **no module imports another** — composition
happens at the registry on the API side and in `app/` routes on the mobile
side. A boundary test enforces this, because an import that shouldn't exist is
invisible in review and obvious to a script.

Atomic design is a **scale inside a UI module**, never three global folders. A
component moves to `packages/ui` when a *second* feature uses it, not when it
looks generic.

Three rules that keep the layers honest:

- **Routers dumb, services compute, Postgres enforces.**
- **Screens are the only layer that fetches.** A molecule that calls tRPC
  cannot render in a diff preview, in a test, or offline from the replica.
- **No abstraction before the third use.** No repositories over Drizzle, no
  generic helpers, no event bus, no managers.

## A feature is a vertical slice

Built in this order — it is a hard requirement, not a preference:

**schema + migration → registry operation → service → tRPC procedure → screen**

Never start at the screen. Starting there produces an interface that promises a
figure nothing computes, and the schema then gets bent to fit a layout. UI-only
work is the exception and starts where it says.
