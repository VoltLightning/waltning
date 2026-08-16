# Completeness audit

Nine domains, audited by **cross-referencing the specification against itself**
rather than reading it for gaps. The checks below are mechanical and repeatable —
each one is a query over the documents, and each found something.

The method that worked: build the maps in both directions and look for entries
with no counterpart. *Consumers with no producer* was the recurring shape — a
figure three screens read and nothing writes.

---

## The checks, and what to re-run

| Check | Query | Result |
|---|---|---|
| Screen numbering | Sequence gaps in `screens/S*.md` | ✅ S23, S26 absent **by design** — merged into S11 and S12, documented in both |
| Flow → screen | Every `S\d\d` in a flow resolves | ✅ no dangling references |
| **Screen → flow** | Every screen reachable from ≥1 journey | ⚠️ **found 3 orphans** — S31, S32, S33 |
| Screen → registry | Every operation a screen names exists | ⚠️ **found 6 missing** |
| Registry → screen | Every operation has a caller | ✅ |
| Template conformance | All nine sections present | ✅ 31/31 screens, 17/17 flows |
| Open questions | Any not marked Decided/Resolved | ✅ 0 |
| **Table column → producer** | Every column has something that sets it | ⚠️ **found 3 with no producer** |
| Figure → definition | Every widget/headline figure defined | ⚠️ **found 1 undefined, 1 defined twice** |
| Markers | `TODO`, `TBD`, `⊗` outside templates | ✅ none |

---

## 1 · Main user flows

**17 journeys, every screen reachable from at least one.** Two were missing
entirely, and both were structural rather than incidental:

**J16 · Move money between your own accounts.** Transfers are **1,680 of 7,621
rows — 22% of the ledger**, second only to expenses, and S31 was reachable from
nothing. It is also the only entry to the feature §7.5 argues is unique to this
design: storing both amounts so the realized rate is a fact and the gap against
the reference rate becomes `FX Cost`.

**J17 · The agent learns something, and you correct it.** §11.6 makes memory the
one write that bypasses the approval gate and justifies it in a sentence — *it is
accountable by being legible on S32*. S32 was reachable from nothing, so the
justification rested on a surface with no path to it.

## 2 · Transaction recording

**Every column on `transactions` has a producer.** Audited by extracting the
column list from `schema.ts` and searching for a specification of how each is
set.

One had none: **`is_capital`.** §6.8 defines it, S10 splits its running total
when one is in range, and S25 excludes them from every comparison — three
consumers, no producer. Now a toggle on S09, deliberately *not* on the capture
sheet, because you rarely know at the till that a purchase will distort a trend.

Creation paths, all specified: keypad (S05) · voice (S08) · receipt (S07) ·
import (S02) · agent (S03) · transfer (S31) · settlement (S14) · recurring
(S21/S11) · migration (S29) · reassignment (§6.6a) · **reconciliation (S16, new)**.

**`adjustment` was in the type enum, in `signed()`, and in H5's sign fix — and
nothing could create one.** C19 is why that matters: the ledger is faithful to
Money Manager and *partial* against the bank. `reconcile_account` writes one
dated adjustment for the difference rather than overwriting a balance, which is
derived and has no field to set.

## 3 · Agent scope

Bounded in four places, and they agree: §11.0 (one registry, two consumers) ·
§11.2 (gate by default, per-**field** for tax-sensitive) · §11.4 (loops where you
are present, pipelines where you are not) · §11.6 (behaviour never facts,
enforced by a `CHECK`).

Gaps closed: **J17** gives the accountability argument a journey; **S33** gives
the four model surfaces a configuration screen — §11.4 defined the `models` table
and only *spend* had ever been rendered; **`reclassify`** was referenced in four
documents and defined in none.

## 4 · Offline scope

Rebuilt after the eight-agent review (`architecture/08`, `09`, §14.3, §5.7).
Three of the previous claims were false — see `defects.md` C21–C28.

The scoping rule is now explicit rather than implied: **F / R / S** on every
figure in `computations.md` §0, and `offlineEligible` on every registry
operation, with a contract test asserting no ineligible operation can enter an
outbox.

## 5 · Migration

**`migration-runbook.md`** — eleven steps, each with its gate, plus a rollback
table naming the point where rollback stops being practical. §8.5 was four lines
for the one operation in the system that cannot comfortably be undone.

Two steps still need you: the 52 balances (blocking) and the 173 reassignment
names (not blocking — unresolved rows import as zero-effect rows, exactly their
behaviour today).

## 6 · Account system

Every column on `accounts` has a producer — after two fixes.

**`account_groups` had no management path at all.** S16 rendered a `group`
column and grouped by it, and nothing created a group, renamed one, or set
`institution` — which `FX Cost` **totals by**. A headline figure whose grouping
field nothing could set. Now managed inline on S16, with the distinction stated:
several groups may share one institution, and that is exactly the case the figure
exists to illuminate.

**`opening_date`** was never mentioned outside the schema, though
`computations.md` §2 sums from it. Now specified alongside `opening_balance`,
with the rule that editing one moves every balance from that date forward — it is
not a correction tool, and reconciliation is.

## 7 · Currency system

Complete. `code · name · symbol · symbol_position · decimals · is_pivot · pinned
· rate_source · archived · sort` all have a home (S17), rates and provenance have
theirs (S18), and the display-currency toggle is `CurrencyChip` in the shell
header (S01, S04).

`change_pivot` exists, is audited, is confirmed, and §7.0 says it should
essentially never happen — which is the right treatment for an operation that
would rewrite the meaning of every stored rate.

The one thing worth restating: **there is no reporting currency**, so there is
deliberately no constraint for one, and `DualTotal` is scope-invariant.

## 8 · Settings

Every settings entity has a surface:

| Entity | Screen |
|---|---|
| Accounts, groups, reconciliation | S16 |
| Counterparties | S15 |
| Currencies · rates | S17 · S18 |
| Categories | S19 |
| Rules | S20 |
| Recurring | S21 |
| Tax — scheme, residency, ryczałt rates | S22 |
| Dashboard layout · **targets** | S24 |
| **Models and providers** | **S33 — new** |
| Agent memory | S32 |
| System, backups, invariants, **outbox** | S30 |
| Display currency · scope | Shell header, not a settings screen |

**Targets were the stale one.** The register recorded them as fixed after the
operations and the progress rule landed, while §14.7's *"one widget, one settings
row"* had neither. Both now exist, and the register entry says it took two passes.

## 9 · Analytical data

The §14.5 widget catalogue is enumerated — now **14 widgets** — and every one
resolves to a definition in `computations.md`.

Two fixes: **`income_vs_expense`** was a configurable chart widget with no
definition (it excludes transfers entirely, and capital, because a transfer is
not income to one side and expense to the other). And **the FX margin was defined
twice** — §4a in pivot, §12 in destination currency. They are algebraically
equivalent and now say so, with the rule that they are never mixed in one total.
That last one is the M-class complaint — *"the margin formula is never written
down and three candidates disagree"* — resurfacing in a milder form, which is why
the check is worth re-running rather than trusting once.

---

## Re-running this

**Four of them now run themselves** — `tests/docs-consistency.test.ts`, in the
suite the pre-commit hook gates on: dangling screen references, orphan screens,
the nine template sections, and unresolved markers. `packages/db` adds journal
parity, because a `.sql` file missing from the journal is not an error but a
silent skip.

That change was earned. Running the reachability check by hand produced three
false orphans in under a minute: flows reference sub-steps — `S02a`, `S29b` —
and `\bS02\b` does not match `S02a`. A check that lives as prose gets run by
someone improvising a regex under time pressure, and the improvised regex is
wrong in exactly the way that makes a real problem look absent.

The remainder are still by hand, and still worth running after a structural
change:

```
screens vs flows      · every screen reachable from ≥1 journey
screens vs registry   · every named operation exists
schema vs docs        · every column has a producer
catalogue vs figures  · every widget resolves to a definition
templates             · all nine sections, all files
open questions        · none unresolved
```

**The shape to look for is a consumer with no producer.** Four of this pass's
findings were exactly that — `is_capital`, `account_groups.institution`,
`targets`, `income_vs_expense` — and none would have been found by reading, only
by asking each figure where its inputs come from.

---

## Readiness audit — can we start building?

A second pass, asking a different question: not *is the specification complete*
but **is there anything an implementer would have to invent on day one?**
Three things, and the first was the largest.

### The stack was a backbone, not a stack

§4.3 had nine rows — HTTP, contract, ORM, validation, money, mobile, blobs,
proxy, packages — and stopped. **Fifteen layers had no choice recorded:** test
runner, device SQLite, client cache, list virtualization, routing, charts,
password hash, TOTP, logging, Excel writer, image manipulation, dates and zones,
model clients, migration runner, scheduling.

Every one of those gets decided by whoever writes the first file that needs it,
which is how a stack becomes an accident rather than a decision. All fifteen are
now chosen with a reason, plus **two named as provisional**: push notifications
(because `expo-notifications` puts a third party in the path of a system whose
argument is physical custody) and speech recognition (pending the `en-*` spike).

### Six components the screens invented

Working rule 1 is *a screen never invents a component*, and six had been invented
anyway — `PeriodHeader`, `ScaleSwitcher`, `NavModeToggle`, `RefineRequest`,
`AutoModeComposer`, `Table`. Five appear on more than one screen, which is
exactly the case the rule exists for: `RefineRequest` carries §10.2's *refinable*
claim, and building it twice would produce two subtly different refinement
semantics on the two screens where being wrong costs most.

**97 named components, 97 defined.**

### The configuration surface was four secrets

§5.3 listed model keys, the Postgres password, the session key and the backup
key. Standing the system up needs about twenty variables — and **three separate
database URLs**, which is not a detail: the separation between the migration
superuser, the app role and the export role *is* T1 (§13.1). One URL for all
three would make the tax guarantee unenforceable while everything appeared to
work.

### What is genuinely not ready, and is not meant to be

| | |
|---|---|
| 52 typed balances | Blocking. About an hour, and the gate cannot fail without them |
| The 173 reassignment names | Not blocking — unresolved rows import as zero-effect rows |
| On-device ASR support | A spike, minutes, and it decides whether S08 works offline |
| Push transport | A decision, needed before S30's push conditions ship |
| The `apps/web` fork | A decision with a stated trigger, deliberately deferred until S02 and S25 exist to test it against |

Everything else has a choice recorded and a reason attached.
