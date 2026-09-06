# Tokens

### 2.1 Colour

**Warm ground; sage is the signal.** The app is a home, not a terminal: the
neutrals are warm — cream paper for the page, warm greys for text — chosen so
opening the ledger feels like opening a notebook rather than a dashboard. The
brand green is a muted sage, and it has exactly four jobs: a primary action,
the focus ring, income, and the data ramp. Anything green that is none of
those is chrome, and chrome is neutral. The one structural exception is the
shell, which stays a deep sage in both themes because it is the single place
the brand colour is allowed to be a surface.

Money's two event colours are *not* the brand: `income` is a livelier green
than `accent` and `spend` a warm, restrained red, and both hold their meaning
whatever the chrome around them does.

| Token | Value | Use |
|---|---|---|
| `canvas` | `#efe9dd` | Outside the app frame (design boards only) |
| `ground` | `#faf6ef` | Page background; all cards sit on it |
| `surface` | `#ffffff` | Cards, sheets, rows |
| `subtle` | `#f1ebe0` | Table headers, inset boxes, neutral tag fills, the segment track |
| `hover` | `#ece5d7` | The fill under a pointer |
| `pressed` | `#e6ddcb` | The transient fill under a finger |
| `border` | `#eae3d5` | Card edges, dividers, the outline of an unfilled control |
| `border-interactive` | `#c6bdaa` | The resting edge of a control — an input, a chip |
| `border-strong` | `#8d8672` | An edge that must read alone: a selected control. **3:1 on `surface`**, the WCAG floor for a UI boundary (3.63) |
| `ink` | `#33302a` | Body text **and heading ink** — a heading is not a signal. Warm near-black, never `#000` |
| `muted` | `#6e6759` | Secondary text, labels, captions; a transfer's figure. 5.2:1 on `ground` |
| `accent` | `#55704f` | Primary action fill. Sage. **Job 1** |
| `accent-text` | `#4c6247` | Links, a secondary action's label |
| `accent-icon` | `#6f8f66` | Decorative accent marks; the **focus ring**. **Job 2** |
| `accent-fill` | `#eef0e6` | A subtle sage fill: a selected segment, a toggled chip. `accent-text` reads on it at 5.8:1 |
| `accent-fill-border` | `#b9c6ae` | The edge of `accent-fill` |
| `income` | `#3f7a34` | Credits, positive deltas. Deliberately livelier than `accent`: an event, not a control. **Job 3** |
| `spend` | `#a8543c` | Debits, negative balances, rising spend. A warm, restrained red — unmistakable, not alarming |
| `green-100` … `green-900` | as below | The data ramp. **Job 4** |
| `amber` | `#f4ecdf` | Fill — *not finished, or not fully observed* (P4). Never error, never success, never chrome |
| `amber-ink` | `#77591c` | Text on amber |
| `amber-border` | `#d9bd75` | Edge of an amber tag or chip |
| `danger` | `#a33d26` | A destructive action, a refused write. **Never chrome** |
| `danger-bg` | `#f8e8e2` | Fill behind a danger tag |
| `danger-border` | `#dfa68f` | Edge of a danger control |
| `shell` | `#3c4f38` | The header shell. **One flat colour.** A deep sage at L\* 31 — see below |
| `shell-text` | `#f2f0e7` | Text on the shell |
| `shell-text-muted` | `#b8c4ae` | The currency marker, the mine/ours line |
| `shadow-ink` | `#262117` | The ink the one shadow is cast in. Never a fill, never a text colour |
| `bolt` | `#f5c63d` | App icon accent only — not a UI colour |

**Six steps for states, before a component needs them.** The 12-step scales
the field has converged on (Radix, Geist, Tailwind v4) reserve fixed jobs:
backgrounds, then a component's fill / hover / pressed, then a subtle border, an
interactive border and a strong border, then the solid, then two text
strengths. The warm neutrals keep that structure — `hover`,
`border-interactive`, `border-strong`, `accent-fill` and `accent-fill-border`
are the state steps, spaced so each sits between its neighbours rather than
beside them, and every text-on-fill pair is held at 4.5:1 by
`theme/theme.test.tsx`.

**The ramp**, which is the entire chart palette — magnitude reads as depth, so
no second hue is needed. Sage-toned to match the accent family.

| Step | Value | Use |
|---|---|---|
| `green-100` | `#ecefe4` | Ramp floor |
| `green-200` | `#d8dfc9` | |
| `green-300` | `#bccaa9` | The ramp's middle |
| `green-400` | `#9cb287` | |
| `green-500` | `#7c9a68` | |
| `green-600` | `#5f7d52` | |
| `green-700` | `#49613f` | |
| `green-800` | `#33452c` | |
| `green-900` | `#202d1c` | |

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

The dark theme is **warm charcoal** — a room with the lights low, not an OLED
void: the near-blacks carry the same warm bias as the light theme's creams,
and the accent stays a *saturated fill with a white label*, never a pale fill
with dark text.

| Role | Dark value |
|---|---|
| `ground` | `#1c1a15` |
| `surface` | `#26221b` |
| `subtleFill` / `tagNeutralFill` | `#2b2620` |
| `hoverFill` | `#302a23` |
| `pressedFill` | `#363027` |
| `border` | `#38332a` |
| `borderInteractive` | `#5a5344` |
| `borderStrong` | `#78715e` |
| `hairline` | `rgba(240,236,227,.12)` |
| `text` | `#f0ece3` |
| `textMuted` / `tagNeutralText` | `#a59d8d` |
| `textOnAccent` | `#ffffff` |
| `accent` | `#55704f` |
| `accentIcon` / `focusRing` | `#8fae84` |
| `accentText` | `#a4c297` |
| `accentFill` | `#2c3226` |
| `accentFillBorder` | `#46543c` |
| `income` | `#8fd47c` |
| `spend` | `#e0937b` |
| `assertedFill` | `#3a311d` |
| `assertedText` | `#e6cd8c` |
| `assertedBorder` | `#8f7a3a` |
| `dangerFill` | `#3d241c` |
| `dangerText` | `#f0a28c` |
| `dangerBorder` | `#a45f48` |
| `shell` | `#3d4f39` |
| `shellText` | `#f0f4ec` |
| `shellTextMuted` | `#b3c2a9` |

**The shell must read as a band, and it is the only pair where the fills do
that alone.** Everywhere else an edge is drawn: `elevation.card` puts a
one-pixel `border` between a card and the ground, which is why `#ffffff` on
`#faf6ef` at a near-1:1 ratio is fine. The shell/ground seam has no border by
design — the ground panel's rounded corners are the join — so the two fills
carry the separation themselves, and the floor is **1.5:1 in both themes**.
Not a WCAG number, because WCAG has none for this: 3:1 governs a boundary you
must locate precisely, and a full-width band is the easiest thing on a screen
to see.

The shell is also held at **L\* ≥ 22 in both themes**, stated as lightness
rather than as a hue test because *sage enough* is a question about how dark
it is: a shell dark enough to read as black spends this section's one
structural grant of the brand colour on nothing. Both shells sit at L\* ≈ 31 —
on the warm charcoal ground the dark shell reads by rising, on cream by
deepening, and the same lightness serves both. `theme/theme.test.tsx` holds
both floors.

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

4px base. Permitted steps: **2 · 4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 22 · 26 · 34 · 44 · 52**.

The 2 is the tight pair — a label and the hint directly under it — and it was
added the honest way: `gap: 2` had been hand-written in five components before
anyone noticed the scale had no step for it. A repeated off-scale value is a
missing token, not five mistakes.

The ladder is deliberately coarse above 16 — the existing mockups use 22, 26,
34, 44 and 52 for board and card padding, and rounding those to a strict 8-grid
would visibly change the designs.

### 2.4 Radius

Tightened. Cards were 20 and the ground panel 24, which together with a 26px
blur read as a consumer app; a tool is squarer.

| Token | Value | Use |
|---|---|---|
| `radius-pill` | `999px` | The round metaphors only: a radio's ring and dot, a switch's track and thumb, and the floating add button — the only full circle on the screen |
| `radius-xs` | `3px` | Inline code |
| `radius-sm` | `8px` | Controls: buttons, inputs — and every compact value-carrier: chip, tag, classification pill, segment thumb, multi-select token |
| `radius-md` | `12px` | Cards, inset boxes; the segment track |
| `radius-lg` | `16px` | Sheets; the ground panel lifting over the shell |
| `radius-icon` | `13 / 18 / 28px` | App icon at 56 / 120 / 512 |

**The shape rule: one soft-rectangle family, circles only where the metaphor
is round.** A pill-shaped chip is a capsule from someone else's app; a soft
rectangle at `sm` is a thing in this one. Chips, tags, tokens, segments,
buttons and inputs all share the `sm` corner, differing by size and padding
rather than by shape — so adjacency between a chip and a button reads as two
sizes of one material. `md` is a card, `lg` a sheet, `xs` a glyph-scale box (a
checkbox). `pill` survives only where roundness *is* the control: a radio is a
circle everywhere in computing, a switch is a sliding capsule, and the add
button is the one object floating above the page. No control invents a radius
between these.

**Control metrics, the ones that drifted before they were written down:**

| Class | Horizontal padding | Vertical |
|---|---|---|
| Field (text, amount, select) | `x2` 14 | 44 min-height carries it |
| Button | `x3` 16 | height by size |
| Chip / token | `x3` 16 / `xl` 12 | 44 / 36+hitSlop |
| Marker (tag, pill) | `lg` 10 | `xs` 4 |
| Selection row (toggle, checkbox, radio) | `md` 8 | `sm` 6 |

A control whose visual height sits under the 44 floor reaches it with
`hitSlop`, never by lying about its height — `IconButton` set the pattern, and
§3.1's `sm 32` / `md 40` were silently rendering at 44 until the button
adopted it.

### 2.5 Elevation

**One shadow, reserved for what floats above the page.**

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
| `shadow-float` | `0 1px 2px 10%` · `0 4px 10px 8%` · `0 12px 24px -8px 16%`, all `#0f2b1f` | **The floating add button and `Toast`/`UndoToast` — nothing else in the layout gets one** |
| `shadow-float-lifted` | `0 2px 4px 12%` · `0 10px 22px 10%` · `0 24px 40px -10px 22%` | The add button while it is being dragged |

The floating button and the toast are the two objects that sit *above* the
page rather than in it, and the shadow is what says so: three layers — a
tight contact edge, a mid cast, a soft far cast — rather than one large blur,
which is the glow removed everywhere else. The
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

**The library is Reanimated, the gestures are gesture-handler, and nothing
else moves anything** (`architecture/11` §8b). A token here is a duration and
a curve; `primitives/easing.ts` turns the curve into a Reanimated easing once.

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
Drag it and let go: it settles against the **nearer side edge**, 16px in plus
the inset, at the height it was dropped — the height is the user's, the side
is the nearer one, and it never rests on the edge itself. The settle is a
spring with a visible bounce, and the bounce is bounded: its damping is solved
from the distance so the overshoot is at most half the inset, which is what
keeps a desk-width throw from carrying it through the wall. Push it off the
bottom and it docks as a 44×22 tab with a chevron, at the column it was
dropped, sitting on top of the safe area rather than inside it. Tap the tab
and it returns to its last floating position, not the default. Position and
docked state are a **device preference** — stored like the appearance
setting, never a registry operation, never synced. It stays a button:
focusable, labelled, and a keyboard user is never asked to drag; tap always
adds, only a real drag moves it.

**And the page leaves room for it.** Being over everything is what makes the
button findable and what makes it cover things: a page whose bottom clearance
was its own design padding ended every list with the last row under a circle.
So the page's own scroller clears the button under its last row — the button's
height, the inset it rests on, and the design's breathing room above it, 94px
(`floating.clearance`), plus the device's bottom inset. A screen that owns a
virtualized list carries that clearance in the list's own bottom padding,
because clearance that lands on the panel rather than the scrolling content
only shortens the list and leaves a band of empty ground under it.

**The header collapses.** Expanded: the title, a status tag, the hero total,
the mine/ours line. Collapsed: title and tag at the left, the total at the
right, one row tall. Scrolling down past a small threshold folds it; scrolling
up does not unfold it until the top is reached, or the collapsed bar is
tapped — which opens the header without scrolling the list. The transition is
`motion-fold`: the title and tag scale in place, the hero fades and lifts out
while the compact figure rises in. Reduced motion gets an instant swap. The
floating button is above the header in both states and never reflows when it
folds. At desk width the threshold is larger; the behaviour is the same.

### 2.10 The desk breakpoint

**1024px, and one value for the whole app.** Every screen's web column is
already written against it — `screens/S01-dashboard.md` and its siblings each
draw a *"Web — ≥1024px"* layout, and `architecture/14` §14.4 states the
consequence: *"web-only" that meant "needs a browser" becomes "needs the
width."* This section makes that number a token rather than a figure repeated
in eighteen spec pages and copied into a media query by hand: `breakpoint.desk`
in `tokens.ts`, read through `useBreakpoint()` over `useWindowDimensions` — the
same device-reads-itself shape every other platform value in this file takes.
One threshold, because a phone that has crossed it renders the desk shell
(`05-composites.md` §5.1's `DeskBand`) and a phone that has not renders the
composition it always has; there is no third width.
