# 4 · Sequences

The five interactions where getting the order wrong produces a wrong number
rather than a bad experience. Everything else is CRUD through the registry.

---

## 1 · Quick add, conversational (S05 `💬`) — the loop

```mermaid
sequenceDiagram
    autonumber
    actor V
    participant UI as mobile
    participant AG as agent
    participant REG as registry
    participant DB as postgres

    V->>UI: "coffee at that place near the office"
    UI->>AG: start turn
    AG->>REG: search_transactions(payee~, recent)
    REG->>DB: trigram search
    DB-->>AG: prior Corner Café rows
    AG-->>V: "the café near the office?"
    V-->>AG: yes
    AG->>REG: get_category_tree()
    AG-->>UI: draft + trail
    Note over UI,V: draft is NOT written
    V->>UI: confirm
    UI->>REG: create_transaction(external_id=…)
    REG->>DB: insert + audit_log
```

**The draft is never a write.** The loop uses **read tools only**; the single
write happens on confirm, through the ordinary registry entry with an
`external_id` so an offline replay cannot double-post.

This is a loop because you are present and the interaction *is* the iteration.
The same task in bulk is a pipeline — see §3.

---

## 2 · Receipt → lines (§10) — pipeline, refinable

```mermaid
sequenceDiagram
    autonumber
    actor V
    participant UI as mobile
    participant OB as outbox
    participant API as api
    participant BLOB as minio
    participant M as model

    V->>UI: capture
    UI->>OB: queue (image + local id)
    OB->>API: upload when connected
    API->>BLOB: store (age-encrypted)
    API->>M: extract (one pass, schema out)
    M-->>API: merchant, total, lines, confidence
    API->>API: reconcile Σ lines vs total
    API-->>UI: proposal
    V->>UI: adjust / accept
    UI->>API: create_transaction + set_transaction_lines
    Note over API: ONE transaction (§6.10),<br/>lines are the optional breakdown
```

**One payment event, one transaction.** A receipt with fourteen lines is one row
plus fourteen `transaction_lines` — never fourteen transactions. `Σ lines` is
reconciled against the stated total and a mismatch is surfaced, not silently
apportioned.

Refinable, not a loop: a second pass re-extracts with your correction as context.
Each pass is reproducible on its own inputs.

---

## 3 · Statement import (§9) — the deterministic pipeline

```mermaid
sequenceDiagram
    autonumber
    actor V
    participant UI as web
    participant IMP as import
    participant DB as postgres
    participant M as model

    V->>UI: upload statement
    UI->>IMP: create batch
    IMP->>DB: insert import_rows (raw, unmutated)
    loop per batch of ~50
        IMP->>DB: retrieve k similar prior payees
        IMP->>M: classify (cached prefix + rows after breakpoint)
        M-->>IMP: {category, confidence, reason} per row
        IMP->>DB: store model_id, rule_snapshot, retrieved_ids
    end
    IMP->>IMP: duplicate + transfer detection (±3d, ±3%)
    IMP-->>UI: review queue
    V->>UI: accept / correct in bulk
    UI->>IMP: accept rows
    IMP->>DB: insert transactions, link import_rows.transaction_id
```

**No tool loop in the import path.** One call per batch, stable cached prefix,
retrieved context, structured output. That is what makes the tier scoreable
against 300 fixture rows — a number you can watch move when you change a model.

**`import_rows.raw` is never mutated**, so a reparse is always possible; the
provenance columns are what make the earlier answer explainable rather than
merely repeatable.

---

## 4 · Closing a tax period (J11) — where the freeze starts

```mermaid
sequenceDiagram
    autonumber
    actor V
    participant UI as web
    participant TAX as tax
    participant DB as postgres

    V->>UI: close 2026-Q1
    UI->>TAX: preflight
    TAX->>DB: verify_no_omitted_revenue()
    DB-->>TAX: n unmarked earnings-income rows
    TAX->>DB: verify_t1()
    TAX-->>UI: warnings (not blockers)
    V->>UI: acknowledge + close
    UI->>TAX: close_period(acknowledged_warnings)
    TAX->>DB: insert tax_period_locks
    Note over DB: assert_period_not_closed now refuses<br/>INSERT · UPDATE · DELETE · and MOVES
```

**The lock is append-only.** Reopening writes `reopened_at`; a close-reopen-reclose
cycle must not overwrite the first close, because reopening is audited and a
mutable column stores a state rather than a history. One row **per scheme** — a
period spanning a scheme change is normal (J11) and a single `scheme_id` cannot
represent it.

**Warnings are acknowledged, not resolved.** They are stored on the lock, so a
later reader can see what was known to be incomplete at the time. A lock that
implies "clean" would be a lie the first time you close a period with a missing
receipt.

---

## 5 · An agent write — the gate

```mermaid
sequenceDiagram
    autonumber
    actor V
    participant AG as agent
    participant G as gate
    participant REG as registry
    participant DB as postgres

    AG->>G: update_transaction(ids, {category_id, is_business})
    G->>G: any taxSensitiveFields present?
    alt contains is_business
        G-->>V: DiffCard — before/after
        V-->>G: approve
    else recategorisation only, auto-grant active
        G->>G: check agent_auto_grants (scope, expiry, count)
    end
    G->>REG: execute
    REG->>DB: write + audit_log(actor, auto flag)
    REG-->>AG: result
```

**The grant is stored, not just its consequences.** `agent_auto_grants` records
what was permitted and until when. Without it, scope and duration are enforced
only by whatever the running process happens to remember — which is not a
property you want on the one feature that bypasses approval.

**Declining returns a result, not an error.** The loop continues normally; a
refusal is an outcome the model can respond to, not an exception that breaks the
turn.

---

## Offline replay — the cross-cutting one

```mermaid
sequenceDiagram
    participant UI as mobile
    participant OB as outbox
    participant API as api
    participant DB as postgres

    UI->>OB: write while offline (local id → external_id)
    Note over OB: user keeps working
    OB->>API: replay on reconnect
    API->>DB: insert … ON CONFLICT (external_id) DO NOTHING
    Note over DB: partial unique index<br/>WHERE external_id IS NOT NULL<br/>AND deleted_at IS NULL
```

**Every write operation must be idempotent under replay.** This is not a mobile
concern that the API can ignore — it is a constraint on the registry. Two
specifics that have already bitten: `onConflictDoUpdate` against a *partial*
index raises `42P10` unless the conflict target repeats the predicate; and a
partial unique index that omits `deleted_at IS NULL` keeps a soft-deleted row's
`external_id` reserved forever, so re-import silently drops rows.
