# J17 · The agent learns something, and you correct it

**Frequency** monthly
**Surface** mobile | web · **Screens** S03, S32, S05, S09
**Status** specified

---

## 1. Why this journey exists

**Agent memory is the one write in the system that bypasses the approval gate**
(§11.6). Everything else — every category change, every settlement, every bulk
recategorisation — renders a `DiffCard` and waits for a tap. Memory does not,
because gating every learned preference would make the feature unusable.

§11.6 justifies that exception with one sentence: it is *"accountable by being
legible on S32."* **That accountability had no journey.** S32 existed as a
screen reachable from nothing, which means the argument for the exception rested
on a surface nobody had a path to.

This journey is the argument made real. If it does not work, the exception is
not justified and memory should gate like everything else.

## 2. Preconditions

- The agent has been used enough to have learned something (J09).
- Nothing else. This is a correction journey; it starts when something is wrong.

## 3. The path

```
        the agent acts on a memory
                 │
    S03 / S05 ── trail names it ──→ "business — you said Georgia trips usually are"
                 │
                 ├── right, but not this time ──→ correct the row (S09) · memory stands
                 │
                 └── wrong as a rule ──→ S32 Memory ──→ edit · delete · pin
                                              │
                                     S03 next turn no longer applies it
```

**The entry point is the moment it acts, not a settings screen.** S32 is where
you *manage* memory; the trail is where you *discover* it. A memory legible only
in a settings list is legible in the place nobody opens.

## 4. Branches

| At | Condition | Goes to |
|---|---|---|
| Trail | The memory was right | Nothing to do. It is not mentioned again unless it acts again |
| Trail | Right as a rule, wrong here | Correct the transaction (S09). **The memory is untouched** |
| Trail | Wrong as a rule | S32, scoped to that memory |
| S32 | The memory is nearly right | Edit the text. It is prose, not a structured rule |
| S32 | The memory should never have been learned | Delete. Takes effect on the next turn |
| S32 | The memory is rarely used but must survive | **Pin** — never an eviction candidate (§11.6) |
| S32 | Two memories say the same thing | Merge candidate, surfaced after a counterparty merge (S15) |
| S32 | The memory is really a rule | *Promote to rule* → S20. Prefer a rule to a memory (§11.6) |

## 5. Failure paths

| Goes wrong | Where you land |
|---|---|
| A memory contains a figure | **Refused at write** by `agent_memory_no_figures` (`0008`). Behaviour, never facts |
| The `CHECK` refuses a legitimate behavioural memory | The predicate is wrong, not the memory — C20. Report it; ratios, clock times and small counts are permitted by design |
| A memory was learned offline | It cannot be. Memory writes need the agent, which needs a model (§14.3) |
| The absorbed counterparty of a merge had memories | They move with the transactions and unmerge restores them (S32 §9) |
| You delete a memory the agent then re-learns | It will, if the behaviour repeats. That is the feature working; **pin the opposite** if it must not |
| Memory has grown too large | Consolidation is an operation with a diff — `consolidate_memory` is the only way to lose several at once, so it shows what it drops |

## 6. Rules

**The trail names a memory only when the memory changed the outcome.** Not every
turn. §11.6's exception is only acceptable if it is accountable *where you can
act on it*, and a line on every result is noise that gets ignored — which would
leave the exception unjustified again, by a different route.

**Correcting a row is not correcting a memory.** They are different intents, and
conflating them is how a good rule gets deleted because it was wrong once. The
trail offers both, separately, and the default is the narrower one.

**Memory holds behaviour, never facts** — enforced by a `CHECK`, not by prose,
because it is content prepended to every turn and, under O17, the most-exposed
data in the system. A stored figure would drift from the ledger, which is the
defect §6.6 removed by deriving balances rather than storing them.

**Prefer a rule to a memory** (§11.6). A rule is deterministic, inspectable, and
runs in the import pipeline where memory does not reach. *Promote to rule* is on
this screen because the agent cannot make that judgement for you.

**Memory is one store, scoped by subject, never by surface** (S32 §9). A
preference learned while capturing applies when asking. Behaviour should not
depend on which door you came in through — the same reason there is one registry
with two consumers (§11.0).

## 7. Success

- Every memory the agent applies is nameable at the moment it applies it.
- A wrong memory is correctable in **two interactions** from the trail that
  exposed it.
- The memory list is small enough to read in one screen — and if it is not,
  consolidation is offered rather than the list growing silently (§11.6).
- Nothing in the list contains an amount, and the constraint that guarantees
  that has been driven to refusal in test (`07-test-strategy.md`).
