# J16 · Move money between your own accounts

**Frequency** weekly
**Surface** mobile | web · **Screens** S31, S05, S16, S18, S09, S12
**Status** specified

---

## 1. Why this journey exists

**Transfers are 22% of the ledger** — 1,680 of 7,621 rows in the source data,
second only to expenses — and until now no journey covered making one. S31
existed as a screen reachable from nothing.

They are also where the design does something no version of Money Manager
could: a cross-currency transfer stores **both amounts**, so the realized rate is
a fact rather than a derivation, and the gap against the reference rate becomes
`FX Cost` — a figure you can total by institution and act on. That feature has
no other entry point. If this journey is wrong, the headline capability of §7.5
is unreachable.

Three shapes, one screen:

| Shape | Frequency | What is hard |
|---|---|---|
| Same currency, own accounts | Most | Nothing. It should be four taps |
| **Cross-currency** | Regular — seven currencies, three countries | Both amounts must be real, and the rate must not be invented |
| To a clearing or loan account | Common (§6.4) | It is a debt movement wearing a transfer's clothes (J07) |

## 2. Preconditions

- At least two accounts exist (J14).
- For cross-currency, a reference rate for the date — or the honest absence of
  one, which is a supported state, not an error (§7.6).
- Nothing else. This journey must work with no network (§14.3).

## 3. The path

```
S04 Today ──[+]──→ S05 Quick add ──type: transfer──→ S31 Transfer
                                                        │
                            from · to · amount ─────────┤
                                                        │
                     same currency ────────────────→ Save ──→ S09 detail
                                                        │
                     different currency                 │
                            │                           │
                            └─ destination amount ──────┘
                               (typed, never derived)
```

**Entry is from the type selector, not a separate button.** S05's `expense ▾`
selector is the escape hatch, deliberately out of the way, because a transfer is
weekly and an expense is several times a day.

## 4. Branches

| At | Condition | Goes to |
|---|---|---|
| S31 | Both accounts same currency | One amount field; realized rate is 1 |
| S31 | Accounts differ in currency | **Two** amount fields; the rate is derived and shown |
| S31 | Destination is a clearing or loan account | Offers the counterparty picker — this is J07's territory |
| S31 | A `fee` was charged | Optional field, reported separately from margin (§7.5) |
| S31 | No reference rate for the date | Saves anyway, `fx_rate_estimated`, surfaced in *Needs attention* |
| S09 | The rate looks wrong later | *Fix the day's rate* → S18 |

## 5. Failure paths

| Goes wrong | Where you land |
|---|---|
| Destination amount left empty, cross-currency | **Save is disabled.** Offline this is the only correct behaviour — see Rules |
| Same account chosen twice | Refused at entry. A self-transfer is the Money Manager artefact §6.6a migrates *away* from |
| Amount exceeds the source balance | **Allowed.** An account can go negative (§6.7); the balance is a fact, not a limit |
| Date inside a closed period | Warned locally, refused by the server (§13.4). Near a boundary it is a warning with an override (§14.3) |
| Offline, no rate for the date | Saved with the last known rate, flagged; the server re-resolves at commit (§14.3) |
| Drain finds the period closed since | `blocked(repairable: period)` — auto-requeues when reopened |

## 6. Rules

**Never derive the destination amount.** §7.5's whole argument: if `to_amount`
is computed from the reference rate, both legs value to the same pivot figure,
the margin is identically zero, and `FX Cost` reports nothing while appearing to
work. The destination amount is **what actually landed**, read off the receiving
account.

**Offline, the destination amount is left empty rather than pre-filled.** A
pre-filled figure from a cached rate is the same failure by another road — and
it is worse, because it looks like an observation. The stale reference shows as a
hint only.

**`to_fx_rate` is the reference rate, not the realized one** (§7.5). The realized
rate is `to_amount ÷ amount_original`, derived at read time and never stored.
The client stamps neither; both resolve server-side at commit (§14.3).

**A negative margin is not an error.** You beat the reference rate. Render it,
never clamp it.

**A transfer is not income and not expense.** It appears in no
`income_vs_expense` bucket and no `spend_by_category` total (`computations.md`
§6, §12). The one exception is the shared-boundary net line (§5), where a
transfer *into* a shared account is subtracted from your spending — which is why
`to_amount_pivot` exists.

**A transfer to a clearing or loan account is a debt movement.** It carries a
`counterparty_role` and belongs to J07's arithmetic, where `debtDelta` takes the
**destination** side — the defect C15 fixed. This journey hands off rather than
duplicating it.

## 7. Success

- A same-currency transfer is **four interactions**: type, from, to, amount.
- A cross-currency transfer records two amounts, and `FX Cost` for the period
  changes by the margin — verifiable against the bank's own figure.
- Both account balances move by the correct amounts **in their own currencies**,
  and neither appears in any category total.
- Offline, all of the above holds except the reference rate, which arrives on
  drain without changing what you entered.
