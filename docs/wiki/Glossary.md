# Glossary

Jurisdiction terms mirror `SPEC.md` Appendix B, which is the source. The system
vocabulary below is defined here because it is what the rest of this wiki
assumes.

## This system

| Term | Meaning |
|---|---|
| **Operation** | A named, Zod-validated, audited write. The only way anything changes (§11.0) — see [[The Operation Registry]] |
| **Registry** | The single collection of operations. Screens and the agent are two consumers of it |
| **Gate** | The approval decision for a write. Writes gate by default; a bounded grant can lift it, except for tax-sensitive fields |
| **Grant** | A scoped, expiring, opt-in permission for the agent to auto-run named operations. Never permanent, never covers deletes or configuration |
| **Outbox** | The phone's local queue of pending writes, drained on reconnect (§14.3) |
| **Replica** | The server checkpoint the phone holds, so figures reconstruct with no network |
| **F / R / S** | Where a figure may be computed — phone-only, needs the replica, or server-only. Declared per figure in `computations.md` |
| **`opVersion`** | The version an operation was queued against, so a write that waited through an app update is never reinterpreted |
| **Receipt** | A server-side idempotency record — entry id plus request hash — that makes a replayed outbox entry return its original response |
| **Rule 0** | *A 200 is not a success.* The response must authenticate itself before its status is trusted (`architecture/09`) |
| **Clearing account** | Wash account for shared expenses; should trend to zero (§6.4) |
| **Reference rate** | What a currency was worth on a date, from a published source (§7.3) |
| **Realized rate** | What you actually got, implied by the two legs of a transfer you made (§7.5) |
| **FX Cost** | The visible gap between the two — the spread, surfaced instead of absorbed |
| **`tax_ledger`** | The business-only view every tax adapter reads; personal rows are unreachable from it (§13.1) |
| **Tax adapter** | A per-jurisdiction projection of `tax_ledger` into that jurisdiction's shape (§13.2) |
| **Tax scheme** | A versioned form or book — e.g. `PL_KPIR v2026`, `US_SCHED_C v2026` (§13.4) |
| **`.mmbak`** | Money Manager backup — a Core Data SQLite database |

## Poland

| Term | Meaning |
|---|---|
| **JDG** | *Jednoosobowa działalność gospodarcza* — sole proprietorship |
| **KPiR / PKPiR** | *Podatkowa księga przychodów i rozchodów* — tax book of revenues and expenses |
| **Ewidencja przychodów** | Revenue-only register kept under ryczałt instead of a KPiR |
| **JPK** | *Jednolity Plik Kontrolny* — Polish SAF-T; JPK_V7 for VAT, JPK_PKPiR for the KPiR |
| **KSeF** | *Krajowy System e-Faktur* — national e-invoicing, mandatory for JDG since 2026-04-01 |
| **Ryczałt** | Lump-sum taxation on revenue, with no cost deduction |
| **Skala / liniowy** | Progressive (12%/32%) or flat (19%) income tax — both require a KPiR |
| **NIP** | Tax identification number |
| **NBP** | *Narodowy Bank Polski* — source of the FX rates Polish filing uses |

## United States

| Term | Meaning |
|---|---|
| **Schedule C** | Form 1040 attachment: Profit or Loss from Business |
| **IRC §162** | The ordinary-and-necessary test an expense must pass to be deductible |
| **§179D** | Energy-efficient buildings deduction — occupies Schedule C line 27a, pushing "other expenses" to 27b |

## Germany

| Term | Meaning |
|---|---|
| **EÜR** | *Einnahmenüberschussrechnung* — cash-basis profit determination; filed as Anlage EÜR |
| **ELSTER** | The tax authority's electronic filing portal — the only submission channel for Anlage EÜR |
| **SKR03 / SKR04** | Standard charts of accounts — SKR03 by transaction type, SKR04 by function |
| **Kleinunternehmer** | §19 UStG small-business status; changes VAT treatment and which accounts apply |
