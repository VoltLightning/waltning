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
