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
| `amber` | `#f8eed9` | Fill — *not finished, or not fully observed* (P4). Never error, never success, never chrome |
| `amber-ink` | `#856223` | Text on amber |
| `negative` | `#a8452f` | Negative balances, MoM spend increases. **Never chrome** |
| `negative-bg` | `#f6e7e3` | Fill behind negative tags |
| `bolt` | `#f5c63d` | App icon accent only — not a UI colour |

**Shell gradient:** `linear-gradient(160deg, #0e2e20, #164531)`.

**Dark appearance is a semantic remap, not an inverted palette.** Components
continue to name roles such as `surface`, `text`, and `accent`; only the theme
maps those roles to values. The shipped dark map is closed:

| Role | Dark value |
|---|---|
| `ground` | `#08130d` |
| `surface` | `#10251a` |
| `subtleFill` / `tagNeutralFill` | `#173326` |
| `pressedFill` | `#214735` |
| `border` | `#2f5d46` |
| `hairline` | `rgba(203,230,214,.16)` |
| `text` | `#f2f6f1` |
| `textMuted` | `#a3b8ad` |
| `textOnAccent` | `#08130d` |
| `accent` / `accentIcon` / `focusRing` | `#75bd99` |
| `accentText` / `tagNeutralText` | `#a3d2b8` |
| `assertedFill` | `#3b301c` |
| `assertedText` | `#f1d18a` |
| `assertedBorder` | `#9f7a31` |
| `dangerFill` | `#3b211c` |
| `dangerText` | `#f0a08d` |
| `dangerBorder` | `#b95e49` |
| `shellFrom` | `#06100a` |
| `shellTo` | `#0e2e20` |

### 2.2 Typography

| Role | Family | Weight | Notes |
|---|---|---|---|
| UI | Figtree | 400 / 500 / 600 / 700 | All interface text |
| Display & money | Source Serif 4 | 600 (`opsz 8..60`) | Headings and figures only — the serif makes totals feel weighed rather than computed |
| Mono | `ui-monospace, Menlo` | — | Codes, IDs, rate values in dense tables |

**Every amount carries `font-variant-numeric: tabular-nums lining-nums`.** This
is mandatory — it is what lets columns align without a monospace face, and it
is the single most common omission when amounts are rendered ad hoc.

**It is not, however, what makes the column align. The font file is.** React
Native declares `fontVariant` on `TextStyleIOS` only; it is absent from
`TextStyleAndroid`, and because `TextStyle extends TextStyleIOS` it typechecks
everywhere and applies on iOS and web alone. So a face whose digits are
proportional by default aligns on two platforms out of three, silently.

Measured from the shipped files, in font units:

| Face | Digit advances | Default |
|---|---|---|
| Figtree 400 | `0`→641 … `1`→413, nine distinct widths | **proportional** (has `tnum`) |
| Source Serif 4 600 | all ten at 547 | **tabular** |

**So money renders in the display face at every size**, not only at `hero` and
`large` — which is what the table above already said and what `<Amount>` had
been diverging from. The declaration stays as a belt-and-braces no-op and as a
statement of intent; the guarantee is the file, pinned by `fonts.test.ts`
reading the digit advances out of the `.ttf`.

**Selecting a weight needs a face, not a family.** Each weight is a separate
file registered under its own name, so `fontFamily: Figtree` with `fontWeight:
600` finds no such family and either falls back or synthesises a bold from the
regular. Components ask for `face.ui(600)`.

**Faces are bundled, never fetched.** A webfont CDN is a third-party request on
every cold start: it breaks the appliance when the Pi has no route out, and it
tells whoever hosts it when the owner opened their finance app — the same
reasoning that keeps brand logos out of a CDN.

**Scale**

**Line height is stated as a ratio, not as a second absolute.** `allowFontScaling`
defaults to `true`, so the platform scales `fontSize` — and a pair of fixed
numbers leaves the relationship between them recorded nowhere, which is how a
line box stays put while the glyphs in it grow. The pairs below are the derived
values at the default text size and are unchanged.

**How far a step may grow is a decision, per step.** Body text is uncapped:
capping it defeats the setting for exactly the person who turned it up. The
display steps are capped and `display-hero` hardest — at 54 it already dominates
the screen, and an unbounded 2× is 108pt in a layout built for 54.

| Step | Max scale |
|---|---|
| `display-hero` | 1.4 |
| `display-1` | 1.5 |
| `display-2` | 1.6 |
| everything else | uncapped |

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
| `tag` | 10.5 / 1, `700`, `.08em`, uppercase | Pills and tags. A ratio of exactly 1 is deliberate — uppercase-only, so no descenders to clip |

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

Elevation is theme-dependent. Light appearance uses the shadows above. Dark
appearance uses lighter surfaces plus a one-pixel semantic border and zero
shadow opacity; adding black shadow to an already dark ground reduces
separation instead of creating it.

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
