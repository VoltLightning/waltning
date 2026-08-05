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

**P4 · Amber means exactly two things.** Unsettled clearing, and a manual FX
override. Overloading it destroys its signal value.

**P5 · Colour is never the only encoding.** Every tint pairs with text, an
icon, or a label. Charts included — the current design does not meet this
(§10), which is why it is a principle and not a claim.
