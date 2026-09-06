# States and recovery

The missing state is where products break. `05-composites.md` §5.4 names
`EmptyState`, `ErrorState` and `Banner` in one line each, which was enough to
reference them and not enough to build them — so fourteen failure states across
nine journeys stayed marked `⊗` with nowhere to be specified. This is that
place.

Two rules generate most of what follows:

> **Never report absence without naming its cause.** "No results" is not a
> state, it is a shrug. *Nothing matches* and *nothing exists* are different
> facts with different actions.
>
> **Never discard the user's material on failure.** A recording, a photograph, a
> half-typed draft, an import row — the failure is the system's, and the cost of
> it must not be the user's work.

---

## 8.1 Empty is three states, not one

Conflating them is the commonest failure in this system, because the same blank
region means three unrelated things.

| Variant | Means | Must offer |
|---|---|---|
| `first-run` | Nothing has ever existed here | The creating action, and the import path if one applies |
| `filtered` | Things exist; **this filter** excludes them | The name of the excluding filter, and one tap to clear *it* — not everything |
| `range` | Things exist; this **period** has none | The nearest period that does, with its count |

`filtered` is the one that gets built wrong. A stale scope segment is the usual
cause of an unexpectedly empty list, and a message that does not name it sends
the user hunting through a filter bar. So:

```
  No transactions match

  Scope · Business  is excluding 1,284 rows        [ Clear scope ]
  Feb 2026                                         [ Clear all ]
```

**Naming the count that is being excluded is what makes it actionable.** It also
tells you the data is there, which is the reassurance actually wanted.

`range` must never read as an error, and in a tax context must not even read as
a problem — a quarter with no revenue is a legitimate answer you may need to
evidence (§8.6).

---

## 8.2 Error states

`ErrorState` carries four things, always: **what failed · why · what it costs
you · what to do next.** Never a bare code, and never an apology in place of an
action.

| Variant | Use | Retains |
|---|---|---|
| `recoverable` | Retry is likely to work — network, timeout, provider | The attempt, so retry costs nothing |
| `terminal` | Retry will not help — malformed file, dead source | The input, for inspection or export |
| `partial` | Some of it worked | The successful part, explicitly counted |

`partial` is the subtle one. A parse that reads 340 of 358 rows should proceed
with 340 and queue 18 for review — but it must **state both numbers**, because
silent partial success is how a month goes half-imported and nobody notices
until reconciliation.

---

## 8.3 Offline

Offline is a **statement about freshness**, not a failure, and the copy should
say so. `Showing data as of 14:06` beats `Offline` — one tells you what you are
looking at, the other tells you what you cannot do.

| Surface | Behaviour |
|---|---|
| Reads | Serve the local cache. Page-level `Banner(neutral)` with the age of the data |
| Writes | Outbox, with a client-generated UUID (`SPEC.md` §14.3). The row shows a `pending` marker and reads as saved, because it is |
| Rates | Last known, `FxStatusChip` amber with age. Every converted figure inherits the marker (P1) |
| Agent | Disabled with the reason stated. Not queued — a turn is not a replayable write |

**The dashboard is the exception worth calling out.** It is the landing surface,
so silence there is worst: every widget renders its cached value with a
last-updated time, and a widget that cannot render from cache shows a skeleton
labelled *unavailable offline* rather than a zero. A zero is a number, and a
wrong number is worse than an absent one.

---

## 8.4 Recovery patterns

### `UndoToast` — for anything reversible

Transient, 8 seconds, with the action named. Rapid repeats **collapse into one
toast with a count** rather than stacking — `3 rows accepted · Undo`.

A bulk operation is **one undoable unit**. Accepting 23 import rows undoes as 23
rows, not one; anything else teaches the user to distrust the button.

Undo must reverse the *effect*, not just the marker: accepting an import row
writes a transaction, so undoing soft-deletes it and returns the row to its
prior status. Keyboard: `U`, and `Cmd/Ctrl+Z` where a text field is not focused.

### `MatchWarning` — before creating a near-duplicate

Fires on save when a new name closely matches an existing one. Shows the
candidate **with its balance and transaction count**, because that is what makes
the risk legible — merging two spellings of one person corrupts a balance
(`SPEC.md` §6.6), and an abstract warning does not convey that.

Matching is **trigram similarity, tuned loose**, showing the top three
candidates ranked by score rather than one verdict — `Ania` should surface
`Nina`, which normalized equality never will.

Two explicit actions, no default: *This is the same one* (merges) / *These are
different* (proceeds, and **records the decision** so the pair is never queried
again). Never auto-merges, never silently allows.

**The recorded dismissal is what makes a loose threshold correct.** The standard
objection to over-firing warnings is that they train dismissal — but a question
asked once per pair and never repeated cannot. So the cost of a false positive
is one tap, once, and the cost of a false negative is a balance split silently
across two records.

### `RetryAction` — bounded, and honest about why

Retry is the wrong remedy for a rate limit, and the FX layer already learned
this: NBG answers a self-redirect once its bot defence trips, and retrying is
futile. So a retry affordance states whether it will back off or pace, and a
rate-limited source offers *retry later* rather than *retry*.

---

## 8.5 Waiting

Agent turns run 3–15 s (`SPEC.md` §15) and receipt extraction 2–5 s. **A blank
canvas for fifteen seconds is indistinguishable from a hang.**

`ThinkingIndicator` has three phases, and shows which one it is in:

| Phase | Treatment |
|---|---|
| Thinking | No output yet. Elapsed timer appears after 2 s |
| Tool running | Names the tool — `search_transactions · 1.2 s` |
| Streaming | Text as it arrives |

Thinking and tool running both carry a dot beside the label that steps one,
two, three, drop — `.` → `..` → `...` → nothing — on a 250 ms beat and
repeats, so the row reads as a live count rather than a fixed decoration. The
dot's own box holds the width of three periods at every step, so the label
beside it never shifts as the count changes. Streaming gets no dot: the text
arriving is already the sign of life, and a stepping dot beside moving text
would be two signals for one fact. `motion-none` (§2.7) shows the three dots,
still — the same full step the beat also reaches, held rather than stepped.

After 20 s: an explicit *still working* with a **cancel**. Every phase needs a
`motion-none` branch (§2.7).

`Skeleton` matches the shape it replaces — never a grey box, and never a
spinner over a whole page.

---

## 8.6 The fourteen, resolved

Each journey's §5 carries the detail; this is the register.

| # | Journey | State | Resolution |
|---|---|---|---|
| 1 | J3 | Unreadable photo | `ErrorState(terminal)`, **image retained**, partial extraction shown. Retake · enter by hand with the image attached · keep image only |
| 2 | J4 | No undo on accept/skip | `UndoToast`, session action stack, `U` key. Bulk accept is one unit |
| 3 | J4 | Threshold not draggable | `ThresholdSlider`, live count in the button label, **cannot reach 1.00** |
| 4 | J5 | No results | `EmptyState(filtered)` naming the excluding filter and its hidden count |
| 5 | J5 | Offline | §8.3 — cache with age, outbox with `pending` markers |
| 6 | J6 | No data in range | `EmptyState(range)` offering the nearest period with data |
| 7 | J6 | Dashboard offline | §8.3, per-widget last-updated; never a zero in place of a value |
| 8 | J7 | Duplicate counterparty | `MatchWarning` showing the candidate's **balance** |
| 9 | J9 | No streaming or thinking state | `ThinkingIndicator`, three phases, cancel at 20 s |
| 10 | J9 | Refusal | `RefusalCard` — §8.7 |
| 11 | J11 | Export build failed | `ErrorState`, naming the sheet. **No partial workbook for a tax export** — §8.7 |
| 12 | J11 | Nothing in range | `EmptyState(range)`, and the export still builds with a zero-row manifest |
| 13 | J13 | Rule that never posted | `RuleHealthTag` — `never posted` · `overdue` · `ending soon` · `amount drifted` · `healthy` |
| 14 | J14 | Accounts empty | `EmptyState(first-run)`, reachable directly rather than only via J1 |

---

## 8.7 Two states that are not errors

**Refusal.** `stop_reason: "refusal"` must be checked **before reading content**
(`SPEC.md` §11.4). `RefusalCard` is visually distinct from both `ErrorState`
(nothing is broken) and a declined `DiffCard` (that was *your* action). It
states that the model declined, that the session continues, and offers a
rephrase. Treating a refusal as a crash would be a lie about what happened.

**A zero-row tax period.** A quarter with no revenue is a legitimate filing
position, so S27 still builds the workbook and the manifest still asserts zero
non-business rows — over zero rows. It is emphatically not an empty state with
a *try a different period* action.

The mirror of that: **a tax export never offers a partial workbook.** The
manifest asserts completeness (§13.1), and a partial file carrying that
assertion would be false. General workbooks may be downloaded partially, with
the missing sheets named.

---

## 8.8 New components this section introduces

Registered here so no screen invents them (working rule 1).

| Component | Where |
|---|---|
| `UndoToast` | `Toast` variant — §8.4 |
| `MatchWarning` | S15, and the J15 counterparty proposal review |
| `ThinkingIndicator` | S03, S08 |
| `RefusalCard` | S03 |
| `ThresholdSlider` | S02c |
| `RuleHealthTag` | S21 |
| `EmptyState` variants | `first-run` · `filtered` · `range` |
| `ErrorState` variants | `recoverable` · `terminal` · `partial` |
| `StartupFailed` | The ledger could not open — `_layout.tsx`'s own replacement for the whole app, before any router exists. Shows the failing layer's own sentence verbatim, and no `cost` line: a pre-journal rebuild deletes both stores before it can fail, so no constant claim about what was lost is true on every branch. `terminal` with no action by default — a refused migration and an unreadable file are both permanent; `recoverable` with **Try again** only where the cause is named as one another attempt clears, which today is the browser losing the race for its OPFS pool to the document it replaced (`architecture/14` §14.1) |
