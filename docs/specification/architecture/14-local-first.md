# 14 · Local-first, and what that does not mean

**The phone is a complete finance app. The server admits every write.**

Those two sentences are the whole design, and holding them together is the
point. An earlier exploration collapsed them — "the phone is complete, so the
phone is authoritative" — and five independent adversarial reviews took it
apart, all landing on one root cause: **the guarantees this ledger depends on
live in Postgres, and SQLite cannot host them.** Closed periods, T1 tax
isolation, split-line sums, one-pivot, FX validity — every one is a trigger, a
`CHECK`, an `EXCLUDE`, or a role grant. Making the phone the record of truth
moves the record to the one place the guarantees cannot hold.

So this document draws the line the rest of the specification now depends on.

## 14.0 Complete is not authoritative

Two properties that were conflated, now separated:

| | Means | Where it lives |
|---|---|---|
| **Complete** | Holds the whole ledger, reads and captures offline, feels autonomous | The phone |
| **Authoritative** | Admits writes, is the record of truth, hosts the guarantees | The server |

The phone is **complete and not authoritative.** It holds every transaction,
computes every figure it can locally, and captures into an outbox — but a write
is one-way *intent*, replayed to the server, which admits it or refuses it. There
is no second writer of record and therefore no bidirectional merge.

This is not a retreat to a thin client. The phone held a **400-row window**
before; it now holds the **whole ledger** (~8,000 rows, single-digit
megabytes). That one change is what makes it feel autonomous — the window was the
only reason it ever needed the server to answer a question. Reads are local;
history is complete; nothing daily needs a network.

## 14.1 The bricks

Independent, and each one improves the experience without the next:

- **Brick 1 — the phone alone.** A complete finance app: whole ledger, offline
  indefinitely, scales to any screen. Captures into an outbox. Durability is an
  **app-owned encrypted export** (§14.4). Tax figures are read-only *estimates*,
  labelled as such — filing-grade tax needs the server, because T1 is a Postgres
  role and has no device equivalent.
- **Brick 2 — add a backend, over Tailscale.** It becomes the writer of record
  and the durable copy. The phone's outbox drains into it; the phone reverts to a
  *complete replica plus outbox*. Filing-grade tax, continuous backup, and the
  heavy work (import, classification, FX, scheduled analysis) arrive together.
  Adding it is a **one-time seed-from-phone migration**, not a merge.
- **Brick 3 — the web dashboard, on the backend.** Full read/write, because the
  backend is the writer of record. No contradiction: the dashboard writes because
  the backend admits writes.

**The honest cost:** durability is not optional. Brick 1's self-backup is real
but weaker; Brick 2 is where durability stops being the owner's job.

## 14.2 Conflicts: version, never clock

A write does not race a wall clock. It carries **the version it last read**
(`updated_at` as a token, not a timestamp to rank), and the server asks a single
question: *did this field change under you since you read it?*

- **No** → the write lands.
- **Yes** → it is a real conflict. A same-field divergence follows a setting —
  *latest applied wins* or *ask* — and the **tax-sensitive set always asks**
  (`is_business`, `ryczalt_rate`, `ryczalt_activity`, `counterparty_tax_id`,
  `date`, `accounts.ownership`, `currencies.is_pivot`).

**Why not "latest timestamp wins":** a phone offline for nine days lands an edit
older than a correction another device already synced, and "latest" — meaning
whichever reached the server last — silently overwrites the newer value. This is
the clock-merge `08` spends a section refusing. Comparing versions cannot lose a
newer edit to an older one.

Different fields on the two sides merge with no prompt. **Non-independent fields
are not independent conflicts** — split lines sync as a unit with their parent,
and the four faces of a transfer (`amount_original`, `to_amount`, `fx_rate`,
`to_fx_rate`, two of which feed generated columns) are one field for this
purpose, or a merge produces a plausible wrong number that neither device held.

## 14.3 Durability graduates

- **Brick 1:** an app-owned, age-encrypted export the owner controls. The key
  lives in **iCloud Keychain** (Apple's HSM-backed escrow, which Apple cannot
  read); the ciphertext goes somewhere Apple is **not** — a Mac, a NAS, later the
  backend. **One vendor never holds both halves.** This is a stated dependency on
  Apple, not a hidden one, and it is the honest version of "your data, your
  phone, back it up yourself."
- **Brick 2:** the server is the durable copy — `pg_dump`, age-encrypted, offsite,
  with a restore drill. This is the existing design and it is unchanged.

## 14.4 What this document changes elsewhere

Alignment work, so no surface still describes the collapsed design:

- **The replica holds the whole ledger.** No 400-row window, no day-aggregate
  tier as a size compromise, **no eviction, no replica TTL as a deletion of the
  record.** A phone that has met a backend keeps a complete copy; the TTL that
  dropped it is deleted, not re-tuned.
- **The phone is complete but its writes are still one-way intent.** The outbox,
  idempotency ledger, `seq` ordering and upcasters (`08`) are unchanged and
  vindicated — they were always the right model.
- **Web-only screens are wide, not web.** Screens marked web-only for
  *information density* stay dense; the phone renders them when given the screen
  (RN Web, DeX, an iPad). "Web-only" that meant "needs a browser" becomes "needs
  the width."
- **File protection is class A**, not AFU — the key is evicted on lock. Nothing
  needs the database while the phone is locked, and `§5.7` already argued for this
  and did not take it.

## 14.5 What held, and stays

The outbox and idempotency model, the F/R/S discipline (now simpler — the phone
holds enough to compute more locally), server-side rate stamping, T1 as a role
grant on the server, passkeys as the perimeter, and "no forwarded port in any
mode." The reframe is a *correction of scope*, not a new architecture: it
enlarges the replica, separates complete from authoritative, and deletes the
mechanisms that only made sense for a cache.
