# J10 · Currency and rates

> Migrated from `FLOWS.md`. **Not yet expanded** — see the flow template.

**Frequency:** rates daily (automatic); configuration rarely.

```
AUTOMATIC — app foreground
   sync reference rates ▸ current → no call
                        ▸ stale, online → fetch, stamp
                        ▸ stale, offline → last known, MARKED STALE
                        ▸ provider failed → surface it, never carry silently
   → FxStatusChip in every header:  FX 09:12 · NBP · 2 manual

MANUAL
   S18 Settings · Exchange rates
        │  rate table by pair and date
        │  ▸ override one day/pair → amber "manual", outranks sync forever
        │  ▸ sync history + failures
        │
   S17 Settings · Currencies
        │  ▸ add sub-currency → code · decimals · symbol · rate source
        │  ▸ archive → hidden from pickers, history keeps working
        │  ▸ pin/unpin currencies shown in the header toggle
```

**Changing the display currency is free** — a header toggle, no backfill, no
confirmation, nothing written. Changing the **pivot** is the heavy operation,
and it is not something a move abroad requires; it gets a `ConfirmDialog` and an
audit entry, and should essentially never happen after setup.
