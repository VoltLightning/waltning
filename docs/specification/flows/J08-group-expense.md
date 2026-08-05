# J8 · Group expense

> Migrated from `FLOWS.md`. **Not yet expanded** — see the flow template.

**Frequency:** weekly. The clearing-account journey (`SPEC.md` §6.4) — 678
transactions in the historical data.

```
you pay for the group
        │
   S05 Quick add → account: Clearing · <currency>
        │
   ALLOCATE
   S13/S12 → allocate shares
        │  split the total across counterparties
        │  each share becomes a receivable against that person
        │
   the clearing balance should now trend to ZERO
        │
        ▸ non-zero → S01/S04 unsettled banner
                     "a group expense was paid but never allocated"
                     one action: allocate
        │
   CHASE  → S12 shows who has not settled — not merely that something has not
        │
   SETTLE → S14, per person (J7)
```

**This is the capability the account model could not provide.** Previously the
clearing balance told you *that* something was unallocated; now it tells you
*who*.

✅ **Designed** — `Gaps.dc.html` G2. Even / custom / shares, with the
unallocated remainder always visible: an allocation that does not sum is the
commonest way a clearing balance quietly stops meaning anything.
