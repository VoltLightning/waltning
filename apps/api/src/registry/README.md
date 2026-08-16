# `registry/` — the operation layer

**This is the controller layer.** In a conventional stack a controller sits
between a route and a service: it validates input, applies policy, calls the
service, shapes the response. Here that job belongs to the *operation registry*
(`operations.md`), and it does more than a controller usually does — the tRPC
router **and** the agent's tools are both generated from these declarations, so
there is no operation the UI can perform that the agent cannot, and the two can
never drift.

One file per operation, grouped by domain:

```
registry/
  transactions/create-transaction.ts
  transactions/update-transaction.ts
  accounts/reconcile-account.ts
  index.ts                     the map every consumer reads
```

Each declaration carries — no exceptions, because the registry writes the audit
row and decides the gate from these fields:

| | |
|---|---|
| `name` | `verb_noun`, stable. Appears in `agent_tool_calls.tool` and audit entries |
| `input` | A Zod schema. Validates the tRPC call *and* the model's tool call |
| `write` | Decides the approval gate. Reads auto-run; writes render a `DiffCard` |
| `autoEligible` | Whether a bounded auto-mode grant may cover it. Most writes: no |
| `offlineEligible` | Whether it may enter the outbox. A contract test asserts no ineligible operation can |
| `description` | Written for the model to read. This is the tool's documentation |
| `handler` | Orchestration only — calls services, returns a result |

**A handler does not contain business logic.** It resolves inputs, calls one or
more services in a transaction, and returns. If a handler is doing arithmetic or
deciding a rule, that belongs in `services/`.
