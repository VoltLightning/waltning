# The Operation Registry

**Every write in the system is a named, validated, audited operation in one
registry.** Screens and the agent are two consumers of the same declarations.
There is no second path to the ledger, and in particular the agent does not get
a weaker one.

Specified in `SPEC.md` §11.0 and enumerated in
[`operations.md`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/operations.md).

## Why a registry at all

An LLM with database access is an LLM that can write any statement it can
compose. The alternative most systems reach for is to generate SQL and review
it, which asks a human to spot a wrong `WHERE` clause in a query they did not
write — a review that looks like a control and functions as a rubber stamp.

Here the agent gets **typed tools, not SQL** (§11.1). It cannot express an
operation that does not exist, so the question stops being "is this query
safe?" and becomes "should this operation exist?" — asked once, at design time,
by someone with the whole system in view.

The registry is also the reason the two consumers cannot drift. One declaration
produces both the tRPC procedure and the agent tool schema. A write that a
screen can perform and the agent cannot is not a thing you can accidentally
build.

## What a declaration carries

```ts
{
  name, input, kind,              // Zod schema; read or write
  autoEligible, offlineEligible,  // may it auto-run? may it queue offline?
  opVersion,                      // the outbox replays across app versions
  taxSensitiveFields,             // fields that always need approval
  audit,                          // entity, action, before/after
  description,                    // what the agent is told it does
  handler,
}
```

`offlineEligible` and `opVersion` exist because the phone's outbox can hold a
write for days across an app update — see [[Offline and Sync]].

## Three things attached at declaration time

Each of these was, at some point, in the wrong place. The pattern in all three
is the same: a control that depends on every future caller remembering is not a
control.

**The audit row.** Not written by the router, because the agent calls the
registry directly and never travels that path — it would have produced no audit
trail, silently. Not written by each handler, because one eventually forgets.
It is attached when the operation is *declared*, so there is no version of the
operation without it.

**The transaction.** The handler, the audit row and the idempotency receipt
share one transaction. This was enforced by types rather than by care: the
receipt functions take a `Transaction`, not a database handle, so writing a
receipt outside the transaction **fails to compile**. Before that change, a
receipt written outside the transaction passed all nine of the tests written to
cover it.

**Idempotency.** An outbox entry can arrive twice — the phone lost the response,
not the write. Replay is keyed on the entry plus a hash of the request, so a
retry returns the original response and a *different* payload under a reused key
is rejected rather than silently applied.

## The gate: why the tax boundary is a field boundary

Writes gate by default. A bounded, opt-in grant can lift that for named
operations — never permanently, never for deletes or configuration.

The subtlety is that **the grant is an operation boundary and the tax boundary
is a field boundary**, and they do not line up. `update_transaction` is
recategorisation — the obvious thing to auto-grant — and it is also the only way
to write `is_business`. Grant recategorisation for a session and one tool call
could move rows out of the tax view with no approval and no distinguishing
mark. Under ryczałt the damaging direction is *out*.

So eligibility is evaluated against **the fields a call actually writes**. Same
operation, same grant: `{category_id}` runs; `{category_id, is_business}` stops
for approval, and the card shows only the sensitive field with the rest already
applied.

The sensitive-field check runs *before* the grant check, so the recorded reason
is why the call was really gated. An audit trail saying `write-by-default` for a
tax-sensitive write reads wrong six months later.

**The check that earns its place guards an operation that does not exist yet.**
Any operation whose input schema accepts a tax-sensitive field must declare it,
and forgetting fails the build — because whoever writes `update_transaction`
will be thinking about categories, not about `is_business`. The converse is
checked too: you cannot declare a field you cannot write, which catches the
copy-paste that would otherwise look like caution.

## What is deliberately not an operation

Reads. They auto-run and are never gated — the agent is expected to look around
freely, and a confirmation prompt on every query trains you to click through
prompts.

Also not operations: anything that is a *report* rather than a write. A category
change can move tax scope indirectly, and it is deliberately absent from the
sensitive list — that surfaces at period close as a report (§13.4). The point of
the list is that nothing silently changes a filed figure, not that no figure may
ever move.

`operations.md` closes with the two inconsistencies that compiling the list
caught, which is the argument for having compiled it.
