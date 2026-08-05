# J14 · Accounts

> Migrated from `FLOWS.md`. **Not yet expanded** — see the flow template.

**Frequency:** rarely.

```
S16 Accounts
        │  register grouped by kind · balances · archived toggle
        ▸ add    → name · kind · currency · group · opening balance + date
        ▸ edit   → all of the above
        ▸ archive → never deleted; history references it
        │
   kinds: cash · bank · card · loan_receivable · loan_payable
          · clearing · investment · deposit · other
```

Opening balance matters more than it looks: it is what makes migrated balances
reconcile (`SPEC.md` §8.4), and it is derived during migration rather than
entered.
