# Tokens

### 2.1 Colour

The green ramp is the entire chart palette: magnitude reads as depth, so no
second hue is needed.

| Token | Value | Use |
|---|---|---|
| `canvas` | `#e6ece5` | Outside the app frame (design boards only) |
| `ground` | `#f2f6f1` | Page background; all cards sit on it |
| `surface` | `#ffffff` | Cards, sheets, rows |
| `ink` | `#1a2620` | Body text |
| `muted` | `#5f7168` | Secondary text, labels, captions |
| `green-50` | `#f2f9f4` | Table headers, inset boxes |
| `green-100` | `#e4f1e8` | Ramp floor, tag fills |
| `green-200` | `#cbe6d6` | Borders, rules, dividers |
| `green-300` | `#a3d2b8` | Chart step; the ramp's middle |
| `green-400` | `#75bd99` | Chart step; table header underline |
| `green-500` | `#48a479` | **Focus ring**; chart step; primary accent |
| `green-600` | `#2f7d5a` | Primary action fill; pins |
| `green-700` | `#215f45` | Links; heading ink; hover on 600 |
| `green-800` | `#164531` | Shell gradient end |
| `green-900` | `#0e2e20` | Shell gradient start; display headings |
| `amber` | `#f8eed9` | Fill — unsettled clearing, manual override **only** |
| `amber-ink` | `#856223` | Text on amber |
| `negative` | `#a8452f` | Negative balances, MoM spend increases. **Never chrome** |
| `negative-bg` | `#f6e7e3` | Fill behind negative tags |
| `bolt` | `#f5c63d` | App icon accent only — not a UI colour |

**Shell gradient:** `linear-gradient(160deg, #0e2e20, #164531)`.

### 2.2 Typography

| Role | Family | Weight | Notes |
|---|---|---|---|
| UI | Figtree | 400 / 500 / 600 / 700 | All interface text |
| Display & money | Source Serif 4 | 600 (`opsz 8..60`) | Headings and figures only — the serif makes totals feel weighed rather than computed |
| Mono | `ui-monospace, Menlo` | — | Codes, IDs, rate values in dense tables |

**Every amount carries `font-variant-numeric: tabular-nums lining-nums`.** This
is mandatory — it is what lets columns align without a monospace face, and it
is the single most common omission when amounts are rendered ad hoc.

**Scale**

| Step | Size / line-height | Use |
|---|---|---|
| `display-hero` | 54 / 1.05 | The one dominant total, in the display currency |
| `display-1` | 38 / 1.1 | Board and page titles |
| `display-2` | 23 / 1.2 | Section headings |
| `display-3` | 17 / 1.3 | Card titles |
| `body` | 14.5 / 1.62 | Default |
| `body-sm` | 13 / 1.5 | Table cells, dense rows |
| `caption` | 11.5 / 1.4 | Captions, metadata |
| `kicker` | 11 / 1.2, `700`, `.08em`, uppercase | Eyebrow labels |
| `tag` | 10.5 / 1, `700`, `.08em`, uppercase | Pills and tags |

### 2.3 Spacing

4px base. Permitted steps: **4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 22 · 26 · 34 · 44 · 52**.

The ladder is deliberately coarse above 16 — the existing mockups use 22, 26,
34, 44 and 52 for board and card padding, and rounding those to a strict 8-grid
would visibly change the designs.

### 2.4 Radius

| Token | Value | Use |
|---|---|---|
| `radius-pill` | `999px` | Tags, chips, pills |
| `radius-xs` | `3px` | Inline code |
| `radius-sm` | `8px` | Small icons, inputs |
| `radius-md` | `12px` | Inset boxes, rule callouts |
| `radius-lg` | `20px` | Cards, sheets |
| `radius-xl` | `24px` | Ground panel lifting over the shell |
| `radius-icon` | `13 / 18 / 28px` | App icon at 56 / 120 / 512 |

### 2.5 Elevation

| Token | Value | Use |
|---|---|---|
| `shadow-card` | `0 10px 26px rgba(18,48,34,.05)` | Default card |
| `shadow-raised` | `0 8px 26px rgba(14,46,32,.10)` | Panels, popovers |
| `shadow-frame` | `0 8px 34px rgba(14,46,32,.14)` | Device frames, modals |
| `border-hairline` | `1px solid rgba(14,46,32,.09)` | Dividers |

### 2.6 Focus

`2px solid green-500`, `2px` offset, on **every** interactive element. Never
removed, never replaced by a colour change alone.

### 2.7 Motion

| Token | Duration | Curve | Use |
|---|---|---|---|
| `motion-fast` | 120ms | `ease-out` | Hover, press, tint |
| `motion-base` | 200ms | `cubic-bezier(.2,0,0,1)` | Expand, reveal |
| `motion-sheet` | 280ms | `cubic-bezier(.2,0,0,1)` | Bottom sheet rise |
| `motion-none` | 0 | — | `prefers-reduced-motion` branch |

**Every animation needs the `motion-none` branch.** The waveform, the mic halo,
and the sheet rise are all currently unbranched (§10).

### 2.8 Icons

[Phosphor Icons](https://phosphoricons.com) — `fill` for brand and emphasis,
`duotone` for navigation. Icon-only buttons always carry an accessible label.
