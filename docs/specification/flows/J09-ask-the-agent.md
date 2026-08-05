# J9 · Ask the agent

> Migrated from `FLOWS.md`. **Not yet expanded** — see the flow template.

**Frequency:** a few times a week.

```
S03 Agent (web)  or  S04 → Agent (mobile)
        │
   ┌────┴──────────────────────────────────┐
   │ QUESTION                              │ INSTRUCTION
   │ "what did I spend on the flat?"       │ "48.90 cash coffee yesterday"
   │        │                              │        │
   │  read tool runs automatically         │  create_transaction proposed
   │        │                              │        │
   │  ToolResultCard                       │  DiffCard — before | after
   │  "ran automatically · 240 ms"         │  nothing happens until approved
   │                                       │        │
   │                                       │   ▸ Approve → applied 14:32
   │                                       │              audit #4821
   │                                       │              actor = agent
   │                                       │   ▸ Decline → declined result,
   │                                       │               session continues
   └───────────────────────────────────────┘
        │
   audit column lists every call with its kind and state
```

**One gate, three call sites.** Agent writes, voice writes (J2), and receipt
extraction (J3) all render the same `DiffCard`. Never a modal, never "are you
sure" — the diff *is* the confirmation, because a generic dialog teaches
nothing and gets clicked through.

⊗ No streaming or thinking state, against 3–15 s turns. ⊗ Approved writes have
no revert.
