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

| Category | Share of spend | Txns | Relative size |
|---|---|---|---|
| Household | **41.5%** | 78 | very large, very rare |
| Family budget | 15.3% | 30 | very large, very rare |
| Tax | 8.3% | 128 | mid |
| Rental | 6.7% | 43 | mid, monthly |
| Other | 3.7% | 194 | small |
| Food (parent, used directly) | 2.6% | **705** | small, very frequent |

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
`Household` with no subcategory, across only 78 transactions — so the average
row is enormous and nothing says what any of it was.

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

### Inflows — 10 leaves, split by whether they were *earned*

`SPEC.md` §6.7: income is what you earned. Everything else raises your balance
without being income.

```
◆ EARNINGS — counts as income

  ◆ Business revenue        ← the only slice reportable under ryczałt
    · Services                      each row carries a ryczałt rate
    · Other revenue

  ◆ Employment
    · Salary                97.3%
    · Bonus & equity         0.3%

  ◆ Returns
    · Investment returns
    · Interest

◆ UNEARNED — raises the balance, never income

  · Gift received           0.2%   ← from anyone: family, friends, birthdays
  · Refund
  · Repayment received      1.0%   ← a debt coming back is not a gain
  · Other inflow            0.1%
```

**`is_earnings` lives on the category**, so *"what did I earn"* sums the first
group only. One rule covers a co-owner's money, a birthday present, and a
refund — rather than three exceptions.

`Business revenue` is separately load-bearing: it is the only part of the
ledger that reaches a tax output at all.

Dropped: `Base saving`, `Allowance`, `My debt` — stale, and all three were
transfers rather than inflows.

### Expense — 46 leaves

```
◆ Home                                        48.2%  ← was Household + Rental
  · Property purchase                                ← one-off capital (SPEC §6.8)
  · Rent                                       0.5%
  · Utilities                                  0.6%
  · Furniture & appliances                           ← where the homeware tail lands
  · Household supplies
  · Renovation & building                            ┐
  · Plumbing                                         │ forward-looking: almost no
  · Electrical & network                             │ historical basis, but the
  · Facade & exterior                                │ house is months old
  · Garden                                           ┘

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

◆ Transfers out                                0.1%
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
| Family budget | **Home › Renovation & building**, recorded in the *shared* account — see §5 |
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

**`Family budget` is not a category — it is an account scope.** It held 15.3%
of spend across 30 rows. Combined with `Household`'s 41.5% across 78 rows,
that is **56.8% of everything ever recorded, in 108 transactions** — which,
given the house bought jointly with a co-owner, is almost certainly the
property.

Under the ownership model (`SPEC.md` §6.7) that money is not reclassified as a
transfer and does not vanish from your spending. It moves from the *mine* total
to the *ours* total, and it keeps a real expense category — most likely
`Home › Renovation & building`. **Nothing is lost and no total drops**; a
second total appears alongside the first.

An earlier draft of this document mapped it to `Transfers out` and claimed your
historical spending would fall by 15.3%. That was wrong, and followed from
modelling shared money as excluded rather than as separately aggregated.

**`Uncategorized` is deliberate.** 194 transactions currently sit in `Other`.
Renaming it to `Uncategorized` makes it a **queue**, not a destination — it
should visibly shrink over time, and the agent can propose reclassifications
in bulk (`FLOWS.md` J12). Calling it `Other` made it feel like a valid answer.

---

## 6. What needs you

**The rows were assessed, and the premise was wrong.** An earlier draft treated
`Household` as a large undifferentiated pool of property work needing nine
subcategories. Reading the actual rows shows otherwise:

- **96% of the category is a single capital event** — one property purchase,
  three rows, one date, split across a shared account and two personal ones.
- The **remaining 94 rows average under $100** and are ordinary homeware:
  flat-pack furniture, kitchen equipment, decorations, small appliances.

So `Home` needed one thing the draft lacked — an isolated `Property purchase`
leaf, flagged as capital (`SPEC.md` §6.8) — and did *not* need a deep renovation
breakdown derived from history, because that history does not exist.

The renovation leaves stay, but as a **forecast rather than a finding**: the
house is months old, and the spending they anticipate has not happened yet.

**Descriptions are trilingual.** English, Polish and Russian all appear in the
same category, often in the same month. The classification prompt must handle
this explicitly (`SPEC.md` §9.2) — it is not an edge case, it is most of the
tail.

**The old data is genuinely misclassified.** Rows literally described
"Groceries" sit under `Household`, as does at least one debt settlement. This
is an argument for an agent-assisted reclassification pass rather than trusting
the inherited categories.

**Also open**

- Is `Business revenue` live yet, or anticipated? It shapes whether the ryczałt
  rate field is needed at build time or later.
- Do you want `Uncategorized` to block anything — a nag on the dashboard, or
  silent?
- Any leaves here you would never use, and any missing that you have wanted?
