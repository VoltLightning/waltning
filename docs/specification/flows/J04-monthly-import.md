# J4 · Monthly import

**Frequency** monthly, per institution · **Surface** web
**Screens** S02a, S02b, S02c, S02d, S20, S06, S09, S01
**Status** specified

---

## 1. Why this journey exists

Replaces an evening in Excel. Today statements are parsed by a Python script,
classified by a model, reconciled against a `.mmbak` snapshot, and emitted as a
TSV that gets sideloaded onto a phone. The hard parts of that pipeline are worth
keeping; the shape is not.

Seven institutions across three countries, **only one of which any aggregation
service covers** — so statement export stays manual permanently (`SPEC.md`
§1.3). This journey is the one that makes that bearable.

It is materially easier here than in the old pipeline for one structural reason:
the comparison is against **live data** rather than a snapshot file, so there is
no baseline drift between what you reconciled against and what is actually
recorded.

## 2. Preconditions

Accounts exist and their currencies are set. Rules may be empty — the cascade
degrades to the model tier, which is the expected state for the first few
months (`SPEC.md` §8.0: "rules cold-start").

Needs a backend, not merely a browser. Statement parsing, the classification
cascade and the commit are Brick 2 work (`architecture/14` §14.1); the
review queue is also dense and keyboard-driven, reviewed sitting down.

## 3. The path

```
bank statement exported manually
        │
   S02a Upload           file → parser detected → account confirmed
        │
   S02b Parsing          row count · date range · parse issues
        │
        │   classification cascade, cheapest first (§9.2)
        │   ┌──────────────────────────────────────────┐
        │   │ [1] exact duplicate?  → skip             │
        │   │ [2] rule match?       → free, determinist│
        │   │ [3] model call        → confidence+reason│
        │   └──────────────────────────────────────────┘
        │
   S02c Review queue     ← the screen this journey exists for
        │
        │  each row carries its provenance:
        │    Rule · <name>      names the rule and its hit count
        │    Model 0.91         confidence AND reason, always both
        │    Transfer           pair already collapsed to ONE row
        │    Duplicate          matched an existing transaction
        │
        │  keyboard: J K next/prev · A accept · R rule · S skip · T transfer
        │
        ▸ Expand row  → reason · category picker · FX panel, rate editable
        ▸ Write a rule → S20, prefilled from this row
        ▸ Bulk accept ≥ threshold → bounded, count stated
        │
   queue clear → S02d Empty state → verify balances → S01 Dashboard
```

## 4. Branches

| At | Condition | Goes to |
|---|---|---|
| S02a | Parser not recognised | Generic CSV with column auto-detection |
| S02a | Account ambiguous | Explicit confirmation. Never guessed — a statement posted to the wrong account is invisible and corrupts two balances |
| S02c | Row is a transfer candidate | Already collapsed to one row with both legs; expanding shows both accounts and the realized rate |
| S02c | Row is a duplicate | Shows the matched transaction. Accepting means *"no, this is a second one"* |
| S02c | Confidence below threshold | Stays in *needs review*; never bulk-accepted |
| S02c | Model proposes an unknown category | **Proposal only** (`SPEC.md` §11.5) — never created silently |
| S02c | Business row in a shared account | Refused with the reason (§6.7) |
| S02c | Wants a rule | S20 prefilled from the row's payee, amount range, account |
| S02d | Balances do not match the statement | Named per account before the dashboard, not after |

## 5. Failure paths

| Failure | Treatment |
|---|---|
| Parser rejects the file | What it expected versus what it found, with the first offending row quoted |
| Partial parse | Good rows proceed; bad rows land in the queue as `needs_review` with their raw text. **`import_rows.raw` is never mutated**, so a reparse after a prompt or parser change is always possible |
| Model tier unavailable | Rows fall back to `needs_review` with a stated reason. The import is not blocked by an API outage |
| **Mis-keyed accept or skip** | `UndoToast`, 8 s, with a session action stack behind it and `U` on the keyboard. Undo reverses the **effect**, not the marker: accepting writes a transaction, so undoing soft-deletes it and returns the row to its prior status. Rapid actions collapse to one toast with a count — `3 rows accepted · Undo`. **A bulk accept is one undoable unit**; undoing 23 rows as 23 separate steps teaches distrust of the button (`design-system/08` §8.4) |
| **Choosing a bulk-accept threshold** | `ThresholdSlider`, 0.50–1.00 in 0.01 steps, with the affected count live in the button label — *Accept 23 rows ≥ 0.90*. Persists per account, because a well-ruled account tolerates a lower bar than a new one. Below 0.75 the button takes `warn` treatment and states what it is about to do. **The slider cannot reach 1.00**, so "accept all" is unreachable by construction rather than by discipline |
| Uploaded twice | Batch-level duplicate detection on file hash, before row-level work |
| No FX rate for a row's date | Nearest rate, `fx_rate_estimated`, amber (`SPEC.md` §7.6) |

## 6. Rules

- **Bulk accept is always bounded by a stated threshold and shows its count.**
  *"Accept 23 rows at or above 0.90"* — never *"accept all"*, which is the
  fastest way to poison a ledger.
- **Every model row states confidence *and* its reason; every rule row names
  the rule and its hit count.** A guess with no rationale cannot be judged, and
  an unjudgeable proposal gets accepted by reflex.
- **`import_rows.raw` is immutable.** Reparsing is always available, which is
  what makes prompt and parser iteration safe.
- **A transfer is one row here too**, matching the ledger. Presenting the two
  legs and asking the user to pair them would import the exact defect the data
  model exists to remove (§6.1).
- **Imported descriptions are ~96% Polish** — the bank writes them. Your own capture text is a different corpus and appears in the
  same account and often the same month. The prompt states this explicitly and
  the category tree is supplied in one language, so the model translates rather
  than guessing — this is most of the tail, not an edge case (§9.2).
- **Under ryczałt, miscategorising a business *expense* is not a compliance
  problem** (§13.6) — there is no cost side. It still matters for your own
  analysis, but the stakes on this screen's business toggle are lower than they
  look, and the interface should not imply otherwise.

## 7. Success

| Measure | Target |
|---|---|
| Throughput | **A month of statements in minutes**, not an evening |
| Keyboard | The common path — accept, next, accept — never needs the mouse |
| Rule accretion | After a few months the recurring set (rent, salary, subscriptions, utilities) is **entirely rules**, and the model sees only novel merchants |
| Trust | Every accepted row can be traced to the rule or the reasoning that classified it |
| Reconciliation | Post-import balances match the statement, per account, before the queue is called clear |
