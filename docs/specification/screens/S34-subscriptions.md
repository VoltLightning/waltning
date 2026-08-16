# S34 · Subscriptions

**Surface** both · **Journeys** J13 · **Frequency** monthly review
**Design** none
**Status** specified · tier 3

---

## 1. Purpose

Every recurring paid service in one place: what it costs per month and per
year, when it charges next, and which ones have quietly changed price. The
question this screen answers is *"what am I actually paying for?"* — which the
rule list (S21) cannot, because it mixes rent and salary into the same list and
speaks in RRULEs rather than costs.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Settings | Subscriptions | Settings |
| Dashboard | `subscriptions` widget → header or row | Dashboard |
| S21 | A rule with `is_subscription` → *view as subscription* | S21 |

## 3. Layout

### Both surfaces

Header: **monthly total** (dominant) and annual total (secondary) in the
display currency, both marked **≈** — they cross currencies at today's rate
(`computations.md` §16). Below, rows sorted by monthly cost descending:

```
  ⬤ Netflix           54,00 zł /mo      next: 3 Sep    ● healthy
  ⬤ ChatGPT           $20,00 /mo  ≈ 81 zł   next: 12 Sep   ● healthy
  ⬤ Google One        429,99 zł /yr ≈ 35,83 zł/mo  next: 2 Feb  ● healthy
  ◐ iCloud+           11,99 zł /mo      paused
```

Per row: `ServiceIcon` · name · native amount with cadence · monthly
equivalent when the cadence is not monthly · next charge date · `RuleHealthTag`.
Paused (disabled) rules sit in a separate section, still counted in nothing.

**The editor is S21's rule editor, opened on the same rule.** This screen adds
no second editor — one rule entity, two views (working rule 1: a screen never
invents a component, extended to: never a second write path).

## 4. Components

| Component | Notes |
|---|---|
| `ServiceIcon` | Brand icon from the bundled catalog; monogram fallback (`design-system/05`) |
| `DualTotal` | Monthly dominant, annual secondary |
| `RuleHealthTag` | Same five states as S21 — `amount drifted` is the price-rise detector |
| `Amount` | All money through it, per P1 |
| `UndoToast` | Pause, resume |

## 5. Data

| Reads | Writes |
|---|---|
| `get_subscriptions` — subscription rules with monthly equivalents and totals (`computations.md` §16) | `update_recurring` — `is_subscription`, `service`, and pause via `enabled` |
| Service catalog — bundled in `@waltning/core`, not fetched | — |

**Marking is manual, proposal is automatic.** When a rule's payee or
counterparty matches the catalog's aliases, the editor proposes the service and
the subscription flag — proposed, never set silently, the same policy as amount
drift (S21 Q2). `service` without `is_subscription` is legal: a utility rule
may carry an icon without appearing here.

## 6. States

| State | Treatment |
|---|---|
| Loading | Header skeleton + row skeletons |
| Populated | Sorted by monthly cost, descending |
| Empty | `EmptyState(first-run)` — one line, then *"mark a recurring rule as a subscription"* linking S21 |
| Error | Standard envelope handling |
| Offline | **Fully readable** — rules and the catalog are in the replica; totals are class **R**. Editing follows S21: read-only |
| Gated | Same as S21 — rule edits are ordinary gated writes |

## 7. Interaction

- **Pause** toggles `enabled` — it is `disable_recurring`, not a new operation.
  The row moves to the paused section and leaves both totals.
- **A price rise is `amount drifted`** (S21 Q2) surfacing where it matters
  most: beside the figure you are paying. Accepting the proposal updates the
  rule; the history of materialized rows keeps the old price.
- Tapping a row expands: last three charges (actual rows, linked), annual cost,
  started date, and the rule's plain-language restatement from S21.
- Icon matching is by catalog alias against payee and counterparty. An unknown
  service renders a monogram avatar — never blank, never an error, never a
  network fetch.

## 8. Rules this screen must obey

- **P1 — money.** Every figure through `<Amount>`; cross-currency totals marked
  ≈ and defined in exactly one place (`computations.md` §16).
- **Icons come from the bundle, never a logo CDN** (§4.3). A per-render request
  to a logo API broadcasts the subscription list to a third party, and it
  breaks offline rendering. Unknown slug → monogram.
- **One rule entity.** Everything here is a view over `recurring_transactions`;
  there is no subscriptions table, and pause/edit/health are S21's operations
  and semantics unchanged.
- **§14.4** — projections stay dashed and `scheduled` in the calendar; this
  screen introduces no new posting path.

## 9. Open questions

1. ~~**Should cancelled subscriptions be kept visible?**~~ **Decided: yes, as
   the paused section, and nothing more.** A dedicated "cancelled, you saved
   X/month" ledger is retention theater; a disabled rule already preserves the
   history and can be re-enabled. If a service is truly finished, delete the
   rule — the posted rows remain.

2. ~~**Detect subscriptions from transaction history?**~~ **Decided: no —
   propose from the catalog match at rule level only.** Mining the ledger for
   periodic payees duplicates what recurring rules already are; the 24 migrated
   rules plus catalog proposals on new rules cover the real population. A
   history-mining pass can become an agent task later without any schema
   change.
