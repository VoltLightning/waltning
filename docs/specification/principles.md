# UX principles

Five rules the components encode, so screens inherit them rather than
re-implementing them.

**P1 · A converted amount never travels alone.** Any foreign figure renders as
*local · rate · display*, with the rate for that row's own date. There is no
component that displays a converted amount without its basis. This is a
component-level guarantee, not a guideline — `<Amount>` cannot render a
conversion without a rate.

**P2 · Machine-filled fields declare themselves.** Anything a model produced —
voice, OCR, classification — carries a visible trail and an Undo. The draft is
never a black box.

**P3 · One approval gate, one treatment.** Agent writes, voice writes, and
receipt extraction all pass through the same `<DiffCard>`. One pattern used in
three places, not three patterns.

**P4 · Amber means one thing: not finished, or not fully observed.** It covers
a figure you asserted rather than measured (a manual FX override), an action
still outstanding (unsettled clearing, an open item), and data that has aged
past trust (a stale rate). What holds the meaning together is what amber never
is: it is never an error, never a success, and never chrome. A single idea with
four instances keeps its signal; an enumeration of two that the components
quietly grew to four had already lost it.

**P5 · Colour is never the only encoding.** Every tint pairs with text, an
icon, or a label. Charts included: composition charts cap at five segments and
label each directly (`design-system/07` §7.2), and the income-versus-expense
line pairs its two hues with distinct strokes and end-of-line labels (§7.1).
