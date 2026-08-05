# J5 · Find and fix

> Migrated from `FLOWS.md`. **Not yet expanded** — see the flow template.

**Frequency:** several times a week.

Two entry points, because there are two ways people look for a transaction.

```
"I remember something"          "what happened around then"
        │                                │
   S10 Transactions list           S11 Calendar
   search · filter · scroll        day / week / month / year
        │                                │
        └──────────────┬─────────────────┘
                       │
              S09 Transaction detail
                 amount · account · category · date · scope · note
                 receipt (if any) · line splits · FX basis
                 audit history — who changed what, when
                       │
                  ▸ Edit → inline, save
                  ▸ Split → line editor
                  ▸ Delete → soft, recoverable
                  ▸ Attach receipt → J3
```

**Design rules**

- The calendar **complements** the list, never replaces it. The list answers
  *"find the thing I remember"*; the calendar answers *"what happened then"*.
- Audit history is on the detail screen, not hidden in settings. When you are
  your own accountant, "why is this categorized this way?" needs an answer
  eighteen months later.
