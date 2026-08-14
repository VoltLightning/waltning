# 8 · Offline, the outbox, and concurrency

Eight defects in [`../defects.md`](../defects.md) — H7, H9, H10, H12, H13, H14,
H15, H16 — are the same gap seen from eight angles. `SPEC.md` §11 settles the
*policy* in one line: single user, two devices, **last-write-wins**, an outbox
rather than CRDTs. What it never settles is what an outbox entry *is*, and every
one of those defects lives in that space.

This closes it.

---

## The rule the rest follows from

> **An outbox entry is one user intention, not one row change.**

Every defect below is the consequence of letting an entry be a row change
instead. A bulk accept of forty rows is **one** entry. A receipt capture plus its
draft transaction is **one** entry. Approving a day-wide FX fix is one entry that
names the rows it was approved against.

An entry is:

```ts
interface OutboxEntry {
  id: string;             // client-minted UUIDv7 — this IS the external_id
  op: string;             // registry operation name
  input: unknown;         // validated against the same Zod schema as online
  deps: string[];         // ids of entries that must land first
  capturedAt: string;     // client clock, for ordering and for "as of" display
  state: 'pending' | 'sending' | 'blocked';
  attempts: number;
  lastError?: string;
}
```

`id` doubles as the idempotency key, so replaying the whole queue is safe. The
partial unique index on `external_id WHERE external_id IS NOT NULL AND deleted_at
IS NULL` is what enforces it — and both predicates matter, since a soft-deleted
row that kept its key reserved would make re-sending fail forever.

---

## H7 · A receipt and its draft are one intention

**The defect.** You save a transaction, then the queued image drains separately
and creates a second row for the same payment — violating §6.10 directly. The
client-UUID defence does not help, because these are two genuinely distinct
client operations.

**Decided.** The draft mints the transaction id **before** the image is queued,
and the upload entry carries it as `deps` and as its `transaction_id`. The image
attaches to a row that already exists, or waits. It never creates one.

If the transaction entry is later discarded — you cancelled the draft — the
dependent upload is discarded with it. An orphaned image is a storage cost; an
orphaned *transaction* is a wrong number.

---

## H9 · A residual computed from a stale minuend

**The defect.** S14 renders the settle sheet from cache while offline and
computes the residual — the screen's own stated safety mechanism — against a
balance that may have moved. Same shape on the unsettled banner, where a second
allocation drives a clearing account negative.

**Decided: the client's residual is an estimate and is labelled as one; the
server recomputes on commit.**

- Offline, the sheet shows `as of 14:20` beside the balance. Not a warning
  banner — a timestamp, because the number is usually right and a banner that
  cries wolf gets dismissed.
- `settle_debt` takes the **amount being settled**, never the residual. The
  server derives the residual from live data.
- If the live residual differs from the client's stated one, the entry does not
  fail. It applies the settlement and surfaces the corrected residual in the
  drain report — because the money genuinely moved, and refusing to record it
  because a *display* was stale is the worse error.

**A settlement never implicitly clears a balance** (§6.6). That rule is what
makes this safe: the remainder is always stated, so a stale minuend produces a
wrong *expectation*, never a wrong ledger.

---

## H10 · Set-based writes freeze their set at approval

**The defect.** S09's day-wide FX fix says "and 4 other rows" at approval and
applies to whatever matches at drain — 23 rows if an import landed in between, at
a rate you asserted about one purchase.

**Decided: an approved set is a list of ids, never a predicate.** The operation
input carries the explicit ids the user was shown. Rows that arrived afterwards
are not in it, by construction.

If any id has since changed in a way that affects the operation, those rows are
skipped and named in the drain report. This applies to every set-based
operation — `rerate_transactions`, `categorize_batch`, bulk accept — and it is a
registry-level rule, not a per-screen one: **an operation whose input is a
predicate cannot be approved, because what you approved is not what will run.**

---

## H12 · Bulk accept is one entry, so undo is one removal

**The defect.** Bulk accept is one undoable unit in the UI and N entries in the
outbox. Undo queues compensating writes *behind* the unsent accepts, so a partial
drain commits rows from an operation you explicitly undid.

**Decided.** Bulk accept is a **single** entry containing all N ids. Undo before
it drains removes it from the queue — nothing was sent, so nothing needs
compensating. Undo after it drains queues a genuine compensating entry, which is
correct because the write really happened.

This is the rule at the top doing its work: N entries was the bug.

---

## H13 · Client ids are the identity; names are display

**The defect.** An offline `create_counterparty` collides on a unique name, the
server rejects it, and five transactions reference an id that does not exist.
Ordering was preserved and ordering was not the problem.

**Decided.** The client mints the entity id. Dependents reference it, and the
server accepts that id as given — so a dependent is never orphaned by a
name collision.

A name collision is then not an error at all but a **merge decision**: the entity
is created with the client's id and a disambiguated name, and surfaces on S15 as
a merge candidate against the existing one. That reuses machinery already
specified — S15's merge is reversible indefinitely and archives rather than
deletes — instead of inventing a failure path.

This is exactly why `accounts_name_uq` is on `lower(btrim(name))` and the primary
key is a UUID: **names are display, identity is the id** (§6.1).

---

## H14 · Duplicate detection runs at drain, not only at import

**The defect.** A capture queued on a phone is invisible to the import's
duplicate detection, which claims to run against "the whole ledger" — a ledger
missing the other writer.

**Decided.** Duplicate detection is a **server-side check on commit**, for every
path, not a step inside the import pipeline. Import calls it; so do
`create_transaction` and the outbox drain.

The window and tolerance are already defined once (`computations.md` §9: ±3 days,
±3% cross-currency), so this is a relocation, not a new rule. A drained capture
that matches an imported row surfaces as a duplicate to resolve with the three
actions S02 defines — **separate, skip, supersede** — rather than landing
silently.

**It cannot block the write.** A queued capture that turns out to be a duplicate
is flagged, not refused; refusing would lose data captured in good faith.

---

## H15 · A blocked outbox is a state, and it is visible

**The defect.** A constraint violation on drain wedges the queue forever, with no
`outbox blocked` state anywhere in the state matrix. The user sees pending
markers that never clear, indistinguishable from a slow network.

**Decided.** Three states, and the third is new:

| State | Meaning | Surface |
|---|---|---|
| `pending` | Waiting for connectivity | The ordinary dot |
| `sending` | In flight | — |
| `blocked` | The server refused it, and retrying will not help | **Banner + S30 count + the row itself marked** |

A `4xx`-class refusal — a constraint violation, a closed period, a validation
error — moves the entry to `blocked` immediately rather than retrying. Retries
are for transport failures only. `5xx` and network errors back off and retry.

**A blocked entry does not block the queue.** Entries behind it drain, unless
they list it in `deps`. This is the difference between one bad row and a wedged
device.

The entry is inspectable, editable and discardable from S30 — which is the
screen `06-quality-attributes.md` names as the operational surface, and this is
its fourth silent failure made loud.

---

## H16 · `update_transaction` is a patch, with a version

**The defect.** Undefined as patch-or-replace. If it carries the whole entity, a
phone's category edit reverts a laptop's `is_business` and `ryczalt_rate`, and
the row silently leaves `tax_ledger`.

**Decided: every `update_*` is a patch.** Only the fields present in the input
are written. This is the registry-wide convention, so no operation has to be
inspected to know its semantics.

Patch semantics alone still lose an edit when two devices touch the *same* field,
so the input also carries the `updated_at` the client last saw:

- Same field, different values → **last-write-wins** per §11, but the overwrite
  is recorded in `audit_log` with both values, so it is visible rather than
  merely lost.
- Different fields → both land. This is the common case and the one full-entity
  replace got wrong.
- A `tax_sensitive` field with a stale version → **blocked**, not overwritten.
  These are the fields §11.2 already gates per field even under an auto-grant;
  silently losing one is how a filed figure moves.

---

## What is deliberately not built

**No CRDTs, no vector clocks, no operational transform.** One user with two
devices editing the same field within a sync window is rare, and the cost of
being wrong is one audited overwrite. The machinery would exceed the ledger.

**No offline reads of derived tax figures.** They depend on rates, period locks
and residency, all of which the device may hold staler than it knows. S28 is
online-only, and that is a smaller loss than a tax figure computed from a stale
lock.

**No conflict resolution UI.** Last-write-wins with an audit entry, plus
`blocked` for the cases that must not resolve silently. A merge UI for a
single-user system is a screen you would have to learn to use twice a year.
