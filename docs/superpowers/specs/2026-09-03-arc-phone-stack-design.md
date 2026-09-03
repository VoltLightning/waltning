# Arc 1 — the phone arc, as a stack of PRs

**Date** 2026-09-03 · **Status** design, awaiting approval · **Decided by** the
owner, in a brainstorming session; the choices below are recorded verbatim so an
agent working one PR knows what was decided for the whole.

## 1. What this is

`#arc-phone` is the board's first arc: a phone (and, since #78, a browser) that
holds a complete ledger with no backend in existence, captures a spend in under
ten seconds offline, and moves money between accounts and people. Roughly
forty-five cards are open across `#e0`–`#e3`. This design turns them into a
stack of PRs that Sonnet subagents can build in parallel where the cards are
independent, with the owner merging as each goes green.

**Not in scope, and why.** Five cards are blocked on the EAS cutover the owner
controls and are excluded: *Leave Expo Go*, *the mark*, *the splash*, *Polish
plurals on a device*, *system bars on a real build*. `[[expo-go-now-eas-later]]`
records that the owner triggers that cutover, never an agent.

## 2. Decisions made in the session

| Question | Decision |
|---|---|
| Scope | **Everything open on `#arc-phone`**, including E3 (money that moves). |
| Web layout | **Phone-first; the desk layout is one PR at the end of the stack.** Screens ship phone-only now and are retrofitted once, in one place, when the desk compositions land. `S04`'s own spec already says the desk answers *what happened* with S01, not with a wide S04. |
| Stack shape | **Parallel where independent, stacked where not.** Independent sub-projects branch from `main` and run as concurrent agents; dependent ones stack. The owner merges as PRs go green; whoever is rebasing rebases what is above. This is an explicit, arc-scoped exception to `[[one-pr-not-a-stack]]`. |
| Who composes screens | **Agents implement, the orchestrator composes.** Each screen PR's plan names the components, the states and the reads before an agent starts. The last eight design rounds established that the owner's taste is specific (`[[waltning-design-taste]]`); six agents making six taste calls is the failure to avoid. |

## 3. The sub-projects and their order

```
                 main
        ┌─────────┼──────────────┬──────────────┐
        A         B              F              (E waits on A)
   figures+ops   forms         polish
        │
        C  shell + screens  (needs A's readers)
        │
        D  capture           (needs C's shell and S04)
        │
        E  money moves       (needs A; lands after D so debt has a screen)
        │
       DESK  one PR, retrofits C+D+E's screens for ≥1024px
```

### A · Figures and operations — the phone half

**Cards:** *§1–2 signing + account balance* · *§3 net worth* · *class-F figures in
`money.ts` + differential test* · *property tests: money, signing, debt* ·
*Reads — 8 ops (phone half)* · *Writes — transactions, 7 ops (phone half)* ·
*Writes — accounts/groups/reconciliation, 9 ops (phone half)* · *Writes —
categories, 6 ops* · *replica holds the whole ledger* · *outbox `seq`/`deps`/
`sending`→`pending`*.

**Shape.** Four PRs, each an agent, all off `main`:

- **A1 · figures.** `packages/core/src/money.ts` gains every class-F figure
  `computations.md` §1–3, §7, §8 names; `packages/ledger` gains the readers
  over the replica that use them. The **differential test** is the deliverable:
  one fixture, every figure computed in SQL (server, real Postgres) and in
  `money.ts`, asserted equal to eight decimal places; changing the rounding
  mode on one side alone turns it red. Property tests ride alongside
  (`fast-check`, already present or added here).
- **A2 · transaction ops.** Executors for `update_transaction`
  `delete_transaction` `set_transaction_lines` `supersede_transaction`
  `categorize_batch` (`attach_receipt` is server-only — a receipt lives in
  MinIO). Patch semantics, `updated_at`, per-field tax gating as
  `operations.md` states them. Each executor: Zod input from `core`, a
  `writeLocally` call, a crash test between the two writes.
- **A3 · account, group and category ops.** `update_account` `archive_account`
  `reorder_accounts` the four group ops **`reconcile_account`** (writes one
  `adjustment` transaction, S16 §5), and the six category ops. Structural
  category edits are refused offline per S19; creating a leaf queues.
- **A4 · replica + outbox durability.** No eviction, no TTL, logout drops only
  the session; outbox `seq` ordering, auto-derived `deps`, `sending`→`pending`
  recovery on launch (much of which `recover.ts` already does — the card
  verifies and closes the gaps). Closes PR #33 as superseded.

**Why agents can own these.** Every card is specified to the decimal by
`computations.md`/`operations.md`, is pure or SQLite-only, and is tested
against `better-sqlite3` under Node. No taste is involved.

### B · Forms

**Cards:** *Expand Create account beyond the preview* · *Expand keypad Quick add
beyond the preview* · *Translate `fieldErrors` onto a form*. All three are
already tagged `#ready-for-agent`.

**Shape.** Three PRs off `main`, one agent each. `fieldErrors` lands in
`packages/client` (a `useFieldErrors(response)` that maps dotted, indexed paths
to fields and renders the unmatched at form level). The two form expansions use
the D1 controls that shipped in #76 — `Select` for kind/group, `RadioGroup` for
ownership/scope, `Toggle` for business, `TextField` for memo, `AmountField`
for the opening balance — and keep the minimal name-and-currency path the
default.

### C · Shell and screens

**Cards:** *`expo-router` tab shell* · *D2's `TabBar` `BottomSheet` `Shell`* ·
*D4 states* · *D5 data surfaces* · *S04 Today* · *S16 Accounts* · *S10
Transactions list* · *S09 Transaction detail* · *S19 Settings · Categories*.

**Shape.** Serial start, then parallel:

- **C1 · shell + states** (one agent, blocks the rest). `TabBar` (five tabs; the `+` is not in it — it floats,
  and landed ahead of the stack), `BottomSheet`, `Shell(hero)`, and D4's eleven
  state components. Route tree grows the tabs S04 §3 draws.
  Calendar and Debt are stubs that render `EmptyState` until their arcs.
- **C2–C6 · one screen each**, parallel agents, each composed in its plan from
  the spec page's §3 layout, §4 component table, §5 reads and §6 states —
  phone column only. Every screen: one file, ledger through
  `useLedgerController()`, a render test per state under react-native-web, a
  story per state, i18n keys added in both languages.

**The desk column of each spec page is deliberately not built here** — see §2.

### D · Capture

**Cards:** *deterministic capture grammar* · *tier 1.5 payee→category memory* ·
*`capturedTz` + editable date* · *capture components* · *S05 Quick add* · *S06
Category sheet* · *J02 stopwatch*. (S08 voice is excluded: on-device speech is
its own spike, blocked on a build.)

**Shape.** D1 grammar + D2 payee memory are pure `packages/core` logic and
run as parallel agents off `main` immediately — they need nothing from A–C.
D3 capture components and D4 S05/S06 stack on C1. D5 is the acceptance
journey: a test that times the grammar path.

### E · Money that moves

**Cards:** *§4 display conversion* · *§4a FX margin* · *§7 counterparty
balances* · *§8 clearing + largest-remainder* · *debt and settlement ops* · the
rest of `#e3` on the board.

**Shape.** Figures and ops off A1; the screens (S12, S13, S14, S31) off C1.
Lands after D so the debt tab has something behind it.

### F · Polish (parallel fill, independent)

*The add button floats* · *the header collapses* · *chart ramp inverts in dark*
· *a story for every component* · *D12 accessibility pass* · *`pnpm dev`* ·
*install and pin the stack choices* (closes as each lands). One agent each,
off `main`, whenever an agent is free.

### DESK · one PR, last

Reads every spec page's *Web — ≥1024px* section for the screens C–E built and
adds the desk composition: a breakpoint hook in `packages/ui` (`useBreakpoint`
over `useWindowDimensions` — no platform named), a sidebar `Shell(desk)`,
tables where the spec says table. The phone composition is untouched.

**The desk is not a wide phone** (asked for 2026-09-03: *"the web page doesn't
need that btw. floating doesn't make sense there. the web ux should look more
packed, like we have more estate"*). At desk width there is **no floating add
button** — the add action lives in the shell's top bar and on a keyboard
shortcut — and density goes up: the ledger is a table with real columns, the
hero shares its row with the period figures, cards sit side by side. The desk
layout is **designed before it is built** — a design canvas in the Hearth
palette, approved like the phone was — and that design is the input to this
PR, not this PR's output.

## 4. What every PR must satisfy

These are the repository's existing rules, restated so an agent's prompt can
point at one list:

1. **Spec first.** Implement from `operations.md`, `computations.md`,
   `screens/`, `flows/`. Where code must diverge, change the spec in the same
   PR. Never silently.
2. **The floor.** `core` never names a platform; `client` may import `react`
   and never `react-native`; every hook has its own file and takes its
   dependencies as parameters; no barrels; `makeStyles` only; no user-visible
   literal — every word through `useT()` with a key in `en.ts` **and** `pl.ts`.
3. **Guarantees are constraints.** Every "must never" gets a service check and,
   where the phone can, a SQLite constraint. Break it once.
4. **Money is `numeric` strings** through `money.ts`. A JS number holding an
   amount is a bug. Dates are bare `YYYY-MM-DD`.
5. **Placeholders only** in fixtures, stories, commits: `Bank A · PLN`.
6. **`pnpm verify` green** before a PR opens; the hook is the gate. Stage
   untracked files first (`[[verify-blind-to-untracked]]`).
7. **The board card is the source of truth for done.** Each PR closes exactly
   the cards it names; the description quotes each card's *Done when* and says
   how it was met.

## 5. How the agents are run

- **One agent per PR**, `subagent_type: general-purpose`, model **Sonnet**,
  `isolation: worktree`. Its prompt carries: the card(s) verbatim from the
  board, the spec sections to read, the rules in §4, the branch to base on,
  and the composition (for screens).
- **Adversarial review before merge**, by a second agent — this repo's default
  review mode (`adversarial-review` skill) — on every PR that touches
  `money.ts`, an executor, or a migration. The reviewer's brief is to break it.
- **The orchestrator** (this session) writes plans, dispatches, rebases the
  stack when a lower PR merges, and composes screens. It does not implement.
- **Cadence.** Wave 1: A1–A4, B1–B3, D1–D2, F (as many as parallel budget
  allows) — all off `main`. Wave 2: C1. Wave 3: C2–C6, D3. Wave 4: D4–D5, E.
  Wave 5: DESK.

## 6. Risks named now

- **Differential test needs Postgres.** A1's deliverable runs both sides; the
  SQL side needs `pnpm db:up`. The agent prompt says so and the worktree gets
  the three DB URLs.
- **`fast-check` may not be installed.** A1 adds it as a root devDependency
  with a one-line reason in `package.json` — it is a test tool, not a stack
  choice.
- **Screens will drift in look across six agents even with composition
  written down.** Mitigation: C1 ships the shell and states first; screens
  only compose from what exists; the visual suite baselines every story; the
  orchestrator reviews screenshots before merge.
- **Rebase cascades.** Kept small by basing everything possible on `main`.
  Only C→D→E→DESK is a true chain.
