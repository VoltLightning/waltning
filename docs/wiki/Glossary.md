# Glossary

Country-specific terms mirror `SPEC.md` Appendix B, which is the authority. The
system vocabulary below is defined here because the rest of this wiki assumes
it.

## This system

| Term | Meaning |
|---|---|
| **Operation** | One named, validated, recorded change to your data. The only way anything changes — see [[The Operation Registry]] |
| **Registry** | The single list of every operation. The screens and the AI assistant both go through it |
| **Gate** | The decision about whether a change needs your approval. Changes need it by default |
| **Grant** | Permission you give the assistant to run named operations without asking. Always expires, never covers deletions or settings |
| **Queue** (outbox) | Where the phone keeps what you have done but the server has not seen yet. Drains when a network appears |
| **Local copy** (replica) | The phone's copy of the server's data, so your figures still work with no signal |
| **F / R / S** | Where a figure is allowed to be calculated — from the phone's own data, from its local copy, or only on the server. Declared per figure |
| **`opVersion`** | Which version of an operation a queued change meant, so a write that waited through an app update is never reinterpreted as something else |
| **Receipt** *(replay)* | The server's record that it already handled a given request, so sending it twice does the work once |
| **Rule 0** | *A 200 is not a success.* A response must prove it came from our server before its status code is trusted |
| **Clearing account** | A holding account for shared expenses. It should trend toward zero; a balance that grows means something never settled |
| **Reference rate** | What a currency was worth on a date, according to a central bank |
| **Realized rate** | What you actually got, worked out from the two sides of a transfer you made |
| **FX Cost** | The gap between those two — the spread your bank charged, shown as a figure instead of absorbed into the balance |
| **`tax_ledger`** | A view showing business rows only. Everything producing a tax document reads this and cannot reach the tables behind it |
| **Tax adapter** | Code that turns `tax_ledger` into one country's forms |
| **Tax scheme** | A specific form for a specific year, e.g. `PL_KPIR v2026`. Versioned, because forms change and a regenerated report must still match what was filed |
| **`.mmbak`** | A Money Manager backup file — internally a SQLite database |

## Poland

| Term | Meaning |
|---|---|
| **JDG** | *Jednoosobowa działalność gospodarcza* — sole proprietorship |
| **Ryczałt** | Lump-sum tax charged on revenue, with no deduction for costs. What this ledger files under |
| **Ewidencja przychodów** | The revenue-only register kept under ryczałt, instead of a full book |
| **KPiR / PKPiR** | *Podatkowa księga przychodów i rozchodów* — the full book of revenues and expenses, required under the other schemes |
| **Skala / liniowy** | Progressive (12%/32%) or flat (19%) income tax. Both require a KPiR |
| **JPK** | *Jednolity Plik Kontrolny* — the standard file format tax authorities accept for audit |
| **KSeF** | *Krajowy System e-Faktur* — the national e-invoicing system, mandatory for sole proprietors since 2026-04-01 |
| **NIP** | Tax identification number |
| **NBP** | *Narodowy Bank Polski* — the central bank whose rates Polish filing must use |

## United States

| Term | Meaning |
|---|---|
| **Schedule C** | The Form 1040 attachment reporting profit or loss from a sole proprietorship |
| **IRC §162** | The "ordinary and necessary" test an expense must pass to be deductible |
| **§179D** | A buildings-efficiency deduction that occupies Schedule C line 27a, pushing other expenses down to 27b |

## Germany

| Term | Meaning |
|---|---|
| **EÜR** | *Einnahmenüberschussrechnung* — cash-basis profit calculation, filed as Anlage EÜR |
| **ELSTER** | The tax authority's filing portal, and the only way to submit an EÜR |
| **SKR03 / SKR04** | Standard charts of accounts — SKR03 organised by transaction type, SKR04 by function |
| **Kleinunternehmer** | Small-business status under §19 UStG. Changes VAT treatment and which accounts apply |
