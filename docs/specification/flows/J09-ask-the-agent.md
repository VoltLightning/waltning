# J9 · Ask the agent

**Frequency** a few times a week · **Surface** both
**Screens** S03, S04, S09, S27, S33
**Status** specified

---

## 1. Why this journey exists

Answers what currently requires Excel. *"What did I spend on the flat this
year?"* is today a sideloaded TSV and a pivot table; here it is a sentence.

The component most likely to be built badly, so three rules make it safe: typed
tools rather than SQL generation, an approval gate on every write, and a
complete audit trail (`SPEC.md` §11).

**The agent is not a separate surface with its own hand-written tool list.**
Its tools are generated from the same operation registry the UI calls over
tRPC (§11.0). Adding a feature makes it agent-accessible for free, and
validation and audit cannot diverge between the two paths.

## 2. Preconditions

Data worth asking about, and network — the agent is the one journey with **no
offline mode**, stated rather than degraded.

## 3. The path

```
S03 Agent (web, three columns)   or   S04 → Agent (mobile)
        │
   ┌────┴───────────────────────────────────┐
   │ QUESTION                               │ INSTRUCTION
   │ "what did I spend on the flat?"        │ "48.90 cash coffee yesterday"
   │        │                               │        │
   │  read tool runs AUTOMATICALLY          │  create_transaction PROPOSED
   │        │                               │        │
   │  ToolResultCard                        │  DiffCard — before | after
   │  "ran automatically · 240 ms"          │  nothing happens until approved
   │        │                               │        │
   │        │                               │   ▸ Approve → applied 14:32
   │        │                               │               audit #4821
   │        │                               │               actor = agent
   │        │                               │   ▸ Decline → declined result,
   │        │                               │               session continues
   └────────┴───────────────────────────────┘
        │
   audit column — every call, its kind, its state, its timing
```

## 4. Branches

| At | Condition | Goes to |
|---|---|---|
| Any write | Auto mode **off** (the default) | Gates. Every write, every time |
| Any write | Auto mode **on** for this operation class | Applies, logged identically and marked `auto`. The grant is stored with its expiry and remaining count (§11.2) |
| Any write | Operation is a delete, a config change, tax scope, or the pivot | **Never eligible for auto mode**, regardless of grant |
| Proposal | Nothing in the taxonomy fits | `create_category` — **proposed, never silent** (§11.5). The guardrail that keeps a dynamic taxonomy from becoming 400 junk categories |
| Approved write | Within the session | Revert available on the applied card (Q4) |
| Approved write | After the session | Correction goes through ordinary editing, with its own audit trail |
| Result | Is a workbook | S27 / `export_excel` |
| Result | Is a set of rows | Drill into S09, same as any other list |

## 5. Failure paths

| Failure | Treatment |
|---|---|
| **Waiting through a 3–15 s turn** | `ThinkingIndicator`, showing **which phase it is in**: thinking (elapsed timer appears after 2 s), tool running (names the tool — `search_transactions · 1.2 s`), streaming (text as it arrives). At 20 s, an explicit *still working* with a **cancel**. Every phase carries a `motion-none` branch. A blank canvas for fifteen seconds is indistinguishable from a hang, which is why this was the largest gap on the journey (`design-system/08` §8.5) |
| **Refusal** | `RefusalCard`. `stop_reason` is checked **before reading content** (§11.4). Visually distinct from `ErrorState` — nothing is broken — and from a declined `DiffCard`, which was *your* action. It states that the model declined, that the session continues, and offers a rephrase. Rendering a refusal as a crash would misreport what happened |
| Model call fails | Stated in the conversation, session continues, nothing partially applied |
| Tool call fails validation | Returns the validation error to the model, which retries or explains. Never a silent no-op |
| Write declined | Returns a "declined" result and the loop continues normally rather than breaking (§11.2) |
| Offline | Disabled with the reason stated. Not queued — an agent turn is not a write that can be replayed later |
| Auto-mode grant expires mid-batch | Remaining writes gate. The grant is bounded by construction: it must carry an expiry or a maximum count |

**Which model answered is visible, and changeable.** The session header names
the model; tapping it opens **S33**, where each of the four surfaces is
configured independently (§11.4). This matters because the agent's model and the
classifier's model are different choices for different reasons — a conversational
loop wants a strong model, a deterministic pipeline over hundreds of rows wants a
cheap one with a stable cached prefix — and a single global setting would be the
wrong shape.

Changing a model here is never retroactive. `import_rows.model_id` records what
answered at the time (C10), and re-running against today's ledger is
`reclassify`, a separate operation that is expected to differ.

## 6. Rules

- **One gate, three call sites.** Agent writes, voice writes (J2), and receipt
  extraction (J3) all render the same `<DiffCard>` (P3). One pattern used three
  times, not three patterns.
- **Never a modal, never "are you sure".** The diff *is* the confirmation,
  because a generic dialog teaches nothing and gets clicked through.
- **Reads run freely; writes never do.** Nothing is written on the model's own
  authority, ever — auto mode changes *who taps approve*, not whether the write
  is audited.
- **Auto mode is opt-in, scoped, bounded, and visibly on.** The model is Claude
  Code's own: gate by default, opt into speed deliberately, and make the state
  you are in obvious at a glance.
- **Reach is everything the UI can do; reach is not authority** (§11.0). *"Put
  family spending on my dashboard"* is an ordinary audited write to
  `dashboard_widgets`, not a special case — and it still gates.
- **The agent can enumerate itself.** The operation catalogue, category tree,
  account list, widget catalogue and current layout are all readable. An agent
  that cannot list its own capabilities cannot be asked open questions about
  them.
- **Typed tools, not SQL.** Text-to-SQL over a financial ledger trades unbounded
  blast radius for marginal flexibility, and a bounded surface is far easier to
  evaluate.

## 7. Success

| Measure | Target |
|---|---|
| Substitution | Questions that need Excel today are answered **in the app** |
| Latency | 3–15 s per turn, with the wait **legible** rather than blank |
| Safety | No write ever reaches the ledger without an explicit approval or a bounded, stated grant |
| Auditability | Every tool call is reconstructable — input, output, who approved it, when it applied |
| Trust | You can leave auto mode off indefinitely and the agent is still worth using |
