# Data visualization

All charts draw from the green ramp; magnitude is depth.

| Component | Use | Requirement |
|---|---|---|
| `PieChart` | Category share, whole-of-period | Max 5 segments + *other*, each directly labelled with its value |
| `DonutChart` | Category share with a centre total | Same cap. Legend is reinforcement, never the lookup mechanism |
| `LineChart` | **Income vs expense over time** | Two series, annual or arbitrary range |
| `BarChart` | Month over month | Increases in spend take `negative` ink |
| `AreaChart` | Cumulative net worth | Single series, ramp fill |
| `Treemap` | Category deep-dive | Tiles ≥ ramp 500 use white ink; ≤ 400 use `ink` |
| `TargetBar` | Progress against a monthly target (`SPEC.md` §14.7) | Over-target goes `negative` ink and states the overage — never a warning icon |
| `Sparkline` | Balance trend in rows, year-view cells | No axes; paired with a figure |
| `Legend` | Every chart | Order matches segment order |
| `PeriodPicker` | Every chart | Presets (month, quarter, year, YTD) **plus** an arbitrary range |

### 7.1 `<LineChart>` — income vs expense

Two series over a chosen period, at a granularity that follows the range
(daily ≤ 3 months, weekly ≤ 1 year, monthly beyond).

```
  income   green-600, solid
  expense  negative,  solid
  net      green-900, dashed — optional third series
```

This is the one place `negative` ink appears as a **series colour** rather than
an alert. That is a deliberate exception: expense-versus-income is the single
comparison where red carries its ordinary financial meaning, and forcing both
series into the green ramp would make them harder to tell apart, not easier.

Requirements: shared Y axis in the display currency · hover and tap crosshair
reading both series at that point · zero line always visible when net is shown ·
projected periods (§6.4) rendered dashed and labelled.

### 7.2 Pie versus donut

Both exist; they are not interchangeable.

| Use | Component |
|---|---|
| Composition alone, no meaningful total | `PieChart` |
| Composition **and** a total worth stating | `DonutChart` — the total sits in the hole |

**Neither shows more than five segments plus *other*, and every segment carries
a direct label with its value.**

Five is where adjacent steps in a single-hue ramp stay reliably
distinguishable. Beyond that, colour is doing work it cannot do — roughly 8% of
men have a colour vision deficiency, and the ramp has only seven usable steps
to begin with. The direct label is what makes the encoding colour-independent:
the chart stays readable in greyscale, and the legend becomes reinforcement
rather than the lookup mechanism.

Tapping *other* breaks the tail out as a list, which is a better reading
surface for small values than a sliver of arc ever was.

This preserves the single-hue palette and the "magnitude reads as depth"
principle, which patterns or a second hue family would both have cost.
