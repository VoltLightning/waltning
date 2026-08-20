# S35 · Conflict sheet

**Surface** both · **Journeys** J2 · **Frequency** a few times a year
**Design** none
**Status** specified · tier 2

---

## 1. Purpose

Decide which of two values for one field is the one you meant, when a queued
edit and the server disagree.

**Not a merge tool.** `architecture/14` §14.2 makes a same-field divergence
follow a setting — *latest applied wins* or *ask* — and this is what *ask*
looks like: one divergence, two values, a choice. The tax-sensitive set
(`is_business`, `ryczalt_rate`, `ryczalt_activity`, `counterparty_tax_id`,
`date`, `accounts.ownership`, `currencies.is_pivot`) always arrives here
regardless of the setting, because §11.2 and §14.2 both refuse to let a filed
figure move silently.

**Rare by construction, which is the design constraint.** One person, two
devices, editing the *same field* inside one sync window. Anything you would
have to learn to use is wrong for a surface seen a few times a year, so it
carries no vocabulary of its own: two values, where each came from, and two
buttons.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| S30 · System | Outbox badge → conflicts | S30 |
| S09 · Transaction detail | The affected row's conflict marker | S09, resolved |
| Global | Sync banner, when the drain reports conflicts | Wherever you were |

**Never opened by the drain itself.** The drain fires on foreground and on
reconnect — precisely when you have just opened the app to do something else —
so it records the conflict and raises a marker. You open this sheet when you
choose. An interruption arriving on a schedule you do not control is how a
prompt becomes a thing people dismiss without reading, and this prompt is the
last guard on a tax-sensitive field.

Closing part-way leaves the remaining conflicts marked and the entries blocked.
Dismissal is not resolution and never resolves by default.

## 3. Layout

### Both surfaces — sheet on mobile, modal on web

Same content, same order; the sheet is bottom-anchored on a phone and centred on
a wide screen, exactly as S06 and S14 already do it.

```
┌─────────────────────────────────────────┐
│  Conflicting edit              2 of 5   │   ← step, always visible
│                                         │
│  Bank A · PLN — 12 Mar                  │   ← the row this is about
│  Category                               │   ← the field, in plain words
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ ● Coffee                          │  │   ← yours
│  │   this phone · Tue 14:02, offline │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ ○ Groceries                       │  │   ← theirs
│  │   web · Wed 09:40                 │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ⚠ Affects a tax figure                 │   ← only when tax-sensitive
│                                         │
│  [ Keep mine ]        [ Keep theirs ]   │
└─────────────────────────────────────────┘
```

**The step count is not decoration.** Five conflicts presented one at a time
with no count is an unbounded queue, and an unbounded queue is what people stop
reading. Knowing it is five before you start is what makes finishing feel
possible.

**Grouped fields render as one decision.** §14.2's non-independent fields —
the four faces of a transfer, split lines with their parent — arrive as a single
conflict with the whole group shown on each side. Presenting them separately
would let you assemble a combination neither device ever held, which is the
outcome the grouping exists to prevent.

## 4. Components

| Component | Notes |
|---|---|
| `BottomSheet` | **Does not exist yet** (D2). This screen forces it, as S33's master switch forces `Toggle` |
| `Card` | One per side, selectable |
| `Amount` / `FxAmount` | When the conflicting field is money — never a bare string (`design-system/04`) |
| `Tag` | The tax-sensitive warning |
| `Button` | Two, equal weight — see §7 |

## 5. Data

Read from the local conflict record the drain wrote — **never re-fetched when
the sheet opens.** Re-reading would show a third state if anything moved in
between, and "the value you were shown is the value you chose" is the one
property this surface cannot give up.

| Field | Source |
|---|---|
| `field` | The operation's patch, expanded by `conflictGroups` |
| `mine`, `theirs` | `FieldPatch.to` and the server row at detection |
| `minedAt`, `theirsAt` | `capturedAt` (display only) and the server's `updated_at` |
| `taxSensitive` | `conflictDecision()` |
| `entryId` | The blocked outbox entry |
| `detectionId` | The `conflict_detected` audit row, so the sheet and the trail name the same event |

## 6. States

| State | Presentation |
|---|---|
| Resolving | The layout above |
| Tax-sensitive | Warning tag; both buttons still equal weight |
| Last one | Step reads "5 of 5"; closing returns to the entry point |
| All resolved | Sheet closes, marker clears, blocked entries re-drain |
| Value no longer applicable | The row was deleted server-side since detection — offer *discard my edit* alone, and say why |
| Offline | Fully usable. The decision is recorded locally and applied on the next drain, because deciding needs no network |
| Reached from a blocked close or export | Opened from S28/S27 with the blocking conflicts filtered to those alone, and a return path to what you were trying to do |

## 7. Interaction

### Shared

- **Neither button is the primary.** No default styling, no autofocus, no
  return-key binding. A visually preferred answer is a decision made for you,
  and half the time it would be the wrong one.
- Selecting a card and confirming are one step on mobile, two on web where a
  pointer makes mis-taps rarer.
- No swipe-to-dismiss on the sheet. Dismissal is the back affordance only, so
  it cannot happen while scrolling.

### Mobile

Bottom sheet, at a height that shows both options without scrolling. If a value
is too long to fit, it truncates with the differing portion kept — a diff that
hides the difference is worse than no diff.

### Web

Centred modal, focus trapped, `Esc` closes without resolving.

## 8. Rules this screen must obey

- **Dismissal is never resolution.** Closing leaves the entry `blocked`
  (`architecture/08`). Entries behind it keep draining unless they depend on it.
- **Nothing auto-resolves after a timeout.** A tax-sensitive field decided by a
  timer is exactly what §11.2 forbids, and a stall is the cheaper failure.
- **An unresolved tax-sensitive conflict blocks the period close and the tax
  export**, and they name it. The interruption is tied to *consequence*, not to
  elapsed time: you are never stopped while capturing, and you are always
  stopped where the wrong answer would cost something. A timer would instead
  guess at how long is too long and eventually become furniture. The server has
  what it needs in `tax_period_locks`.
- **The server audits the *detection*, not the resolution.** When the drain's
  write is refused, the server writes one `audit_log` row —
  `action = 'conflict_detected'`, `before` the server's value, `after` the
  client's — because that event genuinely happened. §14.2's "recorded with both
  values" is satisfied there, at the moment it was true.

  *Keep mine* then re-sends the write and is audited as the ordinary update it
  is. **_Keep theirs_ sends nothing at all**: the detection row with no
  following update *is* the record of the discard. An earlier draft had it send
  a no-op write to manufacture an audit row — a fiction that advanced `version`
  and made an untouched row look edited, and left every future reader of that
  row unable to tell a marker from an edit.
- **Money renders through `<Amount>`/`<FxAmount>`** — a conflict between two
  amounts formatted by hand is a second implementation of `computations.md` §1.
- **The screen fetches; components do not.** The sheet takes its conflict as a
  parameter (`architecture/11`).
- **The agent may read a conflict and propose; only a person resolves it.**
  Conflicts are readable, so the agent can explain what diverged and say which
  value looks right — the read / propose / approve shape §11.2 already uses for
  every write. It cannot discard and cannot resolve, which is the line the
  exclusion below draws.
- **Resolution is not a new operation.** It re-sends the write the entry
  already holds, with the conflict outcome attached for the audit row.
  `operations.md`'s *What is never an operation* covers exactly this shape:
  registering a `resolve_conflict` would hand the agent a tool that discards
  queued writes — and a queued write is one the server has never seen, so there
  is no audit row, no `before`, and nothing to notice its loss by. The one
  class of write whose disappearance is invisible is the one it would hand
  over.

## 9. Open questions

- **Nothing surfaces the `conflict_detected` row.** The discarded value is now
  recoverable — it is `before`/`after` on that audit row, kept forever — but no
  screen renders it, so picking wrong at 11pm has a recovery path that exists
  and cannot be walked. S30 is the likely home.
- **What does the marker look like when the app is opened days later?** The
  badge is specified, and the close/export block gives it teeth where it counts.
  Whether a month-old *non*-tax conflict deserves more than a badge is not
  decided.

**Decided, and worth stating because it looks like an oversight:** `date` warns
as tax-sensitive **always**, not only when a period is closed or near closing.
Narrowing it would keep the warning sharper, and the accepted cost is the
reverse — a mistyped date corrected on two devices raises a tax warning that
does not apply. Chosen deliberately: warning too often costs annoyance, and the
narrow rule costs a filed figure moving with no visual distinction at the moment
of choosing.
