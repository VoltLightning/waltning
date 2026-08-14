# J3 · Receipt to split

**Frequency** a few times a week · **Surface** mobile
**Screens** S05, S07a, S07b, S07c, S06, S09
**Status** specified

---

## 1. Why this journey exists

A supermarket run is not one expense. It is groceries, plus household supplies,
plus whatever else — and Money Manager could not express that at all, so five
years of history has one amount against one category and no idea what was in the
bag.

It also produces the **evidence trail**. Every business expense claim rests on an
image, and §5.5 retains both the photograph and the raw model response
permanently — the image because it is the evidence, the raw response because a
prompt improvement should never require re-photographing anything.

## 2. Preconditions

An account exists. Nothing else: capture must work in a shop with no signal
(`SPEC.md` §10.4), which is the ordinary case in a basement supermarket.

## 3. The path

```
S05 Quick add [▣]   or   S04 → Scan
        │
   S07a Capture          brackets · shutter · flash · running count
        │                works offline; captures queue locally
        │
   S07b Queue            ⏳ waiting  — queued 14:06, uploads on reconnect
        │                ✓ ready    — extracted 2.4 s
        │
   S07c Extraction review
        │  merchant · date · total · DETECTED currency
        │  rate for the RECEIPT's date · VAT · per-field confidence
        │  lines, each with its own leaf category
        │
        ▸ Keep as one   → one transaction, total against one category
        ▸ Split         → the resulting transactions, shown before commit
        │
   Commit → S04 Today
```

## 4. Branches

| At | Condition | Goes to |
|---|---|---|
| S07a | Offline | Queues locally; the draft in S05 stays editable and saveable without waiting |
| S07b | Reconnect | Drains in order. A failed upload holds its place rather than being skipped |
| S07c | Currency ≠ account currency | Rate panel opens, showing the receipt-date rate and the account it will post to |
| S07c | Line category is a group | Rejected — only leaves are assignable (`TAXONOMY.md` R1) |
| S07c | Split | Preview of the resulting transactions, each with its own category and amount |
| S07c | Lines do not sum to the total | §5 — the remainder is stated, never absorbed |
| S07c | Business | `BIZ` tag; if the account is `shared`, the flag is refused (`SPEC.md` §6.7) |
| After commit | Wants to change a line | S09 Transaction detail — the receipt and its splits are editable forever |

## 5. Failure paths

| Failure | Treatment |
|---|---|
| **Unreadable photo** | `ErrorState(terminal)`. **The image is retained, always.** Extraction is rarely all-or-nothing, so whatever was legible is shown — merchant read, total not — and the illegible fields are named rather than blanked. Three actions: **Retake** (the original stays queued until the replacement succeeds), **Enter by hand** (opens a draft in S05 with the image already attached), **Keep image only** (parks it to attach later from S09). A bad photograph of a real receipt is still evidence, so no path discards it |
| Upload failed | Stays in the queue with its reason and a retry. Never silently dropped; the image is the evidence and losing it loses the claim |
| Extraction returned nothing usable | Falls back to a manual draft with the image attached, rather than an empty error state |
| **Low confidence per field** | Marked on the field (J2, G3). Merchant at 0.55 and total at 0.99 look different |
| Currency not detected | Defaults to the **account's** currency, marked machine-filled with the trail stating the assumption. Never silently assumes the display currency |
| **No FX rate for the receipt's date** | Nearest rate, `fx_rate_estimated` set, rendered amber (`SPEC.md` §7.6) |
| Lines do not sum to the total | The remainder is shown as an explicit unallocated line. Commit is allowed — receipts genuinely have rounding and deposits — but the gap is never hidden inside another line |
| Duplicate receipt | Matched on merchant, date and total; shows the existing transaction |

## 6. Rules

- **Currency is detected, not assumed**, and the rate is for the **receipt's**
  date, not today (`SPEC.md` §10.2). The app is used across several countries;
  a café receipt and a supermarket receipt in the same week are routinely in
  different currencies.
- **The split is approved as its outcome.** The preview shows the resulting
  transactions, not the intent that will produce them — you approve what will
  exist, which is the same principle as `<DiffCard>` (P3).
- **The image and the raw model response are retained permanently.**
  Re-extraction after a prompt improvement never requires re-photographing.
- **A line carries a leaf category, not a guess at one.** Unmatched lines land
  in `Uncategorized`, which is a queue and should visibly shrink — not a
  destination (`TAXONOMY.md` §5).
- **Confidence is per field.** This is the one screen where a model fills six
  fields at once, and a single aggregate score tells you nothing about which to
  check.
- **A receipt is one payment event, so it is one transaction** (`SPEC.md` §6.10).
  *Keep as one* and *Split* both produce a single row, differing only in whether
  it carries a breakdown. Lines belong to the **transaction**, not the receipt,
  so the identical breakdown is available on a hand-entered card payment with no
  photograph.
- **The parent transaction holds the total; the lines carry the allocation.**
  Balances read the parent, so a mis-summed split can never move a balance.

## 7. Success

| Measure | Target |
|---|---|
| Capture | Shutter to queued in **under 3 seconds**, offline included |
| Extraction | 2–5 s once online (model-bound, `SPEC.md` §15) |
| Split | A supermarket receipt across two categories, **faster than typing two transactions** |
| Evidence | Every business row reachable from its image, indefinitely |
| Honesty | No committed receipt has an unexplained gap between its lines and its total |
