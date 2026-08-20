# S24 · Dashboard layout

**Surface** wide · **Journeys** J6 · **Frequency** rare
**Design** none
**Status** specified · tier 3

---

## 1. Purpose

Choose what the dashboard shows, and where.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| S01 | *Customise* | S01, new arrangement live |
| S03 | An agent layout write, approved | S01 |

## 3. Layout

### Mobile
Not supported at phone width — S01 doesn't render there either (§3), so
there is nothing to preview into. Both come along together once there is
width to give them (RN Web, DeX, an iPad; `architecture/14` §14.4).

### Web — ≥1024px

Layout picker at the top — named layouts, presets distinguished from custom,
active one marked. Beneath it, the widget list for the selected layout: kind,
size, slot, and per-widget config (period, scope, chart type, groups shown).

Live preview beside the list, at reduced scale. It **states when a configuration
would render nothing** — *no business rows this period* — so an empty widget is
caught here rather than discovered on the landing screen. The dashboard itself
still shows the honest empty state; this warns about intent, not about data.

## 4. Components

| Component | Notes |
|---|---|
| `LayoutPicker` | Named layouts; switching **preserves each layout's widget config**. A preset that has been changed reads `· modified` and offers *reset to default* |
| `WidgetCard` | One per configured widget, with its config affordance |
| `WidgetGrid` | The preview |
| `UndoToast` | Add, remove, resize |

## 5. Data

| Reads | Writes |
|---|---|
| `dashboard_layouts` and their widgets | `create_layout` · `set_active_layout` |
| The widget catalogue — what kinds exist (§11.0 introspection) | `add_widget` · `update_widget_config` · `remove_widget` |

Layouts are rows, not constants, which is what makes *"put family spending on my
dashboard"* an ordinary audited agent write rather than a special case.


### Targets are configured here, and this is the settings row §14.7 promised

`computations.md` §11 defines target progress and the registry carries
`get_targets` / `create_target` / `update_target` / `delete_target` — and until
now nothing rendered them. §14.7 asks for *"one widget, one settings row"*, and
this is both: the `targets` widget's config **is** the settings surface. A target
is one number against one category for one period, which does not earn a screen.

```
  Targets                                    [+ add]
  ────────────────────────────────────────────────────
  Eating out        month     1 200,00 zł    ▸  ●●●●○
  Groceries         month     2 000,00 zł    ▸  ●●●○○
  Overall           month    12 000,00 zł    ▸  ●●●●●  over
```

**Not envelope budgets** (N7). No rollover, no allocation between them, and going
over is **information rather than an error** — the bar renders over-target
plainly and nothing is enforced. §14.7's table is the whole distinction and it is
the reason this stays one widget rather than becoming a system.

Progress is period-to-date against `spend_to_date(p, scope=mine, capital
excluded)` (`computations.md` §11), converted at each row's own date. Capital is
excluded for the same reason it is excluded from every comparison — a one-off
purchase is not a trend.

## 6. States

| State | Treatment |
|---|---|
| Loading | Picker and list skeleton |
| Populated | A layout selected, its widgets listed |
| Empty | No custom layouts — the presets are always present, so this is never blank |
| Error | Save failed → the arrangement is retained locally |
| Offline | Read-only |
| Gated | Exactly one layout is active, enforced by a partial unique index — the same trick as the pivot currency |

## 7. Interaction

Reorder within the list moves the widget's slot. **Free drag-and-drop placement
on the grid itself is deferred by decision** (O16, §14.5) — presets answer the
question cheaply, and a layout engine built before knowing which arrangements
are wanted is a lot of work spent on a guess.

## 8. Rules this screen must obey

- **§14.5** — presets ship as seeded `is_preset` rows; switching preserves
  configuration rather than overwriting one stored grid.
- **§11.0** — the widget catalogue is introspectable, so the agent can enumerate
  what it is able to add.
- Every widget states its own period and scope, so a dashboard cannot show two
  figures on different frames without saying so.

## 9. Open questions

1. ~~**Which presets ship?**~~ **Decided: four, each answering one question.**
   Not four moods — four questions, so switching has a reason you can feel.

   | Preset | Question | Widgets |
   |---|---|---|
   | **Standing** | Where do I stand | `net_worth` M · `balances` L · `recent` M · `unsettled` S |
   | **Flowing** | Where is it going | `income_vs_expense` L · `spend_by_category` M · `calendar` M · `fx_status` S |
   | **Owing** | Who owes whom | `debt` L · `unsettled` M · `recent` scoped to counterparties M |
   | **Business** | What is reportable | `revenue_ytd` M · `completeness` M · `tax_period_status` S |

   **Business is the arguable one and is included deliberately.** Under ryczałt
   the reportable surface is small and the journey annual (J11), so it earns
   little daily real estate — but it is also the journey with the highest stakes
   and the longest gap between uses, which is exactly the combination that leaves
   you re-learning it every April. A preset you switch to twice a year is
   cheaper than a screen you have forgotten how to read.

   Three new widget kinds follow from this: `revenue_ytd`, `completeness`,
   `tax_period_status`. They read `tax_ledger`, so they inherit the exclusion
   guarantee (§13.1) rather than re-implementing it.
2. ~~**Can a preset be edited, or only cloned?**~~ **Decided: edit freely, with
   *reset to default* always available.** No fork, no naming decision at the
   moment you only wanted to move a widget. A modified preset is marked
   `· modified` and can be returned to its shipped arrangement at any time.

   **The reference point never lived in the database.** Preset *definitions* are
   constants in code; `is_preset` rows are instances of them. So resetting costs
   nothing to support and the pristine version cannot be destroyed — which is
   the whole objection to editing, removed by where the definition lives rather
   than by a rule about what you may touch.
3. ~~**Widget config has no validation surface.**~~ **Decided: warn at
   configure time, render honestly at run time.** The live preview states when a
   configuration would produce nothing — *no business rows this period, this
   widget will be empty* — so the mistake is caught where it is made.

   **The dashboard still shows the real empty state.** A period genuinely having
   no business rows is a true answer, and suppressing it would be worse than
   showing it. Auto-hiding was rejected for the same reason it usually is: a
   widget that vanishes is indistinguishable from one you never added, and a
   grid that rearranges itself is one you stop trusting to be complete.

   The warning is about *intent* — did you mean to build this — not about
   whether the data is acceptable.
