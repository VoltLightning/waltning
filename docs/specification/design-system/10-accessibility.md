# Accessibility

| Requirement | State | Action |
|---|---|---|
| Contrast 4.5:1 body / 3:1 large | ⚠️ verify | Measure `muted #5f7168` on white, amber ink on amber (tightest pair), and ramp 300–400 tiles |
| Target ≥ 44px (WCAG 2.5.8) | ❌ fails | Chips measure ~34px. Tab-bar glyphs unverified |
| Focus visible | ✅ | 2px `green-500`, 2px offset |
| Colour not sole encoding | ✅ specified | Pills and overrides carry text; composition charts cap at 5 segments with direct labels (§7.2); the line chart pairs hue with marker shape and end labels (§7.1). Verify on implementation |
| Reduced motion | ❌ gap | Waveform, mic halo, sheet rise all need a branch |
| Screen reader | ❌ gap | Live regions for transcript and extraction progress; labels on icon-only buttons |
| Voice alternative | ❌ gap | Mic is the primary fast path with no non-audio equivalent for a noisy shop or a user who cannot speak. Keypad covers it but needs a visible *type instead* affordance |

**The 44px failure and the chart encoding are blocking**, not cosmetic — both
are systematic, so both are cheap to fix in the component layer and expensive
to fix screen by screen.
