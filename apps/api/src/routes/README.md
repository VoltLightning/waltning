# `routes/` — tRPC routers

**Routers are dumb.** A procedure authenticates, dispatches to a registry
operation, and returns the envelope. Nothing else.

An `if` in a router is logic that has leaked out of a service into a place with
no tests and no audit trail — and, because the agent calls the registry
directly rather than going through HTTP, logic here is logic the agent silently
does not get. That is the drift the registry exists to prevent.

Most of this directory should eventually be *generated* from the registry rather
than hand-written. Until that generation exists, each domain router is a thin
hand-written mapping, and it stays thin.

```
routes/
  transactions.ts
  accounts.ts
  index.ts        merged into appRouter
```
