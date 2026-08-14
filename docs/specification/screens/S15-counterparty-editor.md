# S15 · Counterparty editor

**Surface** both · **Journeys** J7, J8, J15 · **Frequency** occasional
**Design** none
**Status** specified · tier 2

---

## 1. Purpose

Create or edit a person or company — without accidentally creating a second one
who is the same person.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| S05 | Counterparty chip → *new* | S05, with the counterparty attached |
| S12 | Add | S12 |
| S13 | Edit | S13 |
| S29b | Counterparty proposal review | S29b |

## 3. Layout

### Both surfaces

```
  Name             [ Nina K.            ]

  ⚠ Similar to an existing counterparty
  ┌─────────────────────────────────────┐
  │ (A) Nina          person            │
  │     PLN +840,00 · 23 transactions   │
  │                                     │
  │  [ This is the same person ]        │
  │  [ These are different    ]         │
  └─────────────────────────────────────┘

  Kind             ( ) person  ( ) company
  Settles in       [ EUR ▾ ]         their preference
  Contact          [                 ]
  Note             [                 ]
```

**The match warning shows the candidate's balance and transaction count.** That
is what makes the risk legible — an abstract *similar name found* does not
convey that accepting it merges two ledgers (`design-system/08` §8.4).

**Two actions, no default.** Choosing *these are different* records the
decision, so the pair is never queried again.

## 4. Components

| Component | Notes |
|---|---|
| `MatchWarning` | Fires on save, normalized near-match. Never auto-merges, never silently allows |
| `TextField` | Name, contact, note |
| `SegmentControl` | Person / company — governs whether ageing applies at all |
| `CurrencyChip` | Settlement currency — **their** preference, not a system concept |

## 5. Data

| Reads | Writes |
|---|---|
| `get_counterparties` for matching | `create_counterparty` · `update_counterparty` |
| The candidate's balance and count | `merge_counterparties` — audited, states the affected count, **archives rather than deletes** the absorbed record |
| Recorded not-a-duplicate decisions | `unmerge_counterparties` — restores the moved rows, un-archives |
| The merge record: which ids moved, and when | `record_distinct_counterparties` |

## 6. States

| State | Treatment |
|---|---|
| Loading | Instant; the list is small and cached |
| Populated | New · editing |
| Empty | n/a |
| Error | Name collides exactly → refused by the unique index on `lower(btrim(name))`, stated on the field. **Near**-match → `MatchWarning`, which is a state rather than an error |
| Offline | Works; queues. Matching runs against the cached list and **says so** — a near-match check that silently had less data is worse than none |
| Gated | Archiving is refused while a balance is open — archiving is for settled relationships |

## 7. Interaction

### Both
The match check fires on blur of the name field, not on every keystroke —
warning while someone is still typing *Ann* is noise.

## 8. Rules this screen must obey

- **§6.6** — settlement currency is a property of the person.
- **O15** — kind decides whether ageing applies, so it is not cosmetic.
- **Merging two spellings of one person corrupts a balance.** This screen is the
  guard, and the same component guards J15's proposal review at higher volume.

## 9. Open questions

1. ~~**What counts as a near match?**~~ **Decided: trigram similarity, tuned
   loose, top three ranked.** `pg_trgm` with a deliberately generous threshold,
   showing candidates ranked by score rather than a single verdict — so
   `Ania` surfaces `Nina` at 0.71 alongside two weaker ones and you choose.

   **False positives are cheap here, and that is the whole argument.** The usual
   objection — a warning that fires too often trains dismissal — does not apply,
   because the dismissal is recorded per pair and the question is never asked
   again. A loose threshold therefore costs one tap, once, per genuinely
   distinct pair; a strict one costs a corrupted balance discovered months
   later. Normalized equality was rejected as close to decorative: the unique
   index already refuses `anna` and `Nina `, so the component would fire only
   where the constraint had it covered.
2. ~~**Should a merge be reversible?**~~ **Decided: yes, indefinitely.** The
   absorbed counterparty is **archived, not deleted**, and the merge records
   exactly which transactions moved. Unmerge restores them and un-archives it.

   This follows the system's existing instinct — archive, never delete, because
   history references it (§6.9) — and it is what makes `MatchWarning`'s *same
   person* button safe to press when you are 90% sure rather than certain. A
   guard that is only safe when you are certain gets clicked through when you
   are not.

   **This deliberately differs from the category merge in J12**, which is not
   reversible in one step. The asymmetry is real: a category merge dissolves one
   category into another and the mapping is what survives, while a counterparty
   merge only re-points a foreign key — so the absorbed record can be kept whole
   and the operation genuinely inverted.
