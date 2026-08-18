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
apps/api/src/modules/<domain>/    operation + service + tests, one slice
packages/client/src/hooks/        one hook per file, named for what it returns
packages/ui/src/{atoms,molecules,organisms}/
apps/<surface>/app/               routes; compose only
apps/<surface>/src/platform.ts    THE forced file — every platform read
```

Only `index.ts` is public and **no module or feature imports another** — compose
at the registry (api) or in `app/` routes. Atomic tiers are a scale *inside* a
UI module, never three global folders. A component moves to `packages/ui` when
the design system names it, not when it looks generic.

**Every hook has its own file. No hooks in barrels, none in route files.** A
hook in a route is invisible to the test runner and closes over a singleton
instead of taking a client — both properties of where it was written. A hook
takes its dependencies as parameters: `useAccounts(api)` is testable,
`useAccounts()` is not.

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
