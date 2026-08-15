# Waltning — Specification

The complete specification of the product: the principles it obeys, the design
system it is built from, every user journey, and every screen.

**Read in this order.** Each layer assumes the one above it.

| | |
|---|---|
| 1 | [`principles.md`](principles.md) — the five rules every screen inherits |
| 2 | [`design-system/`](design-system/) — tokens, components, states, build order |
| 3 | [`flows/`](flows/) — 17 journeys, ordered by how often they run |
| 4 | [`screens/`](screens/) — 31 screens, specified individually |
| 5 | [`operations.md`](operations.md) — the registry the UI and the agent are both generated from |
| 6 | [`computations.md`](computations.md) — every figure the interface promises, defined |
| 7 | [`defects.md`](defects.md) — what ten adversarial reviews found, and what is still open |
| 8 | [`completeness.md`](completeness.md) — nine domains audited by cross-referencing the spec against itself, and what each check found |
| 9 | [`migration-runbook.md`](migration-runbook.md) — the eleven-step procedure, its gates, and where rollback stops being practical |
| 10 | [`build-order.md`](build-order.md) — the single sequence, reconciling `SPEC.md` §16 with the component order |
| 11 | [`architecture/`](architecture/) — the engineering view: containers, components, domain model, sequences, deployment, budgets, test strategy |

**Outside this folder:** [`SPEC.md`](../../SPEC.md) is the system specification
— architecture, data model, FX semantics, tax layer. [`TAXONOMY.md`](../../TAXONOMY.md)
is the category tree. This folder specifies the *interface*; those specify what
sits underneath it.

> **Every personal name, bank and balance in this repository is fictional.**
> The design was derived from a real five-year ledger, and the examples keep that
> shape — a debt reassigned between three people, a trilingual statement
> description, a clearing account that never quite settles — because the
> reasoning only holds if the examples are realistic. The identities are not.
> Row counts, currency lists and the tax scheme are real: they describe the
> problem's shape and identify nobody.

**Templates:** [`_TEMPLATE-screen.md`](_TEMPLATE-screen.md) ·
[`_TEMPLATE-flow.md`](_TEMPLATE-flow.md). Every file follows one of them, so a
missing section is visible rather than merely absent.

---

## Status

**The specification is complete, and the open questions are now closed too.**
Seventeen journeys and thirty-one screens, every one written against its template with
no section missing and no `⊗` remaining.

All **75** numbered open questions across the screens and flows are decided, with
each decision recorded in place beside the question it answers rather than
collected elsewhere — so the reasoning stays next to the thing it governs. The
design system's own eleven (§13) are closed as well. The last three, on S32, were
the agent-memory questions: whether a memory is explained when used, whether it
survives a counterparty merge, and whether memory is shared across surfaces.

Three mechanical audits back that claim rather than resting on it: every screen
and flow conforms to its template, every operation a screen references exists in
the registry, and no `TODO`, `TBD` or `⊗` remains outside the templates
themselves.

### Journeys

All fifteen written against `_TEMPLATE-flow.md`, and **no `⊗` remains** — the
fourteen undesigned failure states are resolved in
[`design-system/08`](design-system/08-states-and-recovery.md) §8.6 and detailed
in each journey's §5.

| | Journey | Frequency | Status |
|---|---|---|---|
| [J1](flows/J01-first-run.md) | First run | once | specified |
| [J2](flows/J02-daily-capture.md) | Daily capture | several times a day | specified |
| [J3](flows/J03-receipt-to-split.md) | Receipt to split | a few times a week | specified |
| [J4](flows/J04-monthly-import.md) | Monthly import | monthly | specified |
| [J5](flows/J05-find-and-fix.md) | Find and fix | several times a week | specified |
| [J6](flows/J06-review-a-period.md) | Review a period | weekly–monthly | specified |
| [J7](flows/J07-lend-and-settle.md) | Lend and settle | weekly | specified |
| [J8](flows/J08-group-expense.md) | Group expense | weekly | specified |
| [J9](flows/J09-ask-the-agent.md) | Ask the agent | a few times a week | specified |
| [J10](flows/J10-currency-and-rates.md) | Currency and rates | daily (auto) | specified |
| [J11](flows/J11-close-a-tax-period.md) | Close a tax period | annually | specified |
| [J12](flows/J12-maintain-categories.md) | Maintain categories | rare | specified |
| [J13](flows/J13-recurring.md) | Recurring | monthly | specified |
| [J14](flows/J14-accounts.md) | Accounts | rare | specified |
| [J15](flows/J15-cutover.md) | Cutover | once | specified |
| [J16](flows/J16-move-money.md) | Move money between your own accounts | weekly | specified |
| [J17](flows/J17-correct-the-agent.md) | The agent learns something, and you correct it | monthly | specified |

**Still open, but not design gaps:** GEL holds 0.5% of its rate range
(`SPEC.md` §7.7) — a data problem with a designed remedy, not an undesigned
state.

### Screens

**One document per concept, both surfaces inside it** (`_TEMPLATE-screen.md`
§3). Purpose, components, data, states and rules are written once; only layout
and interaction split into mobile and web subsections.

**30 screens, and the IDs have two gaps.** S23 (Calendar · web) merged into S11
and S26 (Debt overview · web) into S12 — both were the same concept at a wider
density, which is exactly what a web subsection is for. Their numbers are
retired rather than reused: a screen ID is a stable identifier that flows and
commits refer to, not a position in a sequence.

### Depth is declared, not uniform

Specifying S28 Tax view to the same depth as S05 Quick add would be speculative
— it sits behind a tax layer in Phase 6, under a scheme where most of the screen
is deliberately absent, and some of its choices genuinely cannot be made well
before the ledger exists. So every screen gets **all nine sections**, and the
prose depth is tiered:

| Tier | Bar | Screens |
|---|---|---|
| **1 · deep** | Every state designed, both surfaces laid out, interaction specified to the keystroke | S01–S07, S09, S10, S11 |
| **2 · full** | All nine sections at working depth; layout described rather than drawn | S08, S12–S16, S25, S27, S28, S29, S31 |
| **3 · floor** | All nine sections, concise. Enough to build from, not enough to prototype from | S17–S22, S24, S30, S32, S33 |

A tier-3 screen is not a stub — it is a screen whose open questions are worth
more than its prose.

| | Screen | Surface | Visual | Tier | Status |
|---|---|---|---|---|---|
| [S01](screens/S01-dashboard.md) | Dashboard | web | ✅ | 1 | specified |
| [S02](screens/S02-import.md) | Import | web | ✅ | 1 | specified |
| [S03](screens/S03-agent.md) | Agent | both | ✅ | 1 | specified |
| [S04](screens/S04-today.md) | Today | mobile | ✅ | 1 | specified |
| [S05](screens/S05-quick-add.md) | Quick add | mobile | ✅ | 1 | specified |
| [S06](screens/S06-category-sheet.md) | Category sheet | both | ✅ | 1 | specified |
| [S07](screens/S07-receipt-capture-and-review.md) | Receipt capture and review | mobile · review both | ✅ | 1 | specified |
| [S08](screens/S08-voice-multi-intent.md) | Voice multi-intent | mobile | ✅ | 2 | specified |
| [S09](screens/S09-transaction-detail.md) | Transaction detail | both | — | 1 | specified |
| [S10](screens/S10-transactions-list.md) | Transactions list | both | — | 1 | specified |
| [S11](screens/S11-calendar.md) | Calendar | both | — | 1 | specified |
| [S12](screens/S12-debt-counterparties.md) | Debt | both | — | 2 | specified |
| [S13](screens/S13-counterparty-detail.md) | Counterparty detail | both | — | 2 | specified |
| [S14](screens/S14-settle-sheet.md) | Settle sheet | both | — | 2 | specified |
| [S15](screens/S15-counterparty-editor.md) | Counterparty editor | both | — | 2 | specified |
| [S16](screens/S16-accounts.md) | Accounts | both | — | 2 | specified |
| [S17](screens/S17-settings-currencies.md) | Settings · Currencies | both | — | 3 | specified |
| [S18](screens/S18-settings-exchange-rates.md) | Settings · Exchange rates | both | — | 3 | specified |
| [S19](screens/S19-settings-categories.md) | Settings · Categories | both | — | 3 | specified |
| [S20](screens/S20-settings-rules.md) | Settings · Rules | web | — | 3 | specified |
| [S21](screens/S21-settings-recurring.md) | Settings · Recurring | both | — | 3 | specified |
| [S22](screens/S22-settings-tax.md) | Settings · Tax | both | — | 3 | specified |
| [S24](screens/S24-dashboard-layout.md) | Dashboard layout | web | — | 3 | specified |
| [S25](screens/S25-reports.md) | Reports | web | — | 2 | specified |
| [S27](screens/S27-export.md) | Export | web | — | 2 | specified |
| [S28](screens/S28-tax-view.md) | Tax view | web | — | 2 | specified |
| [S29](screens/S29-setup-wizard.md) | Setup wizard | both | — | 2 | specified |
| [S30](screens/S30-settings-system.md) | Settings · System | both | — | 3 | specified |
| [S31](screens/S31-transfer.md) | Transfer | both | — | 2 | specified |
| [S32](screens/S32-agent-memory.md) | Settings · What the agent remembers | both | — | 3 | specified |

**Deliberately not on every surface.** S01 and S04 answer the same question at
different scales and would compete as landing surfaces, so neither is ported.
S02, S20, S24, S25, S27 and S28 are dense, keyboard-driven, sitting-down screens
— a phone version would be slower and less accurate than waiting for a laptop.
Each says so in its own §3 rather than leaving the absence to be inferred.

### Design system

| Section |
|---|
| [Tokens](design-system/02-tokens.md) |
| [Primitives](design-system/03-primitives.md) |
| [Money and FX components](design-system/04-money-and-fx-components.md) |
| [Composites](design-system/05-composites.md) |
| [Calendar](design-system/06-calendar.md) |
| [Data visualization](design-system/07-data-visualization.md) |
| [States and recovery](design-system/08-states-and-recovery.md) |
| [State matrix](design-system/09-state-matrix.md) |
| [Accessibility](design-system/10-accessibility.md) |
| [Platform notes](design-system/11-platform-notes.md) |
| [Build order](design-system/12-build-order.md) |
| [Open questions](design-system/13-open-questions.md) |

---

## Working rules

1. **A screen never invents a component.** If it needs something the design
   system lacks, the component is added to `design-system/` first. This is
   mechanically checkable, and worth checking — every component name appears in
   backticks, so the set named across `flows/` and `screens/` must be a subset
   of the set defined in `design-system/`. It was not, until the flow pass:
   fourteen components were referenced by screens and defined nowhere.
2. **A screen specifies all six states.** Loading, populated, empty, error,
   offline, gated. The missing state is where products break.
3. **Writes name their operation.** Every mutation goes through the operation
   registry (`SPEC.md` §11.0), so the agent inherits it for free.
4. **Open questions are numbered**, so they can be closed one at a time rather
   than surviving as a vague sense of unease.
5. **Nothing is duplicated.** A rule lives in `principles.md` or the design
   system; screens reference it. Restating drifts.
