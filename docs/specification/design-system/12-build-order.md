# Build order

| Phase | Deliverable | Rationale |
|---|---|---|
| **D0** | Token module + `Amount`, `FxAmount`, `TransferAmount` | Every screen depends on them; P1 is enforced here or nowhere |
| **D1** | Primitives — Button, Tag, Pill, Chip, Segment, inputs | Fix the 44px floor once, at the source |
| **D2** | `Card`, `Shell`, rows, `TabBar`, `BottomSheet` | Structure for every screen |
| **D3** | `DiffCard` + `ToolResultCard` | One gate, three call sites — build before any of them |
| **D4** | States — `EmptyState`, `ErrorState`, `Skeleton`, `Banner` | Closes §9, starting with Quick add |
| **D5** | Charts + `Legend` + `PeriodPicker` | Unblocked — 5 segments + *other*, directly labelled (§7.2) |
| **D6** | `Calendar` + cells + navigation (§6) | Virtualization is the hard part; build it once for both modes |
| **D7** | Debt — `BalanceLedger`, `SettleSheet`, `CounterpartyPicker` (§5.5) | Depends on D0's money components |
| **D8** | Accessibility pass | Measured contrast, targets, reduced motion, labels |
| **D9** | Screens 9–29 | Everything above already exists by now |

D0–D3 build against `packages/ui`; D7 consumes it. This inverts the current
order, where screens exist and components do not.
