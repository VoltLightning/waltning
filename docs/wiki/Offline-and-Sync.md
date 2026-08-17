# Offline and Sync

The phone works with no server, indefinitely — not for a few minutes while the
lift moves. Specified in
[`architecture/08`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/architecture/08-offline-and-concurrency.md)
and
[`architecture/09`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/architecture/09-connectivity.md),
with the design reviewed adversarially and several of its original claims
falsified.

## How it works

Capture queues into a **local outbox**. Figures come from the phone's own data
plus a **server checkpoint** — the replica — so your balances reconstruct
without a network. Sync is explicit and bidirectional; it is not a background
process you have to trust.

Every figure is classed **F / R / S** (see [[Money and FX]]), so what is
available offline is a declared property of each number rather than something
discovered when it renders blank on a train.

## Rule 0 — a 200 is not a success

The rule that matters most, and the least intuitive one.

**A captive portal answers `200` with HTML to every POST.** A drain that
classifies by status code will read that as "the write succeeded", advance the
queue, and discard the entry. Your capture is gone, the ledger never had it, and
nothing anywhere reports an error — the system looks perfectly healthy.

So the response must **authenticate itself before its status is consulted**: our
header, a valid tRPC envelope, the session nonce. Fail any of those and the link
is `captive`, **the queue does not advance**, and nothing is discarded.

**Rule 1:** only an error carrying our own `{error:{code,…}}` envelope may mark
an entry `blocked`. A portal's HTML cannot condemn your write.

This generalises past connectivity, and it is written into the project's rules
as a client-side habit: *authenticate the response before trusting its status.*

## Idempotency is a ledger, not an index

An outbox entry can arrive twice — the phone lost the response, not the write.
The naive fix is a unique index on an external id, but that only fires on
`INSERT`. Replay is instead a **server-side receipt**: the entry id plus a hash
of the request. A retry returns the original response; the same key with a
*different* payload is rejected rather than quietly applied.

Ordering comes from a monotonic `seq`, **not from the clock** — a phone's clock
moves backwards across a timezone change or an NTP correction, and an ordering
that depends on it reorders your writes.

## Surviving an app update

An entry can sit in the outbox across an app version bump, which is why every
operation declares an `opVersion`. A write queued by yesterday's app must either
still mean what it meant, or refuse — never be reinterpreted by today's schema
into a different write.

## A blocked outbox is a state, and it is visible

`blocked` is not always terminal, and the failure mode to avoid is a queue that
stopped silently. The spec designs the state, its visibility, and its recovery
path — the same reasoning that makes `captive` a named state with an action
attached rather than a spinner.

Several of the harder cases have their own sections: a receipt and its draft
are one intention; a residual computed from a stale minuend; set-based writes
freezing their set at approval time; bulk accept as a single undoable entry;
duplicate detection running at drain rather than only at import. `architecture/08`
also closes with **what is deliberately not built**, which is the section to read
before proposing a conflict-resolution engine.
