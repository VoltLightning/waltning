# `modules/` — one folder per business domain

The primary axis of this codebase. A module owns everything about its domain:
the registry operations, the service that implements them, its schemas, and its
tests — the *vertical slice*, not one horizontal layer of it.

```
modules/currencies/
  index.ts                        the module's public API
  get-currencies.operation.ts     registry declaration + handler
  currencies.service.ts           domain logic
  currencies.test.ts              tested with the rest of it
```

**A module never imports another module's internals.** Only `index.ts` is
public, and composition happens at the registry — never module-to-module. Two
modules that need each other are usually one module, or want a third they both
depend on. A boundary test enforces this rather than trusting the habit.

**Layers still exist; they are just *inside* the slice.** The operation
validates, gates and audits; the service computes; Postgres enforces. What
changed is that those three live next to each other, so a change to how
currencies work is one folder rather than three.

What is *not* a module: `common/` (errors, pagination — no domain knowledge),
`infra/` (database, blobs, model providers), `registry/` (the mechanism and the
composition), and `http/`, `trpc/`, `middleware/`, `config/` (the composition
root). None of them may import a module except the registry, and it imports
only public APIs.
