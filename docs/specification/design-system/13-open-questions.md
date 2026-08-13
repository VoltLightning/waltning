# Open questions

| # | Question | Blocks | Recommendation |
|---|---|---|---|
| ~~**Q1**~~ | ~~`green-300` undefined~~ | — | **Decided: `#a3d2b8`**, interpolated between 200 and 400. Now in §2.1 |
| ~~**Q2**~~ | ~~Seven categories in one hue ramp fails colour-independence~~ | — | **Resolved** — cap at 5 segments + *other*, every segment directly labelled with its value. Single-hue ramp kept; the chart reads in greyscale (§7.2) |
| ~~**Q3**~~ | ~~Chips ~34px vs the 44px floor~~ | — | **Decided:** raise padding in the `Chip` primitive so every instance clears 44px. Accept the density loss — fixing this once at the source is a day; fixing it across 29 screens is a week |
| ~~**Q4**~~ | ~~No revert on approved diffs~~ | — | **Decided:** session-duration revert on the applied card. Beyond the session, correction goes through normal editing with its audit trail |
| ~~**Q5**~~ | ~~Partial approval for multi-intent voice~~ | — | **Decided:** per-card Approve / Decline. *Approve both* stays as a convenience, but never as the only control |
| ~~**Q6**~~ | ~~Movable confidence threshold~~ | — | **Decided:** draggable, with the affected count updating live in the bulk-accept label |
| ~~**Q7**~~ | ~~Category maintenance~~ | — | **Decided: build it.** Not really optional — 122 categories with 13 name collisions exist today and nothing can currently fix them (S19) |
| ~~**Q8**~~ | ~~Calendar cell density~~ | — | **Decided:** net figure always; category dots on week and month only, where there is room. Never count alone — a number of transactions answers nothing |
| ~~**Q9**~~ | ~~Calendar vs transactions list~~ | — | **Decided: complement.** The list answers *"find what I remember"*; the calendar answers *"what happened then"*. Both are entry points to the same detail screen (`flows/J05-find-and-fix.md`) |
| ~~**Q10**~~ | ~~Counterparty identity~~ | — | **Decided:** monogram on a ramp tint, derived deterministically from the name. No photo picker — it is a debt ledger, not a contacts app |
| ~~**Q11**~~ | ~~Settlement documentation~~ | — | **Decided:** optional but prompted. An undocumented settlement is precisely the one that gets disputed later |

### Contradictions with `SPEC.md` — both now resolved

Flagged rather than silently reconciled, because both were decisions.

**~~C1 · Main currency~~ — dissolved.** The original design board said PLN;
`SPEC.md` said USD; Money Manager holds USD. The contradiction existed only
because the design assumed a single reporting currency.

There is now no main currency (`SPEC.md` §7.0). USD is the invisible **pivot**
for rate storage — which is what Money Manager already holds, so migration
needs no conversion — and PLN, USD and EUR are all pinned to the display
toggle. Both documents were describing preferences that no longer conflict.

**~~C2 · O1~~ — resolved.** The design board answered the tax-form
question as *all three* Polish schemes — skala, liniowy, and ryczałt — and
`SPEC.md` §17 now records it. It adds the ryczałt revenue-rate field (which
exists nowhere else in the design and cannot be inferred from the expense
taxonomy), a scheme timeline rather than a dropdown, and a tax view that
removes the cost side under ryczałt with a stated reason rather than blanking
it.

Also settled since: **VAT** — not registered, so NIP / KSeF / document-ref
fields exist but no JPK_V7 handling is built. **Jurisdictions** — all three
scheme definitions written now, adapters implemented on demand, Poland first.
