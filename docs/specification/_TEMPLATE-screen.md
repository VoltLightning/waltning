# S00 · Screen name

**Surface** mobile | web | both · **Journeys** J0, J0 · **Frequency** daily | weekly | rare
**Design** none | `design/gaps.dc.html` §G0 | Claude Design project
**Status** stub | specified | designed | built

---

## 1. Purpose

One sentence: the question this screen answers. If it cannot be written in one
sentence the screen is doing two jobs.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|

## 3. Layout

**One document per concept, both surfaces inside it.** Purpose, components,
data, states and rules are written once because they do not differ by surface.
Only layout and interaction split — that is where a 390pt thumb and a 1440px
pointer genuinely diverge.

Delete the subsection that does not apply when **Surface** is single.

### Mobile — 390pt

Regions top to bottom. Say what occupies each and why it earns the space.
Name the thumb-zone anchor: what sits within reach without a hand shift.

### Web — ≥1024px

Regions by column, and what the extra width actually buys. If the answer is
"the same thing, wider", say so — a screen that gains nothing from the desktop
canvas should say it rather than invent density.

**Between 390 and 1024** the mobile layout stretches; there is no third design.

## 4. Components

Every component from `design-system/`, with any props that matter. New
components get flagged here and added there — never invented locally.

| Component | Notes |
|---|---|

## 5. Data

What it reads, and what it writes through the operation registry (`SPEC.md`
§11.0). Writes name the operation, because the agent gets the same one.

| Reads | Writes |
|---|---|

## 6. States

All six. A screen missing one is a screen with an undesigned failure.

| State | Treatment |
|---|---|
| Loading | |
| Populated | |
| Empty | |
| Error | |
| Offline | |
| Permission / gated | |

## 7. Interaction

Split like §3, and for the same reason.

### Mobile

Gestures, what each swipe direction does, haptics, what is destructive and what
confirms. Every touch target ≥44px (`design-system/10-accessibility.md`).

### Web

Keyboard map, focus order, what is reachable without the pointer. A dense
review or reporting screen that cannot be driven from the keyboard has not been
specified yet.

**Shared:** what is destructive, what confirms, and what is merely undoable.
`ConfirmDialog` is for the genuinely irreversible only (`design-system/05`).

## 8. Rules this screen must obey

Reference the principle rather than restating it — P1 amounts carry their
basis, P2 machine-filled fields declare themselves, P3 one approval gate,
P4 amber means two things, P5 colour is never alone.

## 9. Open questions

Numbered, so they can be closed individually.
