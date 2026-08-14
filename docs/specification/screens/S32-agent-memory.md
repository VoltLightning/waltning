# S32 · Settings · What the agent remembers

**Surface** both · **Journeys** J9, J2 · **Frequency** rare
**Design** none
**Status** specified · tier 3

> Added with `SPEC.md` §11.6. Memory is the one thing the agent writes without a
> `DiffCard`, so it is the one thing that has to be legible instead.

---

## 1. Purpose

Show everything the agent believes about how you work, and let any of it be
deleted.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| Settings | *What the agent remembers* | Settings |
| S03 | *…because you told me X* on a result | S32, scrolled to that entry |
| S13 | A counterparty-scoped memory | S32, filtered to them |

## 3. Layout

### Both surfaces

Grouped by scope, newest first within each. Every entry shows its prose, what it
is about, and when it last influenced anything.

```
  GLOBAL
   Splits restaurant bills by shares, not evenly
     last used 3 days ago · learned from a correction   [ Forget ]

   Georgia trips are usually business — ask, don't assume
     last used 2 months ago · told directly             [ Forget ]

  COUNTERPARTIES
   Nina — shares are always debt, never reference
     last used yesterday · learned from a correction    [ Forget ]

  ACCOUNTS
   Calls BANK-A/BIZ "the business account"
     last used 6 days ago · learned from usage          [ Forget ]

  ──────────────────────────────────────────────────
  14 entries · 1 840 of 4 000 tokens        [ Consolidate ]
```

**The token count is the point of the footer.** Memory is prepended to every
turn, so its size is a running cost you should be able to see rather than
discover in a bill.

The web layout adds a column for `source` and sorts by `last_used_at`, which is
how you find what to prune.

## 4. Components

| Component | Notes |
|---|---|
| `Card` | One per scope group |
| `Tag` | `told directly` · `learned from a correction` · `learned from usage` |
| `UndoToast` | Forgetting — reversible for the session |
| `ProgressBar` | Token usage against the bound |
| `EmptyState(first-run)` | Nothing learned yet — states that this fills as you correct things |

No new components.

## 5. Data

| Reads | Writes |
|---|---|
| `get_memory()` — all entries with scope, body, `last_used_at`, source | `forget_memory(id)` |
| Token count against the bound | `consolidate_memory()` |

**`write_memory` is not on this screen.** Entries arrive from the agent and the
capture loop; this screen only removes and consolidates. A settings page for
typing things you want the agent to believe would be a worse version of just
telling it.

## 6. States

| State | Treatment |
|---|---|
| Loading | Instant — the set is small by construction |
| Populated | Grouped by scope |
| Empty | `EmptyState(first-run)` — explains that memory accumulates from corrections, so an empty list is the normal starting state, not a broken one |
| Error | Per operation |
| Offline | Read-only from cache; forgetting queues |
| Gated | n/a |

**At the bound** the footer turns amber and `Consolidate` becomes the primary
action. New memories are still accepted — the agent consolidates to make room
rather than silently declining to learn (§11.6).

## 7. Interaction

### Both
`Forget` is immediate with an `UndoToast` — no confirmation, because a memory is
not a record and losing one costs a re-correction at worst.

`Consolidate` runs the agent over its own memory to distil and drop stale
entries. It **shows the diff before applying** — this is the one memory
operation that gates, because it rewrites many entries at once and is the only
way to lose several at a stroke.

## 8. Rules this screen must obey

- **§11.6** — memory holds behaviour, never facts. An entry containing an amount
  or a balance is a defect, and this screen is where it becomes visible.
- **§11.6** — anything expressible as a rule should be one. An entry that reads
  like a classification rule is a prompt to write it on S20 instead.
- **§11.2** — memory is the documented exception to the approval gate, and this
  screen is the reason the exception is acceptable.
- **P2** — every entry states where it came from.

## 9. Open questions

1. ~~**Should the agent explain a memory when it uses one?**~~ **Decided: yes,
   but only when the memory changed the outcome.** §11.6 makes memory the one
   documented exception to the approval gate — nothing else in the system is
   written on the model's own authority. An exception is only acceptable if it is
   accountable, and legibility on a settings screen nobody opens is the weakest
   possible form of that. So the trail names the memory at the moment it acts —
   *"business — you said Georgia trips usually are"* — and says nothing on the
   turns where no memory applied. That keeps the cost proportional to the
   exception rather than adding a line to every result, and it makes a wrong
   memory visible where you can act on it instead of in a settings list you would
   have to think to open.

2. ~~**Does a memory about a counterparty survive a merge?**~~ **Decided: it
   moves with the transactions, and unmerge restores it.** S15 already fixed the
   paradigm: a merge **archives rather than deletes**, records exactly which
   transactions moved, and is reversible indefinitely. Memory follows the same
   rule or the two disagree. Scoped memories re-point to the surviving
   counterparty and the move is recorded alongside the transaction move, so
   unmerge returns them to the restored record. Duplicates that result — two
   memories now saying the same thing about one person — surface on this screen
   as a merge candidate rather than being resolved silently, because collapsing
   two corrections into one is itself a correction.

3. ~~**Is there a shared memory across surfaces, or one per surface?**~~
   **Decided: one shared store, scoped by subject and never by surface.** The
   system already answers this everywhere else: one registry with two consumers
   (§11.0), and the loop/pipeline choice is *positional* — where you are — rather
   than a property of the feature (§11.4). Memory is behaviour, and behaviour
   should not depend on which door you came in through: a preference learned
   while capturing at a till is the same preference when you ask about the month
   later. `agent_memory.scope` is `global | counterparty | account | category`,
   with no surface dimension, and adding one would create exactly the drift the
   single registry exists to prevent.

**All three are now closed.** This screen was the last in the specification
carrying open questions.
