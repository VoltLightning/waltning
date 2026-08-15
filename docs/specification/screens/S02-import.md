# S02 · Import

**Surface** web · **Journeys** J4 · **Frequency** monthly, per institution
**Design** Claude Design project
**Status** specified · tier 1

---

## 1. Purpose

Turn a bank statement into reviewed, categorised transactions — a month in
minutes rather than an evening in Excel.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Nav | Import | — |
| S01 | *Statements pending* | S01 |
| S20 | After writing a rule | S02c, the row reclassified |

Four sub-screens: **a** upload · **b** parsing · **c** review queue ·
**d** empty.

**Exits** — S20 to write a rule · S06 for a category · S09 for a committed row ·
S01 when the queue clears.

## 3. Layout

### Mobile — 390pt

**Not supported.** This screen is dense, keyboard-driven and done sitting down;
a swipe-through-forty-rows version would be slower and less accurate than
waiting for a laptop. The mobile app links here with *open on desktop*.

### Web — ≥1024px

**a · Upload** — drop zone, detected parser, account confirmation, period.
Account is **confirmed explicitly, never guessed**: a statement posted to the
wrong account is invisible afterwards and corrupts two balances.

**b · Parsing** — row count, date range, and issues as they are found.

**c · Review queue** — the screen this journey exists for:

```
┌ filters ────────────────────────────────────────────────────────┐
│ [Needs review 18] [Ready 320] [Duplicates 4] [Skipped 2]         │
│ Threshold ●────────── 0.90        [ Accept 23 rows ≥ 0.90 ]      │
├─────────────────────────────────────────────────────────────────┤
│ 5 Aug  ZABKA NR 2831 WARSZAWA                                   │
│        Rule · Żabka (41 hits)      Food › Groceries             │
│                                       −24,90 zł   [Accept][Skip]│
│ 5 Aug  MIGROS GENEVE                                            │
│        Model 0.91 · "Swiss grocery chain, matches               │
│        prior Migros rows in this account"                       │
│        Food › Groceries          38,20 CHF · 4,42               │
│                                     168,84 zł    [Accept][Skip] │
│ 4 Aug  PRZELEW WŁASNY                                           │
│        Transfer · BANK-A → Cash        −500,00 → +500,00 zł     │
│ 3 Aug  COSTA COFFEE                                             │
│        Duplicate · matches 3 Aug −48,90        [It's separate]  │
└─────────────────────────────────────────────────────────────────┘
```

Expanding a row gives three panes: reason and toggles · category picker ·
currency and rate — plus a **refine** line.

```
 ▾ MIGROS GENEVE                              Model 0.91
   "Swiss grocery chain, matches prior Migros rows
    in this account"      ← retrieved before the call, not looked up during it
   Food › Groceries                    [ Travel › Travel food ]
   ⌨ this trip was a holiday — these are travel food
```

**Classification is a deterministic pipeline, not a loop** (`SPEC.md` §11.4):
similar prior payees are retrieved first and handed to a single call. Same
reason string, and reproducible — which §9.4 requires, since `import_rows.raw`
is kept unmutated precisely so a reparse is always available, and that is worth
nothing if a reparse can answer differently.

**Refining re-runs the row with your correction in context** — a second pass,
not a conversation. One sentence beats correcting a category, a business flag
and a payee separately, and unlike a direct edit it can be applied to *the rest
of the batch*: forty holiday rows, one sentence.

**d · Empty** — queue clear, session counts, verify-balances action.

## 4. Components

| Component | Notes |
|---|---|
| `ImportRow` | Collapsed and expanded forms |
| `Pill` | Tier — `rule` names the rule and hit count; `model` states confidence **and** reason; `transfer`; `duplicate` |
| `ThresholdSlider` | 0.50–1.00, live count in the button label, **cannot reach 1.00** |
| `RefineRequest` | Re-runs a row — or the rest of the batch — with your correction in context. *"This trip was a holiday"* beats forty manual recategorisations |
| `SegmentControl` | Status filters with live counts |
| `UndoToast` | Every accept and skip; bulk accept is **one** undoable unit |
| `KeyHint` | `J K A R S T` legend |
| `ErrorState(partial)` | Parse that read some rows — states **both** numbers |
| `EmptyState` | Queue clear |

## 5. Data

| Reads | Writes |
|---|---|
| `get_import_batch`, `get_import_rows(status)` | `run_import`, `accept_row`, `skip_row` |
| `get_category_tree`, `get_rules` | `categorize_batch` |
| The matched row, and the **difference** between the two amounts | `supersede_transaction` — commits the import row, soft-deletes the manual one, reattaches its receipt and splits |
| Rate for each row's date | `propose_rule` → S20 |

`import_rows.raw` is **never mutated**, so a reparse after a parser or prompt
change is always available.

## 6. States

| State | Treatment |
|---|---|
| Loading | Parse progress with a real count, not a spinner |
| Populated | The queue |
| Empty | Queue clear — session counts and a reload |
| Error | Parser rejected → `ErrorState(terminal)` quoting the first offending row. Partial parse → `ErrorState(partial)`, *340 read · 18 queued* — **both numbers**, because silent partial success is how a month goes half-imported |
| Offline | Upload disabled. An open queue stays reviewable from cache; accepts queue to the outbox |
| Gated | n/a |

## 7. Interaction

### Web
`J`/`K` next and previous · `A` accept · `S` skip · `R` write a rule ·
`T` mark as transfer · `U` undo · `Enter` expand. The common path — accept,
next, accept — never needs the mouse.

Bulk accept states its count and its threshold in the button itself. It is
**one** undoable unit.

## 8. Rules this screen must obey

- **Bulk accept is always bounded and always states its count.** "Accept all" is
  unreachable by construction — the slider cannot reach 1.00.
- **Every model row states confidence *and* reason; every rule row names the
  rule and its hits.** A guess with no rationale cannot be judged, and an
  unjudgeable proposal gets accepted by reflex.
- **A transfer is one row here too**, matching the ledger.
- **§9.2** — imported descriptions are written by the bank and are ~96% Polish, not
  the same month. This is most of the tail, not an edge case.
- **§13.6** — under ryczałt a miscategorised business *expense* is not a
  compliance problem. The business toggle matters for analysis, and the screen
  should not imply higher stakes than that.

## 9. Open questions

1. ~~**When should a rule's hit count increment?**~~ **Decided: `hits` counts
   commits; matches are tracked separately.** `hits` increments only when a row
   is accepted, so *Rule · Żabka (41 hits)* means forty-one classifications you
   kept — which is what makes it a credibility signal on the row rather than a
   measure of how often a pattern occurs.

   **The gap between the two numbers is the diagnostic**, and S20 shows both:

   ```
   Żabka    matched 47 · kept 41     6 overridden
   Migros   matched 12 · kept  2    10 overridden  ⚠
   ```

   Counting matches alone would make a rule you override every time look like
   your most reliable one. Counting commits alone would make it look *unused* —
   and an unused rule and a wrong rule need opposite fixes, which is exactly the
   confusion two numbers resolve.
2. ~~**Duplicate resolution has one action but two meanings.**~~ **Decided:
   three actions — separate, skip, supersede.**

   | Action | Meaning |
   |---|---|
   | **Separate** | A genuine second purchase. Both rows kept |
   | **Skip** | Your existing row is right. The import row is dropped |
   | **Supersede** | The statement is authoritative. The import row commits; your earlier manual entry is **soft-deleted**, with the replacement recorded in its audit trail |

   Supersede covers the commonest collision: you guessed at the till and the
   bank knows better. The row shows **the difference** between the two amounts,
   because that is the figure the decision turns on.

   Carried forward as a caveat rather than a blocker: superseding replaces one
   row's id, so a receipt or split already attached to the manual entry has to
   move with it. The importer must reattach rather than orphan them.
3. ~~**No cross-batch view.**~~ **Decided: detection queries the whole ledger,
   not the batch.** Transfer and duplicate candidates are found against
   committed transactions **plus every open batch** — so a leg imported last week
   pairs with one imported today, and a BANK-A debit pairs with the Georgian
   credit sitting in a different file.

   This is what §9.3 already claims makes this easier than the old pipeline:
   *"the comparison is against live data rather than a snapshot file, so there is
   no baseline drift."* Scoping detection to one batch would have quietly
   thrown that away and reintroduced heuristic re-pairing after the fact — the
   defect the one-row transfer model exists to eliminate (§6.1).

   The queue names the counterpart's batch and date, and confirming commits
   **one row with both legs**.
