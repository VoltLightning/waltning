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
| `hover` | `#e8edeb` | The fill under a pointer |
| `pressed` | `#e3e9e6` | The transient fill under a finger |
| `border` | `#dfe5e2` | Card edges, dividers, the outline of an unfilled control |
| `border-interactive` | `#bbc3be` | The resting edge of a control — an input, a chip |
| `border-strong` | `#8c958f` | An edge that must read alone: a selected control. **3:1 on `surface`**, the WCAG floor for a UI boundary |
| `ink` | `#171d1a` | Body text **and heading ink** — a heading is not a signal |
| `muted` | `#667069` | Secondary text, labels, captions; a transfer's figure |
| `accent` | `#22754f` | Primary action fill. **Job 1** |
| `accent-text` | `#1f6a48` | Links, a secondary action's label |
| `accent-icon` | `#3d9a6c` | Decorative accent marks; the **focus ring**. **Job 2** |
| `accent-fill` | `#e9f1ec` | A subtle green fill: a selected segment, a toggled chip. `accent-text` reads on it at 4.9:1 |
| `accent-fill-border` | `#adc9b9` | The edge of `accent-fill` |
| `income` | `#178249` | Credits, positive deltas. Deliberately brighter than `accent`: an event, not a control. **Job 3** |
| `spend` | `#b0402a` | Debits, negative balances, rising spend. A restrained red — unmistakable, not alarming |
| `green-100` … `green-900` | as below | The data ramp. **Job 4** |
| `amber` | `#f6efdc` | Fill — *not finished, or not fully observed* (P4). Never error, never success, never chrome |
| `amber-ink` | `#7b5b1d` | Text on amber |
| `amber-border` | `#dcc07a` | Edge of an amber tag or chip |
| `danger` | `#a33d26` | A destructive action, a refused write. **Never chrome** |
| `danger-bg` | `#f9e9e5` | Fill behind a danger tag |
| `danger-border` | `#e3a898` | Edge of a danger control |
| `shell` | `#18492f` | The header shell. **One flat colour; the gradient is gone.** A deep green at L\* 27 — see below |
| `shell-text` | `#f4f7f5` | Text on the shell |
| `shell-text-muted` | `#a9c4b6` | The currency marker, the mine/ours line |
| `shadow-ink` | `#0f2b1f` | The ink the one shadow is cast in. Never a fill, never a text colour |
| `bolt` | `#f5c63d` | App icon accent only — not a UI colour |

**Six steps for states, before a component needs them.** The 12-step scales
the field has converged on (Radix, Geist, Tailwind v4) reserve fixed jobs:
backgrounds, then a component's fill / hover / pressed, then a subtle border, an
interactive border and a strong border, then the solid, then two text
strengths. Our neutrals land within one step of Radix's green-tinted gray
(*Sage*) and our greens within one step of its green scale; what was missing
was the state steps, and `hover`, `border-interactive`, `border-strong`,
`accent-fill` and `accent-fill-border` are those, derived by OKLab
interpolation between the existing anchors so they sit between the old values
rather than beside them.

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
| `hoverFill` | `#202824` |
| `pressedFill` | `#252e29` |
| `border` | `#2b3530` |
| `borderInteractive` | `#48534d` |
| `borderStrong` | `#66716a` |
| `hairline` | `rgba(228,241,232,.12)` |
| `text` | `#eef2ef` |
| `textMuted` / `tagNeutralText` | `#9ba79f` |
| `textOnAccent` | `#0b1a12` |
| `accent` / `accentIcon` / `focusRing` | `#5cc08f` |
| `accentText` | `#8fd6b3` |
| `accentFill` | `#223229` |
| `accentFillBorder` | `#365f4a` |
| `income` | `#62d495` |
| `spend` | `#ea8f7b` |
| `assertedFill` | `#3a301b` |
| `assertedText` | `#f0d38c` |
| `assertedBorder` | `#8f7332` |
| `dangerFill` | `#3b201b` |
| `dangerText` | `#f1a390` |
| `dangerBorder` | `#a85a48` |
| `shell` | `#1c4d38` |
| `shellText` | `#f0f5f2` |
| `shellTextMuted` | `#a9c4b6` |

**The shell must read as a band, and it is the only pair where the fills do
that alone.** Everywhere else an edge is drawn: `elevation.card` puts a
one-pixel `border` between a card and the ground, which is why `#ffffff` on
`#f5f7f6` at 1.05:1 is fine. The shell/ground seam has no border by design —
the ground panel's rounded corners are the join — so the two fills carry the
separation themselves, and the floor is **1.5:1 in both themes**. Not a WCAG
number, because WCAG has none for this: 3:1 governs a boundary you must locate
precisely, and a full-width band is the easiest thing on a screen to see.

The first values failed it and passed every other check. `#0a1f16` in dark held
`shell-text` at 15.6:1 and sat at **1.10:1 against `ground`** and 1.01:1 against
`surface` — legible text on an area boundary nobody could see, so the screen
read as one flat black rectangle. In light, `#0f2b1f` at L\* 15 was a black
band with a green cast you had to be told about, which spends this section's one
structural grant of the brand colour on nothing.

So the shell is also held at **L\* ≥ 22 in both themes**, stated as lightness
rather than as a hue test because *green enough* is a question about how dark it
is — the hue was always right and never visible. The dark shell ends up the
*lighter* of the two: on a near-black ground a surface reads by rising.
`theme/theme.test.tsx` holds both floors.

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
bold from the regular. Components ask for a step, and the step names the face: `text.ui("body")`.

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

**Body is 16 on the phone.** It was 14.5 — a desktop size on a device held at
arm's length. Apple's floor for that is 17; Material's and Carbon's body is 16.
The dense-row size moves up with it and keeps the old body's number, so a
transaction row is now set at what was body.

**The display steps carry negative tracking**: −0.02em at 54, −0.015em at 38,
−0.01em at 23. Large sans type sets loose by default and reads as unset; the
tracking is what makes a headline figure look engineered rather than typed.

| Step | Size / line-height | Tracking | Weight | Use |
|---|---|---|---|---|
| `display-hero` | 54 / 1.05 | −0.02em | 600 | The one dominant total, in the display currency |
| `display-1` | 38 / 1.1 | −0.015em | 600 | Board and page titles |
| `display-2` | 23 / 1.2 | −0.01em | 600 | Section headings |
| `display-3` | 17 / 1.3 | — | 600 | Card titles |
| `body` | 16 / 1.5 | — | 400 | Default |
| `body-sm` | 14.5 / 1.52 | — | 400 | Table cells, dense rows |
| `caption` | 12 / 1.33 | — | 400 | Captions, metadata |
| `kicker` | 11 / 1.2, `.08em`, uppercase | | 700 | Eyebrow labels |
| `tag` | 10.5 / 1, `.08em`, uppercase | | 700 | Pills and tags. A ratio of exactly 1 is deliberate — uppercase-only, so no descenders to clip |

**A step is taken whole, through `text.ui` / `text.display` / `text.mono`.**
Every property in that table is part of the step, and naming a size is not
naming a step: `type.body.fontSize` takes one field and completes the other
three from whatever the component author remembered.

That is not hypothetical — it was the state of the system. The line-height
column reached exactly one component out of twenty, and the tracking column,
which the paragraph above spends itself justifying, reached **none**: the 54pt
headline total rendered at the platform's default leading with no tracking at
all. Nothing looked broken. It looked slightly wrong, which is the defect a
design system exists to make impossible and the one that never gets reported.

The weight column is new for the same reason. It sat on two steps as an unread
`fontWeight` — unread because a weight is chosen by naming a *face*, not by
declaring a number — while every other step left the decision at the call site.
`conformance.test.ts` refuses a component that reaches into a step for one of
its fields.

**Mono is a step too.** `text.mono("caption")` exists because the alternative
composes two spreads whose *order* decides whether the text is monospaced —
both rate lines had them the wrong way round, the caption's family won, and the
mono face was set and immediately discarded. Nothing failed; the rates just
were not monospaced.

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
| `shadow-float` | `0 1px 2px 10%` · `0 4px 10px 8%` · `0 12px 24px -8px 16%`, all `#0f2b1f` | **The floating add button, and nothing else** |
| `shadow-float-lifted` | `0 2px 4px 12%` · `0 10px 22px 10%` · `0 24px 40px -10px 22%` | The same button while it is being dragged |

The floating button is the one object *above* the page, and the shadow is what
says so: three layers — a tight contact edge, a mid cast, a soft far cast —
rather than one large blur, which is the glow removed everywhere else. The
opacities are low on purpose: Geist stacks its layers at 4–12%, and a first cut
at three times that read as a glow, which is the one thing a shadow here must
not do. In dark
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
| `motion-fast` | 120ms | `cubic-bezier(.23,1,.32,1)` | Press release, tint, anything entering or exiting. A **strong** ease-out — the built-in one barely decelerates |
| `motion-base` | 200ms | `cubic-bezier(.2,0,0,1)` | Expand, reveal, press-in |
| `motion-move` | 220ms | `cubic-bezier(.77,0,.175,1)` | Something already visible **moving** — the title sliding into its collapsed place. Ease-in-out: a visible thing leaves gently too |
| `motion-fold` | 260ms | `cubic-bezier(.2,0,0,1)` | The header collapsing and expanding; its moving parts use `move` |
| `motion-sheet` | 280ms | `cubic-bezier(.32,.72,0,1)` | Bottom sheet rise — the iOS drawer curve: quick off the edge, long settle |
| `motion-none` | 0 | — | `prefers-reduced-motion` branch |

**Three rules from the practitioners, adopted.** Nothing on a UI element runs
longer than 300ms. Nothing uses ease-in — it delays the moment the user is
watching. Only `transform` and `opacity` animate; never height, padding or
position, which is why the header fold is built on scale and translate rather
than on `font-size`.

**Press feedback is `scale(.97)`, and it is asymmetric.** In at `base`, out at
`fast`: slow where the person is deciding, quick where the system responds.
Every `Pressable` in the system gets it through one hook.

**How often an interaction happens decides whether it animates at all.** A
hundred times a day: no animation. Tens of times: press feedback only.
Occasionally: the standard motion. Rarely: delight. The named zero-animation
case is the keypad — a capture is a dozen taps several times a day, and a
keypad that animates feels slow by the second week. The sheet that holds it may
rise; the keys inside it may not.

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
