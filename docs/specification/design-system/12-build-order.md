# Build order

Components before screens, because working rule 1 — *a screen never invents a
component* — only holds if the vocabulary exists first. Otherwise each screen
coins its own props and the design system becomes a retrofit of thirty
accumulated inventions.

| Phase | Deliverable | Rationale |
|---|---|---|
| **D0** | Token module + `Amount`, `FxAmount`, `TransferAmount` | Every screen depends on them; **P1 is enforced here or nowhere**. `FxAmount` must be unable to render without a rate |
| **D1** | Primitives — `Button`, `Tag`, `Pill`, `Chip`, `SegmentControl`, inputs | Fix the 44px floor once, at the source. Fixing it across thirty screens is a week; fixing it here is a day (Q3) |
| **D2** | `Card`, `Shell`, `GroundPanel`, rows, `TabBar`, `BottomSheet`, `DualTotal` | Structure for every screen. `DualTotal` belongs here rather than later because *mine* and *ours* appear on every headline figure (§6.7) |
| **D3** | `DiffCard` + `ToolResultCard` | **One gate, three call sites** — agent, voice, receipt. Build before any of them, or three variants appear (P3) |
| **D4** | States and recovery — `EmptyState`×3, `ErrorState`×3, `Skeleton`, `Banner`, `UndoToast`, `MatchWarning`, `ThinkingIndicator`, `RefusalCard`, `ThresholdSlider`, `RuleHealthTag` | Builds §8. Larger than it first looked: fourteen undesigned states resolved to **eleven shared components**, every one used by two or more screens. Built per-screen they would have become eleven near-duplicates |
| **D5** | Data surfaces — `FilterBar`, `SwipeAction`, `AuditHistory`, `ComparisonTable` (§5.6) | `FilterBar` feeds `EmptyState(filtered)`'s excluded count, so it lands after D4 rather than before |
| **D6** | Charts + `Legend` + `PeriodPicker` | Unblocked — 5 segments + *other*, directly labelled; the line chart pairs hue with marker shape (§7) |
| **D7** | `Calendar` + cells + both navigation modes (§6) | Virtualization is the hard part — ~2,100 days from 2020. Build it once for continuous and stepped |
| **D8** | Debt — `BalanceLedger`, `SettleSheet`, `CounterpartyPicker`, `AgeingBar` (§5.5) | Depends on D0's money components. `BalanceLedger` owns the cash-flow-sign negation so no screen repeats it (§6.6) |
| **D9** | FX administration — `RateTable`, `RateEditor`, `SyncLog` (§4.6–4.8) | `SyncLog`'s coverage view is the one that would have caught GEL at 0.5%. Worth building before the ledger fills, not after |
| **D10** | Dashboard — `WidgetGrid`, `WidgetCard`, `LayoutPicker` (§5.7) | Needs D6's charts, since most widgets are charts |
| **D11** | Tax and export — `SchemeTimeline`, `SchemeSelector`, `WorkbookBuilder`, `ManifestCard` (§5.8) | Last, and lowest frequency. `ManifestCard` reads its assertion from the export path rather than composing it |
| **D12** | Accessibility pass | Measured contrast, targets, reduced-motion branches, live regions, labels |
| **D13** | Screens, in journey order | Everything above already exists by now |

D0–D4 build against `packages/ui`; everything after consumes it.

## Two dependencies worth stating

**D4 before D5.** `FilterBar` has to report the count each filter excludes, and
that number is what `EmptyState(filtered)` renders. Building the empty state
after the filter bar means retrofitting the count.

**D12 is a pass, not a phase.** The 44px floor is fixed in D1 and the
reduced-motion branches in D4 and D5 — D12 measures and closes what those
missed, rather than being where accessibility starts. Accessibility arriving
last as a single phase is how it gets cut.

## Against §16

`SPEC.md` §16 phases the *system* — API, mobile, receipts, import, agent,
export. This phases the *component layer*, which is a prerequisite for its
Phase 1. The two were written independently and neither referenced the other.

**They are now reconciled in [`../build-order.md`](../build-order.md), which is
the sequence to follow.** It disagrees with this file in three places, and the
reasons are worth knowing before using the table above on its own:

- **D0–D2 are not a blocking prelude.** They are ~4 days; holding a fortnight of
  API work behind them idles both sides. They are Phase 1's first week.
- **D3 moves to the first consumer, which is receipts** — earlier than fourth
  here and earlier than §16's Phase 3 implies. One gate, three call sites, and
  the first site to need it should build it.
- **D13 is not a phase.** "Screens, in journey order" is what every system phase
  spends most of its time doing.

D9 is the one place this file's order beats §16's, and it survives unchanged:
`SyncLog`'s coverage view is what would have caught GEL at 0.5%, and it is worth
having before the ledger fills rather than after.
