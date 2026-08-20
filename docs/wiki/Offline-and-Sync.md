# Offline and Sync

The phone works with no server, indefinitely — not for the few minutes while a
lift moves, and not only after it has once met a server. It holds your whole
history from the first time you open it, not a recent window, so there is
nothing it needs to fetch before daily use works. Specified in
[`architecture/08`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/architecture/08-offline-and-concurrency.md)
and
[`architecture/09`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/architecture/09-connectivity.md),
reframed by
[`architecture/14`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/architecture/14-local-first.md)
to make that completeness the point rather than a side effect, and reviewed
adversarially throughout — several claims in early drafts were shown to be
wrong and are now recorded as such.

## The two halves

Anything you record goes into a **queue on the phone** — a local database that
survives being closed, killed or restarted. Anything you *read* comes from the
phone's own copy of your ledger — your whole history, not a recent window —
plus whatever is still sitting in the queue.

```mermaid
graph LR
    subgraph phone["on the phone"]
        Q["<b>queue</b><br/><i>what you have done<br/>and the server has not seen</i>"]
        REP["<b>local copy</b><br/><i>the server's data<br/>as of the last sync</i>"]
    end

    Q --> CALC["what you see"]
    REP --> CALC

    Q -->|"when a network appears"| API["api"]
    API -->|"a fresh copy"| REP
```

With no backend, `local copy` is simply your ledger — there is nothing to sync
it against, so it never falls behind and nothing here is provisional. Add a
backend later and the same box starts refreshing from the server on top of
whatever you already captured; the balance math underneath does not change.

**Your balance is the copy plus the queue.** That is why a figure stays correct
while you are offline instead of freezing at whatever it was when the signal
dropped — the phone folds in what it knows you have done.

Draining your queue to the server is **automatic** once you have a backend —
there is no sync button, and nothing you have to remember to trigger. That is
not something you take on faith: Rule 0, below, is what proves a response
really came from your server before anything is marked done. What sync is
*not* is a two-way merge you have to referee — a write is one-way intent,
replayed to the server, which admits it or refuses it; reading back is a plain
refresh from the server's data. The only moment sync asks you anything is a
genuine conflict — see "When two devices really disagree", below — and
tax-relevant fields always ask, regardless of anything else.

Which numbers can be shown offline is a **declared property of each number**,
not something you find out when a screen renders blank on a train — see the
F / R / S classes in [[Money and FX]].

## Rule 0 — a 200 is not a success

The most important rule here, and the least intuitive.

A **captive portal** is the sign-in page a café or airport Wi-Fi shows before it
lets you online. It intercepts everything. Crucially, it does not return an
error — it answers *every* request, including a POST of your transaction, with
`200 OK` and a page of HTML.

Software that decides "did this work?" by looking at the status code will read
that as success, drop the entry from the queue, and move on.

```mermaid
sequenceDiagram
    autonumber
    participant Q as queue
    participant P as café Wi-Fi portal
    participant API as your api

    Note over Q,API: what a naive client does
    Q->>P: send the queued transaction
    P-->>Q: 200 OK  ("Sign in to continue")
    Q->>Q: 200 means success — drop the entry
    Note over Q: your capture is now gone.<br/>no error anywhere. sync "succeeded".
```

The write never reached the ledger, the entry is deleted, and every indicator in
the app is green. This is the failure mode this project fears most: **the system
looks healthier than if it had simply failed.**

So a response has to **prove it is ours before its status code counts for
anything** — our own header, a well-formed reply of the shape our API sends, and
the session's one-time value.

```mermaid
sequenceDiagram
    autonumber
    participant Q as queue
    participant P as café Wi-Fi portal
    participant API as your api

    Note over Q,API: what this client does
    Q->>P: send the queued transaction
    P-->>Q: 200 OK  ("Sign in to continue")
    Q->>Q: is our header there? is the reply our shape?<br/>does the session value match?
    Q-->>Q: no → this is not our server
    Note over Q: link = captive · the queue does not advance ·<br/>nothing is deleted · you are shown<br/>"This Wi-Fi wants you to sign in"
```

**Rule 1 follows from it:** only an error that arrives in our own error format
may mark an entry as rejected. A portal's HTML cannot condemn your write.

This generalises well past connectivity, and it is written into the project's
rules as a habit for any client: **check that a response is really from who you
think, before you trust what it says.**

## The life of a queued entry

```mermaid
stateDiagram-v2
    [*] --> pending: you record something
    pending --> sending: a network appeared
    sending --> pending: captive portal, timeout,<br/>or anything unproven
    sending --> done: the server admitted it
    sending --> blocked: our own error said no,<br/>with a reason
    sending --> stalled: server errors, retries<br/>ran out
    blocked --> pending: you fixed the cause
    stalled --> pending: you retried it
    done --> [*]

    note right of blocked
        "retrying will not help",
        so it must say why and
        offer a way out. `stalled`
        claims only that retries
        ran out.
    end note
```

**The transition that is missing is the point.** There is no path from `sending`
straight to `done` on a response that has not proved itself — which is the one
arrow standing between a café Wi-Fi and a week of deleted captures.

## When two devices really disagree

A write does not race the wall clock. It carries **the version it last
read** — a token on the row, not a timestamp to rank — and the server asks one
question: *did this field change under you since you read it?*

- **No** → the write lands. No prompt.
- **Yes** → that is a real conflict. Different fields on the two sides still
  merge with no prompt at all — split lines sync with their parent as one
  unit, and the several fields that make up a transfer's two currency legs
  count as one field for this purpose, or a merge could produce a plausible
  number that neither device actually held. Only when the *same* field
  diverged does the app ask which value to keep, and the tax-sensitive fields
  (`is_business`, the ryczałt rate and activity, a counterparty's tax id, the
  date, account ownership, whether a currency is the pivot) **always ask**,
  whatever else is set.

**Why not "whichever arrived last wins":** a phone offline for nine days can
land an edit that is *older* than a correction another device already synced.
Ranking by arrival time would silently overwrite the newer value with the
stale one. Comparing versions instead means a newer edit is never lost to an
older one, no matter which device's clock is right or which one reached the
server first. This is the clock-merge `architecture/08` spends a section
refusing.

## Sending twice is safe

The phone may send the same entry twice. It lost the *response*, not the write,
and it has no way to tell those apart.

The obvious fix is a unique index on some external id — but a unique index only
objects on insert, so it does nothing for an action that updates. Instead the
server keeps a **receipt**: the queue entry's id plus a fingerprint of the
request. Send it again and you get the original answer back without the work
happening twice. Send *different* content under the same id and it is rejected
rather than quietly applied.

Order comes from a counter that only ever goes up — **not from the clock.** A
phone's clock jumps backwards when it crosses a timezone or corrects itself
against a time server, and ordering by timestamp would silently reorder your
writes around those jumps.

## Surviving an app update

An entry can sit in the queue across an app version change, which is why every
action declares a version. A write queued by last week's app must either still
mean exactly what it meant then, or refuse — it must never be reinterpreted by
this week's schema into a *different* write.

## The harder cases

`architecture/08` works through the ones that are not obvious: a receipt photo
and its draft transaction are one intention, not two; a "pay off the remainder"
amount calculated against a total that has since changed; a bulk action freezing
the set of rows it applies to at the moment you approve it, not at the moment it
runs; accepting fifty suggestions as one undoable step; duplicate detection
running when the queue drains rather than only at import.

It closes with **what is deliberately not built** — the section to read before
proposing a conflict-resolution engine. One user with two devices is not the
problem that CRDTs solve, and the cost of pretending otherwise is a system
nobody can reason about.
