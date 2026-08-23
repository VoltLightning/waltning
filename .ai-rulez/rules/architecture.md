---
priority: critical
---

# Architecture

**An app is a delivery mechanism, not a place where logic lives.**
The manifesto is `docs/specification/architecture/11-client-architecture.md`;
`tests/architecture.test.ts` enforces every rule below. A rule that is not a
test is not a rule.

## The floor

```
                      packages/core          contracts · money · protocol
                  decimal.js and zod only    no React, no platform, no Node
                        ↑           ↑
          packages/client         packages/ui
      transport · hooks · models   tokens · components
      react — NEVER react-native   react-native (RNW on web)
                        ↑           ↑
                 apps/mobile · apps/web       (apps/api → packages/db → core)
                 routes + platform wiring, and nothing else
```

**`packages/client` may import `react` and must never import `react-native`.**
That one line is the design: React is platform-neutral, React Native is a
renderer, so all client *behaviour* is shared by construction and only
*rendering* is negotiable. `core` never imports a Node API — it ships to a
phone. **No client package or app names `@waltning/db`, by any path**, including
relative ones and transitively through `ui`.

## Where code goes — decided by kind, not by count

| Kind | Home, from the first line |
|---|---|
| Contracts, money, protocol, pure domain | `packages/core` |
| Transport, hooks, client state, derived models | `packages/client` |
| Tokens, components, anything that renders | `packages/ui` |
| Routes, navigation, platform reads, build config | `apps/<surface>` |

**The seam is: does this file name a platform?** — `react-native`, `expo-*`, a
router, `Platform.OS`, `__DEV__`, `import.meta.env`. If it does not, it does not
belong in an app. Of the 22 client files that existed before this rule, three
did and nineteen were accidental.

**No abstraction before the third use still holds** — it governs *inventing*
abstractions (repositories, managers, generic helpers), never *placing* code.
Moving a hook into a package invents nothing. Waiting for a second app before
sharing is how the second app becomes expensive.

## Modules

```
apps/api/src/modules/<domain>/    operation + service + tests, one flat slice
packages/client/src/<domain>/     the hooks and models for one domain
packages/ui/src/<domain>/         the components that domain needs
packages/*/src/<foundation>/      primitives · fx · transport · query — domain-free
apps/<surface>/app/               routes; compose only
apps/<surface>/src/platform.ts    THE forced file — every platform read
```

**Every `src/` has an allowlist of top-level folders in
`tests/architecture.test.ts`.** Adding one is a decision made there, in the open.
An allowlist rather than a blocklist of bad names: ban `utils/` and `helpers/`
arrives, ban that and `handlers/` does.

**Never a tier or a layer as a top-level folder** — `atoms/`, `molecules/`,
`organisms/`, `hooks/`, `components/`, `services/`. Those file by size or by
kind, which puts one concept in three places: `packages/ui` was three tiers and
the FX concept spanned all of them across five files, while one file held
`TransactionRow` and `BalanceRow` because they are the same *shape* and
different domains. A tier may live **inside** a domain that grows enough to need
the scale; that is what "a scale inside a module" means.

**The foundation is domain-free by property, not by tier.** `primitives/` earns
its place because a `Button` means the same thing in a ledger or a chat client;
`fx/` because `design-system/04` requires every figure to render through
`<Amount>`, so money is this product's cross-cutting vocabulary. The direction is
one-way and tested: a domain may import the foundation, never the reverse.

Only concrete subpaths declared in a package's `exports` map are public. Each
subpath resolves directly to the module that owns its values; **barrels are
forbidden**, including package roots. No module or feature imports another —
compose at the registry (api) or in `app/` routes. Atomic tiers are a scale
*inside* a UI module, never three global folders. A component moves to
`packages/ui` when the design system names it, not when it looks generic.

**Every hook has its own file; none live in route files.** A hook in a route is
invisible to the test runner and closes over a singleton instead of taking a
client — both properties of where it was written. A hook takes its dependencies
as parameters: `useAccounts(api)` is testable, `useAccounts()` is not.

**JSX props take named function references.** Never create an arrow function,
function expression, or `.bind()` call inside JSX. Ordinary arrows outside JSX
remain legal.

Biome refuses value re-exports and inline JSX functions. The repository-wide
architecture test also refuses type-only re-exports, which Biome deliberately
allows.

**A feature is a vertical slice, built in this order — hard requirement:**
schema + migration → registry operation (Zod input, `offlineEligible`, gate) →
service → tRPC procedure (dispatch only) → screen. Never start at the screen.

- **Routers dumb, services compute, Postgres enforces.** Every "must never" gets
  both a service check (good error) and a constraint (holds when code is wrong).
- **Screens are the only layer that fetches.** A molecule calling tRPC cannot
  render in a diff preview, a test, or offline from the replica.
- **Every figure renders through `<Amount>`/`<FxAmount>`.** A component
  formatting money itself has no tabular numerals and is a second
  implementation of `computations.md` §1.
- **Errors are the envelope or a throw**, never a nullish "didn't work". Rule 0
  on clients: authenticate the response before trusting its status.
- Explicit `.ts` specifiers **except files with platform variants**, which must
  be extension-less — `./Button.tsx` silently ignores `Button.web.tsx`, and
  nothing errors.
