# Tokens

### 2.1 Colour

**Neutral ground; green is a signal.** The neutrals carry a faint green bias —
chosen, not inherited — and green itself has exactly four jobs: a primary
action, the focus ring, income, and the data ramp. Anything green that is none
of those is chrome, and chrome is neutral. The one structural exception is the
shell, which stays a deep green in both themes because it is the single place
the brand colour is allowed to be a surface.

| Token | Value | Use |
|---|---|---|
| `canvas` | `#e9ecea` | Outside the app frame (design boards only) |
| `ground` | `#f5f7f6` | Page background; all cards sit on it |
| `surface` | `#ffffff` | Cards, sheets, rows |
| `subtle` | `#eef2f0` | Table headers, inset boxes, neutral tag fills |
| `pressed` | `#e3e9e6` | The transient fill under a finger |
| `border` | `#dfe5e2` | Card edges, dividers, the outline of an unfilled control |
| `ink` | `#171d1a` | Body text **and heading ink** — a heading is not a signal |
| `muted` | `#667069` | Secondary text, labels, captions; a transfer's figure |
| `accent` | `#22754f` | Primary action fill. **Job 1** |
| `accent-text` | `#1f6a48` | Links, a secondary action's label |
| `accent-icon` | `#3d9a6c` | Decorative accent marks; the **focus ring**. **Job 2** |
| `income` | `#178249` | Credits, positive deltas. Deliberately brighter than `accent`: an event, not a control. **Job 3** |
| `spend` | `#b0402a` | Debits, negative balances, rising spend. A restrained red — unmistakable, not alarming |
| `green-100` … `green-900` | as below | The data ramp. **Job 4** |
| `amber` | `#f6efdc` | Fill — *not finished, or not fully observed* (P4). Never error, never success, never chrome |
| `amber-ink` | `#7b5b1d` | Text on amber |
| `amber-border` | `#dcc07a` | Edge of an amber tag or chip |
| `danger` | `#a33d26` | A destructive action, a refused write. **Never chrome** |
| `danger-bg` | `#f9e9e5` | Fill behind a danger tag |
| `danger-border` | `#e3a898` | Edge of a danger control |
| `shell` | `#0f2b1f` | The header shell. **One flat colour; the gradient is gone** |
| `shell-text` | `#f4f7f5` | Text on the shell |
| `shell-text-muted` | `#a9c4b6` | The currency marker, the mine/ours line |
| `bolt` | `#f5c63d` | App icon accent only — not a UI colour |

**The ramp**, which is the entire chart palette — magnitude reads as depth, so
no second hue is needed. Unchanged by the restyle; it was never the problem.

| Step | Value | Use |
|---|---|---|
| `green-100` | `#e4f1e8` | Ramp floor |
| `green-200` | `#cbe6d6` | |
| `green-300` | `#a3d2b8` | The ramp's middle |
| `green-400` | `#75bd99` | |
| `green-500` | `#48a479` | |
| `green-600` | `#2f7d5a` | |
| `green-700` | `#215f45` | |
| `green-800` | `#164531` | |
| `green-900` | `#0e2e20` | |

**Money has three colours of its own, and none of them is the accent.**
`<Amount>` takes a `kind` — `income`, `spend`, `transfer`, or `auto` — and
never a colour. `auto` is sign-based and is the default: a negative figure is
spend, anything else is ink, which is right for a balance, where a positive
number is not income but what you have. A row that knows it is income says so
and gets the brighter green; a transfer says so and gets `muted`, because money
moved between your own accounts is neither gained nor lost — and its two legs
are signed opposite ways, so sign alone would paint one green and one red.

**Dark appearance is a semantic remap, not an inverted palette.** Components
continue to name roles such as `surface`, `text`, and `accent`; only the theme
maps those roles to values. The shipped dark map is closed:

| Role | Dark value |
|---|---|
| `ground` | `#0e1210` |
| `surface` | `#161b18` |
| `subtleFill` / `tagNeutralFill` | `#1c2320` |
| `pressedFill` | `#252e29` |
| `border` | `#2b3530` |
| `hairline` | `rgba(228,241,232,.12)` |
| `text` | `#eef2ef` |
| `textMuted` / `tagNeutralText` | `#9ba79f` |
| `textOnAccent` | `#0b1a12` |
| `accent` / `accentIcon` / `focusRing` | `#5cc08f` |
| `accentText` | `#8fd6b3` |
| `income` | `#62d495` |
| `spend` | `#ea8f7b` |
| `assertedFill` | `#3a301b` |
| `assertedText` | `#f0d38c` |
| `assertedBorder` | `#8f7332` |
| `dangerFill` | `#3b201b` |
| `dangerText` | `#f1a390` |
| `dangerBorder` | `#a85a48` |
| `shell` | `#0a1f16` |
| `shellText` | `#f0f5f2` |
| `shellTextMuted` | `#86a496` |

### 2.2 Typography

| Role | Family | Weight | Notes |
|---|---|---|---|
| UI | IBM Plex Sans | 400 / 500 / 600 / 700 | All interface text |
| Display & money | IBM Plex Sans | 600 | Headings and figures. The same family — the name survives because a component that says *display* is saying *this is a headline or a figure* |
| Mono | `ui-monospace, Menlo` | — | Codes, IDs, rate values in dense tables |

**One family, and the digits chose it.** Every amount carries
`font-variant-numeric: tabular-nums lining-nums`, which is mandatory — it is
what lets columns align without a monospace face. **It is not, however, what
makes the column align. The font file is.** React Native declares
`fontVariant` on `TextStyleIOS` only; it is absent from `TextStyleAndroid`,
and because `TextStyle extends TextStyleIOS` it typechecks everywhere and
applies on iOS and web alone. So a face whose digits are proportional by
default aligns on two platforms out of three, silently.

That constraint decided the family. Seven candidates were measured from their
shipped `.ttf` files, in font units, with no feature applied:

| Face | Digit advances | Default |
|---|---|---|
| Inter 400 | nine distinct widths | proportional |
| Geist 400 | nine distinct widths | proportional |
| DM Sans 400 | nine distinct widths | proportional |
| Manrope 400 | nine distinct widths | proportional |
| Roboto 400 | all ten at 1151 | tabular |
| Source Sans 3 400 | all ten at 497 | tabular |
| **IBM Plex Sans** 400 / 600 / 700 | **all ten at 600, at every weight** | **tabular** |

Four of the seven would have misaligned every money column on Android however
well they read. Of the three that would not, Roboto reads as the platform's
own chrome and Source Sans is anonymous; Plex was designed as a tool face. So
money renders in Plex at every size and every weight, the declaration stays as
a belt-and-braces no-op and a statement of intent, and the guarantee is the
file — pinned by `fonts.test.ts` reading the digit advances out of each `.ttf`,
per weight, because a family can ship tabular digits at 400 and proportional at
700 and nothing about its name would say so.

**Selecting a weight needs a face, not a family.** Each weight is a separate
file registered under its own name, so `fontFamily: IBMPlexSans` with
`fontWeight: 600` finds no such family and either falls back or synthesises a
bold from the regular. Components ask for `face.ui(600)`.

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

Tightened. Cards were 20 and the ground panel 24, which together with a 26px
blur read as a consumer app; a tool is squarer.

| Token | Value | Use |
|---|---|---|
| `radius-pill` | `999px` | Tags, chips — and the floating add button, the only circle on the screen |
| `radius-xs` | `3px` | Inline code |
| `radius-sm` | `8px` | Controls: buttons, inputs |
| `radius-md` | `12px` | Cards, inset boxes |
| `radius-lg` | `16px` | Sheets; the ground panel lifting over the shell |
| `radius-icon` | `13 / 18 / 28px` | App icon at 56 / 120 / 512 |

### 2.5 Elevation

**One shadow, on the one thing that floats.**

Nothing that sits in the layout casts a shadow. A card is a surface with a
one-pixel `border`; a sheet is a surface with a scrim behind it; elevation is
conveyed by edge and by surface step. This is what the dark theme was already
doing — a shadow on a dark ground reduces separation rather than creating it —
and light now does the same, so the two themes differ in their values and not
in their mechanism.

| Token | Value | Use |
|---|---|---|
| `elevation-card` / `-raised` / `-frame` | `1px solid border`, no shadow | Every surface in the layout. The three names survive so a component can still say what kind of surface it is |
| `border-hairline` | `1px solid rgba(23,29,26,.10)` | Dividers |
| `shadow-float` | `0 1px 2px 22%` · `0 4px 10px 18%` · `0 12px 24px -8px 35%`, all `#0f2b1f` | **The floating add button, and nothing else** |
| `shadow-float-lifted` | `0 2px 4px 22%` · `0 10px 22px 22%` · `0 24px 40px -10px 45%` | The same button while it is being dragged |

The floating button is the one object *above* the page, and the shadow is what
says so: three layers — a tight contact edge, a mid cast, a soft far cast —
rather than one large blur, which is the glow removed everywhere else. In dark
appearance it also carries a one-pixel rim in `accent` at 18%, because on a
near-black ground a dark shadow alone does not separate it. React Native's
`shadow*` props express one shadow; a native surface gets the far layer, and
the web bundle composes all three.

### 2.6 Focus

`2px solid accent-icon`, `2px` offset, on **every** interactive element. Never
removed, never replaced by a colour change alone.

### 2.7 Motion

| Token | Duration | Curve | Use |
|---|---|---|---|
| `motion-fast` | 120ms | `ease-out` | Hover, press, tint |
| `motion-base` | 200ms | `cubic-bezier(.2,0,0,1)` | Expand, reveal |
| `motion-fold` | 260ms | `cubic-bezier(.2,0,0,1)` | The header collapsing and expanding |
| `motion-sheet` | 280ms | `cubic-bezier(.2,0,0,1)` | Bottom sheet rise |
| `motion-none` | 0 | — | `prefers-reduced-motion` branch |

**Every animation needs the `motion-none` branch.** The waveform, the mic halo,
and the sheet rise are all currently unbranched (§10).

### 2.8 Icons

[Phosphor Icons](https://phosphoricons.com) — `fill` for brand and emphasis,
`duotone` for navigation. Icon-only buttons always carry an accessible label.

### 2.9 The two moving parts of the screen

Two behaviours are specified here because they are tokens of the *shell*
rather than of any one screen, and because each has a rule a screen must not
reinvent.

**The add button floats.** A 56px circle, the only circle on the screen, and
the only thing with a shadow. It is the topmost layer — over the list, over
the header, over everything — so nothing ever pushes it away. Default
position: bottom-right, inset by 16px **plus the device's safe-area insets**
(`useSafeAreaInsets()` natively, `env(safe-area-inset-*)` on web), so it
clears the home indicator, the gesture bar, and a tab bar when one exists.
Drag it anywhere and it stays exactly where it is dropped — no edge snapping,
no forbidden zones; the only constraint is the safe area. Drag it into the
bottom band and it docks as a 44×22 tab with a chevron, at the column it was
dropped, sitting on top of the safe area rather than inside it. Tap the tab
and it returns to its last floating position, not the default. Position and
docked state are a **device preference** — stored like the appearance
setting, never a registry operation, never synced. It stays a button:
focusable, labelled, and a keyboard user is never asked to drag; tap always
adds, only a real drag moves it.

**The header collapses.** Expanded: the title, a status tag, the hero total,
the mine/ours line. Collapsed: title and tag at the left, the total at the
right, one row tall. Scrolling down past a small threshold folds it; scrolling
up does not unfold it until the top is reached, or the collapsed bar is
tapped — which opens the header without scrolling the list. The transition is
`motion-fold`: the title and tag scale in place, the hero fades and lifts out
while the compact figure rises in. Reduced motion gets an instant swap. The
floating button is above the header in both states and never reflows when it
folds. At desk width the threshold is larger; the behaviour is the same.
