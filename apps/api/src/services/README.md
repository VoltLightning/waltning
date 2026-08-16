# `services/` — domain logic

One module per aggregate, named for the domain rather than the screen:
`transactions`, `accounts`, `fx`, `recurring`, `import`, `tax`, `agent`.

**Services compute; Postgres enforces.** Anything phrased as "must never" gets
both — the service check, so the error message is good, and the constraint, so
it still holds when the service is wrong. Every critical defect in the register
that was *enforced* rather than *asserted* was enforced at the database.

Rules:

- **No HTTP.** A service never sees a request, a header, or a tRPC context. It
  takes plain arguments and a transaction handle.
- **No Zod at the boundary.** Input is already validated by the registry; a
  service takes typed values.
- **Money through `money.ts`.** Never JS numbers, never `Number(...)` on an
  amount.
- **Transactions are passed in, not opened here** — an operation that spans two
  services must be able to put them in one transaction.
- Services may call other services. They may not call the registry: dependencies
  point downward, and a cycle through the registry is how a gate gets bypassed.
