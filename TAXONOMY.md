# Waltning — Category Taxonomy

A proposed replacement for Money Manager's 122 categories, derived from what
7,874 transactions actually say, plus the old→new mapping so history can be
translated rather than imported verbatim.

**Status:** proposal, for editing.
**Companion to:** [`SPEC.md`](SPEC.md) §6.3 · [`DESIGN.md`](DESIGN.md) · [`FLOWS.md`](FLOWS.md) J12

---

## 1. What the data says

Measured across 3,763 expense and 498 income transactions, 2020-11 → 2026-03.

| Finding | Figure |
|---|---|
| Defined categories | 122 |
| Actually used | **81** (73 expense, 8 income) |
| **Zero transactions ever** | **41** — a third of the taxonomy |
| Fewer than 10 transactions | 30 more |
| Top 5 categories | **75.5%** of all expense |
| Top 11 categories | **90%** of all expense |
| Income concentration | **97.3%** is `Salary` |

### 1.1 Where the money actually is

| Category | Share | Txns | Avg |
|---|---|---|---|
| Household | **41.5%** | 78 | $2,894 |
| Family budget | 15.3% | 30 | $2,777 |
| Tax | 8.3% | 128 | $352 |
| Rental | 6.7% | 43 | $850 |
| Other | 3.7% | 194 | $103 |
| Food (parent, used directly) | 2.6% | **705** | $20 |

Two distinct populations. **A handful of large, rare transactions carry the
value** — Household alone is 41.5% of five years of spending across 78 rows.
**A long tail of small, frequent transactions carries the volume** — Food is
705 rows averaging $20.

A taxonomy has to serve both, and the current one serves neither: the 41.5%
has no breakdown at all, and the 705-row tail is split across a parent and its
own children.

### 1.2 The five structural faults

**1 · Parents are used as leaves.** `Food` has 705 transactions *and* children
(`Groceries` 187, `Delivery` 48). Same for Entertainment, Social Life,
Transportation, Health, Beauty, Rental, Businesses, Household. This is the root
cause of most of the mess — there is no way to answer "how much on food"
without knowing to sum a parent with its children.

**2 · Duplicate concepts across levels.** `Eating out` exists as a top-level
category (56 rows) *and* as `Food > Eating out`. `Commission` top-level (145)
and `Businesses > Commission` (102). This produced the 13 documented collisions
and the 15 trailing-space workarounds.

**3 · Self-nesting.** `Beauty > Beauty`, `Health > Health` — a child with its
parent's name, which means the parent was never a real group.

**4 · Three competing travel concepts.** `Vacation` (1 row), `Travelling` (7),
`Travel` (0) — plus `Vacation > Food`, `Vacation > Hotels`.

**5 · The blind spot.** 41.5% of everything you have ever spent sits in
`Household` with no subcategory. Whatever that money went on — and at $2,894
average across 78 transactions it is clearly property work — is invisible.

---

## 2. Design rules

**R1 · A category is a group *or* a leaf, never both.** Only leaves are
assignable. This single rule eliminates faults 1, 2 and 3 above.

**R2 · Two levels.** Group → leaf. Deeper nesting was never used meaningfully
and makes the picker harder.

**R3 · A concept lives in exactly one place.** No name appears twice in the tree.

**R4 · Leaves earn their place.** Roughly 45 leaves rather than 122 entries.
Anything with fewer than ~10 lifetime transactions folds into a sibling unless
it is deliberately new.

**R5 · Breakdown follows value, not frequency.** `Home` gets nine leaves
because it is 41.5% of spend. `Food` gets four because $14k across 705 rows
does not need more.

**R6 · Income is tax-shaped.** Under ryczałt the **revenue side is the
reportable side** (`SPEC.md` §13.6), so business revenue must be separable
from employment income and carry its own ryczałt rate.

---

## 3. Proposed taxonomy

`◆` = group (not assignable) · `·` = leaf (assignable)
Percentages are the historical share the leaf inherits.

### Income — 9 leaves

```
◆ Business revenue          ← reportable under ryczałt; each row carries a rate
  · Services
  · Other revenue

◆ Employment
  · Salary                  97.3%
  · Bonus                    0.3%

◆ Personal income
  · Gift received            0.2%
  · Repayment received       1.0%   (was: Debt)
  · Interest & returns
  · Refunds
  · Other income             0.1%
```

`Business revenue` is new and load-bearing: it is the only part of the ledger
that reaches a tax output. Splitting it from `Salary` is what makes the ryczałt
register possible at all.

Dropped: `Base saving`, `Allowance`, `My debt` — stale, and all three are
transfers rather than income.

### Expense — 46 leaves

```
◆ Home                                        48.2%  ← was Household + Rental
  · Rent                                       0.5%
  · Utilities                                  0.6%
  · Renovation & building                            ← the 41.5% blind spot
  · Plumbing                                         ← piping and plumbing, merged
  · Electrical & network
  · Facade & exterior
  · Garden
  · Furniture & appliances                     0.1%
  · Household supplies

◆ Food                                         5.6%
  · Groceries                                  2.7%
  · Eating out                                 2.4%   ← both old homes merged
  · Delivery                                   0.2%
  · Alcohol                                    0.4%

◆ Transport                                    1.5%
  · Car
  · Taxi                                       0.2%
  · Public transport                                  ← bus + subway merged
  · Fuel & parking

◆ Travel                                       0.6%   ← Vacation + Travelling + Travel
  · Flights & tickets
  · Accommodation
  · Travel food & activities

◆ Health                                       0.6%
  · Medical & dental
  · Pharmacy
  · Sport & fitness
  · Beauty & grooming                          0.2%

◆ Personal                                     2.9%
  · Clothing & shoes                           0.9%   ← Apparel + Clothes merged
  · Technology                                 2.2%
  · Hobbies
  · Education

◆ Social                                       2.4%
  · Friends & going out                        0.7%
  · Gifts given                                2.2%
  · Celebrations                               0.3%
  · Entertainment                              0.7%   ← concerts, games, cinema

◆ Subscriptions                                0.7%
  · Software & tools                           0.3%
  · Media & streaming                          0.2%
  · Mobile & internet                          0.2%

◆ Financial                                    9.5%
  · Tax                                        8.3%
  · Bank fees & commission                     0.4%
  · Legal & professional                       0.8%
  · Insurance

◆ Business                                     1.1%   ← tracked, not deductible under ryczałt
  · Accountant                                 0.5%
  · Business services                          0.1%
  · ZUS & business tax
  · Business other                             0.5%

◆ Transfers out                               15.3%
  · Family contribution                       15.3%   ← see §5
  · Repayment made                             0.1%
  · Charity

· Uncategorized                                3.7%   ← was "Other", 194 rows
```

**46 expense leaves, 9 income leaves. 55 total, down from 122.**

---

## 4. Mapping

Every used category maps somewhere. The tail follows rules rather than being
enumerated.

### 4.1 Explicit — covers 90% of value

| Old | New |
|---|---|
| Household *(unsplit)* | **Home › Renovation & building** — needs review, see §6 |
| Household › Kitchen, Appliances, Furniture | Home › Furniture & appliances |
| Household › Toiletries, Chandlery | Home › Household supplies |
| Household › Maintenance | Home › Renovation & building |
| Family budget | Transfers out › Family contribution |
| Tax | Financial › Tax |
| Rental › Rent | Home › Rent |
| Rental › Utilities | Home › Utilities |
| Rental › Upfront, Rental *(unsplit)* | Home › Rent |
| Other | **Uncategorized** — 194 rows to revisit |
| Food *(unsplit)*, Food › Groceries | Food › Groceries |
| Food › Eating out, Eating out *(top-level)* | Food › Eating out — **collision resolved** |
| Food › Delivery | Food › Delivery |
| Alcohol | Food › Alcohol |
| Gifts | Social › Gifts given |
| Technology | Personal › Technology |
| Social Life *(unsplit)*, › Friends, › Flex, › PCIe | Social › Friends & going out |
| Transportation *(unsplit)*, › Bus, › Subway | Transport › Public transport |
| Transportation › Car | Transport › Car |
| Transportation › Taxi | Transport › Taxi |
| Legal | Financial › Legal & professional |
| Businesses › Accountant | Business › Accountant |
| Businesses › Commission, Commission *(top-level)* | Financial › Bank fees & commission — **collision resolved** |
| Businesses › Tax | Business › ZUS & business tax |
| Clothes, Apparel › Clothing, › Shoes, › Fashion | Personal › Clothing & shoes |
| Apparel › Laundry | Home › Household supplies |
| Entertainment *(unsplit)*, › Concerts, › Games, › Movies, › Books, › Toys | Social › Entertainment |
| Subscriptions › Tools, › Work | Subscriptions › Software & tools |
| Subscriptions › Entertainment, › Charity | Subscriptions › Media & streaming |
| Cellular network | Subscriptions › Mobile & internet |
| Software | Subscriptions › Software & tools |
| Health *(unsplit)*, › Health, › Hospital | Health › Medical & dental |
| Health › Medicine, › Supplements | Health › Pharmacy |
| Health › Yoga, Sports › * | Health › Sport & fitness |
| Beauty *(all)*, Cosmetics, Hairdresser, Cosmetologist | Health › Beauty & grooming |
| Celebration | Social › Celebrations |
| Vacation *(all)*, Travelling, Travel | Travel › * by nature |
| Banking | Financial › Bank fees & commission |
| Debt *(expense)*, My debt *(expense)* | Transfers out › Repayment made |
| Charity | Transfers out › Charity |
| Self-development, Education › * | Personal › Education |
| Hobbies | Personal › Hobbies |
| Fines, Visa, Work | **Uncategorized** — rare, revisit individually |
| Salary | Employment › Salary |
| Bonus | Employment › Bonus |
| Debt *(income)*, My debt *(income)* | Personal income › Repayment received |
| Gift *(income)* | Personal income › Gift received |
| Other *(income)*, Petty cash | Personal income › Other income |
| Base saving, Allowance | **Not migrated** — transfers, not income |

### 4.2 Rules for the tail

1. A parent used directly maps to its **most-used child**, unless the parent
   has an obvious general leaf.
2. Any leaf with fewer than 10 lifetime transactions maps to its nearest
   sibling.
3. Anything genuinely unmappable becomes `Uncategorized` and is **listed for
   review** rather than silently absorbed.
4. Mappings are stored, not applied blind — `category_mappings` records
   old UID → new id, so a bad mapping is corrected by re-running the
   translation rather than by editing thousands of rows.

---

## 5. Two decisions worth arguing about

**Family contribution as a category, when family is also an account.**
`Family budget` was a category (15.3% of spend, $83k). Under the new model,
family money lives in an *external account* (`SPEC.md` §6.7), so contributing
to it is a **transfer**, not an expense — which is why it appears under
`Transfers out` rather than as a spending category. The consequence is real:
your historical "spending" drops by 15.3% because that money was never spent,
it was moved. That is more truthful, but the numbers will not match what Money
Manager showed.

**`Uncategorized` is deliberate.** 194 transactions currently sit in `Other`.
Renaming it to `Uncategorized` makes it a **queue**, not a destination — it
should visibly shrink over time, and the agent can propose reclassifications
in bulk (`FLOWS.md` J12). Calling it `Other` made it feel like a valid answer.

---

## 6. What needs you

**The 41.5% question.** `Household` is $225,734 across 78 transactions with no
breakdown. I have mapped it to `Home › Renovation & building` as the safest
default, but that is a guess. Those 78 rows are your single largest analytical
gap, and splitting them properly is the highest-value classification work in
the entire migration — even if no other history comes across.

If you can characterize what that money went on, the `Home` leaves can be
tuned to it. Otherwise the agent can propose a split from the transaction notes
and you approve in bulk.

**Also open**

- Is `Business revenue` live yet, or anticipated? It shapes whether the ryczałt
  rate field is needed at build time or later.
- Do you want `Uncategorized` to block anything — a nag on the dashboard, or
  silent?
- Any leaves here you would never use, and any missing that you have wanted?
