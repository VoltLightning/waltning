# S22 · Settings · Tax

**Surface** both · **Journeys** J11, J1 · **Frequency** rare
**Design** none
**Status** specified · tier 3

---

## 1. Purpose

Record which scheme applied when — as a timeline, because it changes.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Settings | Tax | Settings |
| S28 | *No scheme set for this period* | S28, unblocked |
| S29a | First-run step 5 | S29a |

## 3. Layout

### Both surfaces

```
  ┌ ResidencyTimeline ──────────────────────────┐
  │  2024 ─────── 2025 ─────── 2026 ─────── now │
  │  ├──────────── PL ─────────────────────┤    │
  │                                             │
  │            [ + Add a residency change ]     │
  └─────────────────────────────────────────────┘

  ┌ SchemeTimeline ──────────── within PL ──────┐
  │  2024 ─────── 2025 ─────── 2026 ─────── now │
  │  │                          │               │
  │  └ PL · skala v2024         └ PL · ryczałt  │
  │                                    v2026    │
  │                                             │
  │            [ + Add a dated scheme change ]  │
  └─────────────────────────────────────────────┘

  Registration
   NIP                [ 1234567890 ]
   VAT registered     ( ) yes  (•) no
   Default ryczałt rate per activity
     Services         [ 12% ]
```

**Two timelines, neither a dropdown.** A transaction resolves against the scheme
in force for **the jurisdiction you were resident in, on its own date** (§13.2,
§13.4) — so both facts have to be representable as history, not as a current
setting.

> **What residency does not do.** It selects which jurisdiction's schemes apply
> to a period. It does **not** model double-taxation relief, treaty positions or
> foreign tax credits — the genuinely hard part of being taxed in two places,
> and still deferred (O11). A period resolving to `DE` produces a German-shaped
> projection of German-resident activity; it does not tell you what you owe
> after relief. §13.5 holds: this is not the book of account.

Stating that is the point of building residency now rather than later — the
capability is narrow, and a timeline with no caveat would imply a much wider
one.

## 4. Components

| Component | Notes |
|---|---|
| `ResidencyTimeline` | Dated jurisdiction changes. Selects which forms apply — **not** treaty or foreign-tax-credit treatment (O11) |
| `SchemeTimeline` | Dated changes, scoped to the residency in force; a period with **no** scheme renders as a gap and an error, not a blank |
| `TextField` | NIP, with format validation |
| `Toggle` | VAT registration |
| `ConfirmDialog` | Changing a scheme for a **closed** period |

## 5. Data

| Reads | Writes |
|---|---|
| `tax_residency` — the dated jurisdiction timeline | `add_residency_period` |
| `tax_schemes`, scoped to the residency in force | `add_scheme_period` · `update_registration` |
| `ryczalt_rates` by activity and date | `set_ryczalt_rate(activity, valid_from)` |

Scheme resolution keys on **(jurisdiction resident in, transaction date)**, not
date alone — which is why residency is built now rather than when a second
jurisdiction arrives, since every lookup would otherwise change shape.

## 6. States

| State | Treatment |
|---|---|
| Loading | Instant |
| Populated | No scheme set · single scheme · **multiple periods in one year** |
| Empty | No scheme — the state J1 leaves you in if step 5 was skipped |
| Error | Overlapping scheme periods → refused, naming the overlap |
| Offline | Read-only |
| Gated | A scheme is **immutable once a period has closed against it** (§13.4). Changing it requires confirmation and is audited |

## 7. Interaction

Adding a change asks for the effective date first, then the scheme — because the
date is what makes it a timeline rather than a setting.

## 8. Rules this screen must obey

- **§13.4** — schemes are versioned by effective date, and resolution is by
  transaction date, never by export date.
- **§13.6** — the current position is **ryczałt, not VAT-registered**. `PL_KPIR`,
  `US_SCHED_C` and `DE_EUER` are defined but unimplemented, and the picker says
  so rather than offering them as if they worked.
- **O2** — `counterparty_tax_id`, `document_ref` and `ksef_id` exist from day
  one so opting into VAT later is not a migration. No JPK_V7 handling is built.
- **Nothing here is tax advice.**

## 9. Open questions

1. ~~**Residency (O11) has no interface.**~~ **Decided: build the residency
   timeline now; keep treaty handling deferred.** `tax_residency` gains a dated
   timeline above the scheme timeline, and scheme resolution becomes
   *(jurisdiction resident in, transaction date)* rather than date alone.

   Building it now removes a future restructure — every scheme lookup would
   otherwise change shape when a second jurisdiction arrives. What it does
   **not** buy is the hard part: double-taxation relief, treaty positions and
   foreign tax credits stay unmodelled, and the screen says so explicitly rather
   than letting a residency control imply them.

   **The caveat is load-bearing.** A timeline showing `PL → DE` looks like a
   system that understands being taxed in two places. It understands which
   jurisdiction's forms apply, which is a much smaller claim.
2. ~~**Ryczałt rates are per activity, and change annually.**~~ **Decided: a
   dated rate table, defaulted per counterparty.**

   ```
   ryczalt_rates      id, activity, rate, valid_from, valid_to
   counterparties   + default_activity
   transactions     + ryczalt_rate        stamped, editable
   ```

   A revenue row resolves its default from the counterparty's usual activity at
   **the row's own date** — the same resolution rule schemes already use (§13.4)
   — and the resolved figure is then **stamped on the row**, not left as a
   lookup. So a rate change next January cannot reprice last year, and correcting
   the table does not silently rewrite history.

   Two clients at different rates and a rate change in January are then the same
   mechanism rather than two special cases. A single versioned default would have
   handled the second and broken on the first.
3. ~~**What closes a period?**~~ **Decided: an explicit lock, by you.** Closing
   is a judgement — you know when you have filed and the software does not. The
   action lives on S28, records who closed it and when, and freezes the scheme
   for that period. Reopening is possible and audited. Completeness warnings
   must be cleared **or explicitly acknowledged** before closing, so the lock
   also records what was known to be incomplete at the time. Neither of the
   automatic alternatives survives contact: an export gets built to check a
   figure, and a deadline locks periods you never filed.
