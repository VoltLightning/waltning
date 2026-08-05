# Money and FX components

The heart of the system. These enforce §7 of `SPEC.md` structurally.

### 4.1 `<Amount>`

```
  1 234,56 zł        display currency — serif, tabular
  $ 62.40            foreign, unconverted
```

Props: `value`, `currency`, `size`, `emphasis`, `signed`. Negative values take
`negative` ink. Never renders a conversion — that is `<FxAmount>`.

### 4.2 `<FxAmount>` — the P1 component

```
  62,40 $ · 4,0231 · 251,05 zł
  └ local    └ rate   └ main
```

The rate is for **the row's own date**. Three variants:

| Variant | Trailing marker |
|---|---|
| `synced` | none |
| `override` | amber `manual` tag — travels with the row into lists, balances, and the dashboard |
| `stale` | muted `stale` tag with the age |

`<FxAmount>` **cannot be rendered without a rate.** That is what makes P1 a
guarantee rather than a convention.

### 4.3 `<TransferAmount>`

One row, two accounts, two amounts, one derived rate (`SPEC.md` §7.5).

```
  Household · USD  →  Cash · PLN
  150,00 $            565,20 zł        realized 3,7680
                                       reference 3,8100 · spread 6,30 zł
```

The spread is shown **as it is typed** during entry, not discovered in a report
later. This is the component that makes FX cost visible.

### 4.4 `<FxStatusChip>`

Header-resident: `FX 09:12 · NBP · 2 manual`. States: fresh · syncing ·
**stale** (amber) · failed (negative). Staleness is visible, never silent.

### 4.5 `<CurrencyChip>`

The **display-currency toggle**, resident in every header. Pinned currencies
(`PLN · USD · EUR`) with the active one marked; tapping re-expresses every
figure on screen at that row's own historical rate.

Switching is free — no backfill, no confirmation, nothing written (`SPEC.md`
§7.0). It is a client preference, so it does not survive to any export: tax
outputs are always denominated in their jurisdiction's currency regardless of
what this is set to.
