# The operation registry

**`SPEC.md` §11.0 says the agent is not a separate surface with its own
hand-written tool list.** Every capability is a named, typed operation in one
registry; the tRPC router and the agent's tools are both generated from it.

That claim has been in the spec since the beginning with nothing behind it. This
is the registry — compiled from every screen's §5 Data section, which is where
each operation was actually named.

```
                    ┌────────────────────────┐
                    │  operation registry    │
                    │  typed · validated ·   │
                    │  audited · write-flag  │
                    └───┬────────────────┬───┘
                        │                │
                  tRPC router      generated tools
                        │                │
                   ┌────▼────┐      ┌────▼────┐
                   │   UI    │      │  agent  │
                   └─────────┘      └─────────┘
```

**The consequence worth stating plainly:** there is no operation the UI can
perform that the agent cannot. Adding a screen action adds an agent tool for
free, and the two can never drift, because they are the same declaration.

---

## Every operation carries

| | |
|---|---|
| **Name** | `verb_noun`, stable — it appears in `agent_tool_calls.tool` and in audit entries |
| **Input** | A Zod schema. The same one validates the tRPC call and the model's tool call |
| **Write flag** | Decides the approval gate. Reads auto-run; writes render a `DiffCard` (§11.2) |
| **Auto-eligible** | Whether a bounded auto-mode grant may cover it. Most writes: no |
| **Audit** | Entity, action, actor, before/after — written by the registry, not by each implementation |
| **Description** | Written for the model to read, not for a developer. This is the tool's documentation |
| **`offlineEligible`** | Whether this operation may enter a device outbox. `run_import`, `close_period`, `rerate_transactions`, `materialize_occurrence` and every migration operation are **false** — they need server state the device cannot have. A §15.1 contract test asserts no `offlineEligible: false` operation can be constructed as an outbox entry |
| **`opVersion`** | The payload shape version. Upcasters chain every historical version to current at drain time, and the server accepts N−2 — a phone can be offline across two releases (`architecture/08`) |

**Audit is the registry's job, not the operation's.** An operation that had to
remember to log itself is an operation that will eventually forget.

---

## Reads — auto-run, never gated

| Domain | Operations |
|---|---|
| Transactions | `search_transactions` · `get_transaction` · `get_audit_log` |
| Balances | `get_balances` · `get_accounts` |
| Taxonomy | `get_category_tree` · `get_counterparties` |
| Analysis | `spend_by_category` · `spend_by_period` · `compare_periods` · `income_vs_expense` |
| Debt | `counterparty_balances` · `find_unsettled` |
| Import | `get_import_batch` · `get_import_rows` · `get_rules` |
| Recurring | `get_recurring_rules` · `get_projections` |
| FX | `get_currencies` · `get_fx_rates` · `get_fx_coverage` |
| Dashboard | `get_active_layout` · `get_widget_catalogue` |
| Agent | `get_agent_sessions` · `get_messages` |
| Introspection | `get_operation_catalogue` |
| Memory | `get_memory` (§11.6) |
| Verification | `get_invariant_results` (§15.1) |

`get_operation_catalogue` is not decoration. **An agent that cannot enumerate
its own capabilities cannot be asked open questions about them** (§11.0), so the
registry is readable through the registry.

### Two ways to reach a read

**As a tool**, by the surfaces that are loops — the conversational capture mode
on S05, and the agent. They call `search_transactions` mid-turn because they may
need to ask you something about what they found.

**As retrieval**, by the surfaces that are pipelines — classification, receipt,
voice. The same reads run *before* the model call and their results go into the
prompt. `search_transactions` for similar prior payees, `get_category_tree`,
`get_accounts`. Identical data, no loop, and reproducible (§11.4).

That is why a classification can say *"matches prior Migros rows in this
account"* without being agentic. It was handed the history; it did not go
looking.

### No surface but the agent is generated a write

Not a restricted write, not a gated write — **no write operation exists** for
the capture loop or for any pipeline. Their output is a draft, and the draft is
the proposal.

**The boundary is which tools exist for that surface**, not which ones the model
is asked not to call. A tool that was never generated cannot be invoked by a
confused model, by a prompt injection inside a receipt image, or by a future
refactor that forgets why the rule was there.

---

## Writes — every one gated

Auto column: ✅ eligible for a bounded auto-mode grant, ❌ never.

### Transactions

| Operation | Auto | Notes |
|---|---|---|
| `create_transaction` | ❌ | The core write. One payment event, one row (§6.10) |
| `update_transaction` | ✅ | Field-level; `is_business` flips are audited (§13.1) |
| `delete_transaction` | ❌ | Soft. Never auto — deletion is the one thing you cannot un-notice |
| `set_transaction_lines` | ✅ | The optional breakdown (§10.3) |
| `categorize_batch` | ✅ | The bulk path; one `DiffCard` states the affected count |
| `supersede_transaction` | ❌ | Import row replaces a manual entry, reattaching its receipt (S02) |
| `attach_receipt` | ✅ | |
| `rerate_transactions` | ❌ | Bulk FX re-rate; **never touches a closed period** (S18) |

### Accounts, categories, counterparties

| Operation | Auto | Notes |
|---|---|---|
| `create_account` · `update_account` · `archive_account` · `reorder_accounts` | ❌ | Structural |
| `reconcile_account` | ❌ | **Was missing entirely.** Writes one `adjustment` transaction for the difference between the computed balance and one you observed, and updates `expected_balance`. Never a silent balance overwrite — the balance is derived (`computations.md` §2) and there is no field to set. The agent may *notice* a discrepancy; it cannot assert what you counted |
| `create_category` | ❌ | The agent **proposes**; it never creates silently (§11.5) |
| `rename_category` · `reparent_category` · `convert_leaf_group` | ❌ | |
| `archive_category` | ❌ | S19's fourth verb, and it was missing here. Archiving is not deletion — a leaf with history keeps it and stops being offerable (`TAXONOMY.md` R2). Refused on a group with unarchived children |
| `merge_categories` | ❌ | Not reversible in one step (J12) |
| `create_counterparty` · `update_counterparty` | ✅ | |
| `merge_counterparties` · `unmerge_counterparties` | ❌ | Reversible, and still never automatic (S15) |
| `record_distinct_counterparties` | ✅ | The *these are different* decision |

### FX

| Operation | Auto | Notes |
|---|---|---|
| `sync_fx_rates` · `force_sync` · `backfill_fx_rates` | ✅ | Idempotent and safe to repeat |
| `set_manual_rate` · `clear_manual_rate` | ❌ | An assertion about a figure nobody published |
| `add_currency` · `archive_currency` · `set_rate_source` · `set_pinned` | ❌ | |
| `change_pivot` | ❌ | `ConfirmDialog`. Should essentially never happen (§7.0) |

### Import, rules, recurring, receipts

| Operation | Auto | Notes |
|---|---|---|
| `run_import` · `accept_row` · `skip_row` | ✅ | Undoable as one unit (§8.4) |
| `propose_rule` · `create_rule` · `update_rule` · `disable_rule` · `reorder_rules` | ❌ | A rule changes future classification |
| `create_recurring` · `update_recurring` · `disable_recurring` | ❌ | |
| `materialize_occurrence` | ✅ | Posts an occurrence. The unique index on `(recurring_id, occurrence_date)` stops **this rule** firing twice — it does **not** stop a hand-entered duplicate, whose `recurring_id` is NULL and which is therefore not in the index at all (C8, §14.4) |
| `link_occurrence` | ❌ | The other half of C8's fix, and it was missing. Stamps `recurring_id` and `occurrence_date` onto a row **you already entered by hand**, which both satisfies the occurrence and puts the row into the index so the question cannot be asked twice. Offered instead of *Post* when an unlinked row matches within ±3 days and ±1% on the same account and currency |
| `reclassify` | ❌ | **Was referenced in four documents and defined in none.** Re-runs classification against **today's** ledger, so it is expected to differ from the original — which is exactly why it is not called "replay". Replay pins `model_id`, `rule_snapshot` and `retrieved_ids` and reproduces the recorded answer (C10); this does not. Never auto: it rewrites rows you already accepted |
| `upload_receipt` · `extract_receipt` | ✅ | |

### Dashboard, export, tax, system

| Operation | Auto | Notes |
|---|---|---|
| `create_layout` · `set_active_layout` · `add_widget` · `update_widget_config` · `remove_widget` | ✅ | *"Put family spending on my dashboard"* is an ordinary write (§11.0) |
| `export_excel` · `record_export` | ✅ | |
| `settle_debt` | ❌ | **Was missing, and H9's whole resolution depends on it.** Takes the amount that changed hands and the debt it discharges — never the residual, which the server derives from live data and returns. S14 previously called `create_transaction`, which has no notion of a residual and no channel to return a corrected one |
| `get_targets` · `create_target` · `update_target` · `delete_target` | ❌ | **These were missing entirely** — `computations.md` §11 defines progress and no operation exposed it. Structural, so never auto-eligible. A target is period-to-date against `spend_to_date(p, scope=mine, capital excluded)`; **not** an envelope budget (N7) — no rollover, no allocation, and going over is information rather than an error |
| `add_scheme_period` · `add_residency_period` · `update_registration` · `set_ryczalt_rate` | ❌ | **Tax scope. Never eligible** (§11.2) |
| `close_period` · `reopen_period` | ❌ | Freezes or unfreezes a filed period (§13.4) |
| `run_backup` | ✅ | Idempotent |
| `run_restore_drill` | ❌ | Expensive, and ends in a judgement (S30) |
| `run_invariant_checks` | ✅ | Read-only against the ledger; writes only its own result rows (§15.1) |
| `run_migration` | ❌ | Runs in one transaction; rolls back entirely on failure (§8.4) |
| `send_message` · `grant_auto_mode` | ❌ | A grant that could be granted automatically is not a grant |
| `write_memory` · `forget_memory` | **n/a** | **The documented exception to the gate** (§11.6). Not ledger state — moves no balance, reaches no tax output. Accountable by being legible on S32 rather than by gating |
| `consolidate_memory` | ❌ | Rewrites many entries at once; the only way to lose several at a stroke, so it shows its diff |

---

## What is never an operation

- **Reading `transactions` directly from a tax path.** The export role holds
  `SELECT` on `tax_ledger` and no privilege on the base table (§13.1). That is
  enforced below the registry, not by it.
- **Raw SQL.** Text-to-SQL over a financial ledger trades unbounded blast radius
  for marginal flexibility (§11.1).
- **The display currency.** A client preference; it writes nothing (§7.0).

## Auto-mode, restated as a rule

Reading down the Auto column, the eligible set has one shape: **operations that
are idempotent, reversible, or bounded in blast radius.** Everything structural,
everything touching tax, and everything you cannot un-notice is excluded by
construction rather than by a list someone maintains.

A grant is always bounded by an expiry or a maximum count (`agent_auto_grants`),
so *auto mode is on* is never an open-ended state.

---

## Two inconsistencies this compilation caught

**`split_transaction` is stale.** It appears in `SPEC.md` §11.1's illustrative
table and in S09's data section, but §6.10 replaced splitting with
`set_transaction_lines` on the transaction — the operation no longer describes
what happens, because a split does not produce a second transaction.

**`get_fx_coverage` had no name.** S18, S30 and S29 all render per-currency
coverage and none of them named the operation behind it. It is the read that
would have surfaced GEL at 0.5%, and it existed in three screens as a
description rather than as a capability.
