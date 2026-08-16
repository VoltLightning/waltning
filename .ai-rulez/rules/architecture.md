---
priority: critical
---

# Architecture

Dependencies point one way, `core` at the bottom:
`apps/api → packages/db → packages/core ← apps/mobile`. `core` runs identically
on phone and server — decimal.js and zod only, no Node APIs, no driver.
**`mobile` never imports `db`.**

**Modules are the primary axis; layers live inside them.**

```
apps/api/src/modules/<domain>/    operation + service + tests, one slice
apps/mobile/src/features/<name>/  ui/{atoms,molecules,organisms} · model · api
```

Only `index.ts` is public, and **no module or feature imports another** —
compose at the registry (api) or in `app/` routes (mobile). A boundary test
enforces this. Atomic tiers are a scale *inside* a UI module, never three
global folders. `common/`, `infra/` and `packages/ui` know no domain. A
component moves to shared when a *second* feature uses it, not when it looks
generic.

**A feature is a vertical slice, built in this order — hard requirement:**
schema + migration → registry operation (Zod input, `offlineEligible`, gate) →
service → tRPC procedure (dispatch only) → screen. Never start at the screen;
UI-only slices start there.

- **Routers dumb, services compute, Postgres enforces.** Every "must never"
  gets both a service check (good error) and a constraint (holds when the code
  is wrong).
- **Screens are the only layer that fetches.** A molecule calling tRPC cannot
  render in a diff preview, a test, or offline from the replica.
- **No abstraction before the third use** — no repositories over Drizzle, no
  generic helpers, no events, no managers.
- **Errors are the envelope or a throw**, never a nullish "didn't work". Rule 0
  on clients: authenticate the response before trusting its status.
- Explicit `.ts` specifiers **except files with platform variants**, which must
  be extension-less — `./Button.tsx` silently ignores `Button.web.tsx`, and
  nothing errors.
