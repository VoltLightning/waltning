# Waltning — Specification

The complete specification of the product: the principles it obeys, the design
system it is built from, every user journey, and every screen.

**Read in this order.** Each layer assumes the one above it.

| | |
|---|---|
| 1 | [`principles.md`](principles.md) — the five rules every screen inherits |
| 2 | [`design-system/`](design-system/) — tokens, components, states |
| 3 | [`flows/`](flows/) — 15 journeys, ordered by how often they run |
| 4 | [`screens/`](screens/) — 29 screens, specified individually |

**Outside this folder:** [`SPEC.md`](../../SPEC.md) is the system specification
— architecture, data model, FX semantics, tax layer. [`TAXONOMY.md`](../../TAXONOMY.md)
is the category tree. This folder specifies the *interface*; those specify what
sits underneath it.

**Templates:** [`_TEMPLATE-screen.md`](_TEMPLATE-screen.md) ·
[`_TEMPLATE-flow.md`](_TEMPLATE-flow.md). Every file follows one of them, so a
missing section is visible rather than merely absent.

---

## Status

`migrated` means content was carried over from the old single-file docs and is
**thin** — usually a paragraph where the template wants nine sections.
`specified` means it has been written properly against the template.

### Journeys

| | Journey | Frequency | Status |
|---|---|---|---|
| [J1](flows/J01-first-run.md) | First run | once | migrated |
| [J2](flows/J02-daily-capture.md) | Daily capture | several times a day | migrated |
| [J3](flows/J03-receipt-to-split.md) | Receipt to split | a few times a week | migrated |
| [J4](flows/J04-monthly-import.md) | Monthly import | monthly | migrated |
| [J5](flows/J05-find-and-fix.md) | Find and fix | several times a week | migrated |
| [J6](flows/J06-review-a-period.md) | Review a period | weekly–monthly | migrated |
| [J7](flows/J07-lend-and-settle.md) | Lend and settle | weekly | migrated |
| [J8](flows/J08-group-expense.md) | Group expense | weekly | migrated |
| [J9](flows/J09-ask-the-agent.md) | Ask the agent | a few times a week | migrated |
| [J10](flows/J10-currency-and-rates.md) | Currency and rates | daily (auto) | migrated |
| [J11](flows/J11-close-a-tax-period.md) | Close a tax period | annually | migrated |
| [J12](flows/J12-maintain-categories.md) | Maintain categories | rare | migrated |
| [J13](flows/J13-recurring.md) | Recurring | monthly | migrated |
| [J14](flows/J14-accounts.md) | Accounts | rare | migrated |
| [J15](flows/J15-cutover.md) | Cutover | once | migrated |

### Screens

| | Screen | Surface | Visual design | Status |
|---|---|---|---|---|
| [S01](screens/S01-dashboard.md) | Dashboard | web | ✅ | migrated |
| [S02](screens/S02-import.md) | Import | web | ✅ | migrated |
| [S03](screens/S03-agent.md) | Agent | web | ✅ | migrated |
| [S04](screens/S04-today.md) | Today | mobile | ✅ | migrated |
| [S05](screens/S05-quick-add.md) | Quick add | mobile | ✅ | migrated |
| [S06](screens/S06-category-sheet.md) | Category sheet | mobile | ✅ | migrated |
| [S07](screens/S07-receipt-capture-and-review.md) | Receipt capture and review | mobile | ✅ | migrated |
| [S08](screens/S08-voice-multi-intent.md) | Voice multi-intent | mobile | ✅ | migrated |
| [S09](screens/S09-transaction-detail.md) | Transaction detail | mobile | — | migrated |
| [S10](screens/S10-transactions-list.md) | Transactions list | mobile | — | migrated |
| [S11](screens/S11-calendar.md) | Calendar | mobile | — | migrated |
| [S12](screens/S12-debt-counterparties.md) | Debt · counterparties | mobile | — | migrated |
| [S13](screens/S13-counterparty-detail.md) | Counterparty detail | mobile | — | migrated |
| [S14](screens/S14-settle-sheet.md) | Settle sheet | mobile | — | migrated |
| [S15](screens/S15-counterparty-editor.md) | Counterparty editor | mobile | — | migrated |
| [S16](screens/S16-accounts.md) | Accounts | mobile | — | migrated |
| [S17](screens/S17-settings-currencies.md) | Settings · Currencies | mobile | — | migrated |
| [S18](screens/S18-settings-exchange-rates.md) | Settings · Exchange rates | mobile | — | migrated |
| [S19](screens/S19-settings-categories.md) | Settings · Categories | mobile | — | migrated |
| [S20](screens/S20-settings-rules.md) | Settings · Rules | mobile | — | migrated |
| [S21](screens/S21-settings-recurring.md) | Settings · Recurring | mobile | — | migrated |
| [S22](screens/S22-settings-tax.md) | Settings · Tax | mobile | — | migrated |
| [S23](screens/S23-calendar-web.md) | Calendar (web) | web | — | migrated |
| [S24](screens/S24-dashboard-layout.md) | Dashboard layout | web | — | migrated |
| [S25](screens/S25-reports.md) | Reports | web | — | migrated |
| [S26](screens/S26-debt-overview.md) | Debt overview | web | — | migrated |
| [S27](screens/S27-export.md) | Export | web | — | migrated |
| [S28](screens/S28-tax-view.md) | Tax view | web | — | migrated |
| [S29](screens/S29-setup-wizard.md) | Setup wizard | both | — | migrated |

### Design system

| Section |
|---|
| [Tokens](design-system/02-tokens.md) |
| [Primitives](design-system/03-primitives.md) |
| [Money and FX components](design-system/04-money-and-fx-components.md) |
| [Composites](design-system/05-composites.md) |
| [Calendar](design-system/06-calendar.md) |
| [Data visualization](design-system/07-data-visualization.md) |
| [State matrix](design-system/09-state-matrix.md) |
| [Accessibility](design-system/10-accessibility.md) |
| [Platform notes](design-system/11-platform-notes.md) |
| [Build order](design-system/12-build-order.md) |
| [Open questions](design-system/13-open-questions.md) |

---

## Working rules

1. **A screen never invents a component.** If it needs something the design
   system lacks, the component is added to `design-system/` first.
2. **A screen specifies all six states.** Loading, populated, empty, error,
   offline, gated. The missing state is where products break.
3. **Writes name their operation.** Every mutation goes through the operation
   registry (`SPEC.md` §11.0), so the agent inherits it for free.
4. **Open questions are numbered**, so they can be closed one at a time rather
   than surviving as a vague sense of unease.
5. **Nothing is duplicated.** A rule lives in `principles.md` or the design
   system; screens reference it. Restating drifts.
