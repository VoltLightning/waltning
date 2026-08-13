# S20 · Settings · Rules

**Surface** web · **Journeys** J4 · **Frequency** monthly, alongside import
**Design** none
**Status** specified · tier 3

---

## 1. Purpose

Maintain the deterministic tier of classification — the one that is free and
explainable.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Settings | Rules | Settings |
| S02c | *Write a rule*, prefilled from a row | S02c, the row reclassified |

## 3. Layout

### Mobile
Not supported. Rules are written while importing, which is a desktop act.

### Web — ≥1024px

Rule list with hit counts, ordered by priority. Editor beside it: conditions
(payee regex, amount range, account, currency), actions (category, payee
normalization, note, business flag), priority. A **test panel** shows what the
rule would match against existing rows.

## 4. Components

| Component | Notes |
|---|---|
| `Tag` | **`matched n · kept n`** · `disabled` · `never matched` · `overridden` when the gap is wide. A rule you override every time reads as wrong rather than as unused — they need opposite fixes (S02 §9) |
| `TextField` | Regex, with a live validity marker |
| `ComparisonTable` | Test panel — what this rule would match, and what it would change |
| `UndoToast` | Enable, disable, reorder |

## 5. Data

| Reads | Writes |
|---|---|
| `get_rules` with hit counts | `create_rule` · `update_rule` · `disable_rule` · `reorder_rules` |
| Sample rows for the test panel | — |

## 6. States

| State | Treatment |
|---|---|
| Loading | List skeleton |
| Populated | Ordered by priority |
| Empty | `EmptyState(first-run)` — expected for months. §8.0 notes the cold start: rules accumulate from confirmed history, and starting near-empty is a cost in euros, not in correctness |
| Error | Invalid regex → stated on the field before save |
| Offline | Read-only |
| Gated | n/a |

## 7. Interaction

The test panel runs before save, against real rows. A rule that matches nothing
is savable — it may be for a merchant you have not seen yet — but it is tagged
`never matched` so it does not accumulate silently.

## 8. Rules this screen must obey

- **§9.2** — rules are tier 2 of the cascade: after duplicate detection, before
  the model. Deterministic and free.
- **Every rule names itself in the import queue**, with its hit count. A rule
  that fires invisibly is indistinguishable from a model guess.
- **§9.2** — descriptions are trilingual; a regex written against Polish text
  will not match its Russian equivalent, and the test panel is where that
  becomes obvious.

## 9. Open questions

1. ~~**Priority is an integer, and integers collide.**~~ **Decided: most
   specific wins, then oldest.** Ties break by condition count — a rule matching
   payee *and* account beats one matching payee alone — and only then by
   creation order. Deterministic without asking you to hand-manage integers, and
   it matches the intuition that the narrower rule is the one you meant. The
   test panel states which rule would win when more than one matches.
2. ~~**No rule versioning.**~~ **Decided: snapshot the conditions at match
   time.** `import_rows` already records `rule_applied`; it also records the
   rule's conditions **as they were when it fired**. A later edit therefore
   cannot rewrite what happened — the audit trail J5 depends on says *this row
   was classified by this rule in this form*, which stays true regardless of what
   the rule becomes. Cheaper than versioning the rule itself, and it captures the
   only thing the audit trail actually needs.
3. ~~**Should confirming a model suggestion always offer to write a rule?**~~
   **Decided: offer on demonstrated repetition, not on confirmation.** Nothing
   is said when you confirm one row. When the same normalized payee has been
   confirmed to the same category **three times with no rule covering it**, one
   prefilled suggestion appears — dismissible, and never raised again for that
   payee.

   **Rules should accumulate from evidence, not from prompting.** Confidence is
   the wrong trigger: a high score usually means an obvious merchant, and one
   confirmation is thin evidence it will recur — a holiday's worth of one-off
   foreign merchants would each offer to become permanent. Three confirmations
   of the same payee is the pattern actually worth encoding, and it is a fact
   the system already has.

   Asked once per payee, ever. That is what keeps it from becoming a prompt you
   learn to dismiss.
