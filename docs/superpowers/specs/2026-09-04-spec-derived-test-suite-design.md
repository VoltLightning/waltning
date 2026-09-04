# A spec-derived test suite — the design

Two tiers. The first is part of the gate: journeys, invariants and upgrade
fixtures that run offline under `pnpm verify`, each one derived from a spec
line rather than from the code that implements it. The second is a separate,
on-demand run against the live stack: `pnpm e2e`, Playwright on Expo web. The
first tier is authoritative; the second proves wiring.

## Why

Wave 4's retroactive review produced four fix PRs, and every fix round's
re-review found defects inside the fix. Sorting those findings by what would
have caught them: an upgrade of a populated database (both R2 criticals), a
journey spanning a relaunch (the deferred capture dropped below the
watermark), a cross-layer invariant (read path and write path pricing the
same date differently; JavaScript `fold()` and the Postgres column
disagreeing on a tab), a screen journey (a malformed fee silently dropped).

The deeper cause was that tests were written from the fix, not from the spec.
A test asserting that Monday's rate beats Friday's for a Sunday capture pinned
a defect because the brief said so; a test written from `SPEC.md` §7.6's table
("weekend or holiday → carry forward") fails on Monday's rate. So every
journey here names the spec line it proves, and a fix agent may not edit its
assertions.

## Tier 1 — part of the gate

### Layout

| Path | What lives there |
|---|---|
| `packages/ledger/src/journeys/` | Session-level journeys over a real `LocalLedgerSession` on better-sqlite3, spanning simulated relaunches. No UI. |
| `packages/ledger/src/invariants/` | Property suites over the phone's ledger: read equals write, scale after every op, fresh equals upgraded, backfills complete. |
| `packages/db/src/invariants/` | Postgres-side parity and constraint properties: fold parity, scale on every money column, CHECK `convalidated`. |
| `packages/ledger/fixtures/upgrade/` | One populated SQLite dump per shipped replica and outbox version, from the version this suite lands with. Earlier chains are not a supported origin. |
| `apps/mobile/src/journeys/` | Screen journeys in D5's harness: real screens, real session, stub router, offline by construction. |

Vitest already includes these globs. Each file's header cites the flow or
spec section it proves and lists the finding ids it encodes
(`docs/superpowers/plans/2026-09-04-retro-review-findings.md` numbering, plus
the review rounds' ids as `R2 C2`).

### The relaunch primitive

`packages/ledger/src/journeys/relaunch.ts`: closes the session, reopens the
same two files through `createLocalLedgerSession`, runs `migrateReplica`,
`migrateOutbox` and `recoverOnLaunch` exactly as `phone-ledger.web.ts` does,
and returns the new session plus the recovery result. Every journey that
says "relaunch" uses it; nothing else may reopen a store mid-test.

### Journeys

Each journey is one scenario from a flow or spec section, written as the spec
states it. Where `main` fails the scenario today, the test is
`it.fails("<finding>", …)` so it turns red the moment a fix lands and the fix
PR must flip it to `it`. The list, with the source line and the finding:

Ledger journeys (`packages/ledger/src/journeys/`):

- **capture-deferred.journey.test.ts** — J02 §2, `architecture/14` §14.6,
  `architecture/08` §5 "never drop". Capture in a currency with no rate row;
  the outbox entry commits, the row does not; relaunch; a rate row arrives;
  relaunch; the row exists and the entry carries no disposition. Then the
  same with a later entry applying between the two relaunches (the watermark
  case), and with an `update_transaction` on the deferred row queued behind
  it (must not become `refused`). Findings R2 H1, R2 C2, R2 H1-b.
- **weekend-capture.journey.test.ts** — `SPEC.md` §7.6's table rows
  "weekend or holiday", "rates stale, offline", "no rate exists at all".
  Friday and Monday quotes, Sunday capture → Friday's rate, `fx_rate_estimated`
  false. Quote 11 days back and nothing after → priced, estimated. No row
  before, quote 3 days after → priced, estimated. R1 H1, R1 H2.
- **pivot-change.journey.test.ts** — J10 §4, `SPEC.md` §7.6 "pivot change".
  A date whose bridge is an orphaned carried row is skipped whole (no derived
  row, no reciprocal, for any quote); a carried bridge with a traceable origin
  rebases and keeps its carry age; the outcome reports rebased, dropped and
  skipped counts. R1 M1, R1 H1-r5, R1 H2-r5, R1 M1-r5.
- **manual-rate.journey.test.ts** — S18 §7. A manual rate outranks a synced
  one; clearing restores the displaced trio; a rate that rounds to zero
  reciprocal is refused at the contract edge, never inside `apply`. R1 H3-r5.
- **counterparty-names.journey.test.ts** — S15 §9.2, `SPEC.md` §9.
  `ŁUKASZ` then `łukasz` collide on the phone; an NFD spelling collides with
  NFC; an archived name is free again; unarchiving into a live collision is
  refused naming the row. R2 C1, R2 H1, R2 M3.
- **merge-unmerge.journey.test.ts** — S15 §9.3. Merge moves every
  transaction and records the ids; unmerge repoints only those; a chained
  merge is refused; the loser cannot be lost twice. R2 H2, R2 M2.
- **settle-debt.journey.test.ts** — J07 §3–§5. Settle carries its direction;
  a settlement in an account of the wrong currency is refused; amounts round
  at the currency's scale; a stale balance is refused with "reload". R2 H4,
  R4 (settle scale mirror).
- **transfer.journey.test.ts** — J16 §2–§4, `computations.md` §12.2. A
  cross-currency transfer values both legs at the row's date; a fee is in the
  source currency, non-negative, at scale; a zero-amount transfer is refused.
  R5, R4 M2.
- **currency-decimals.journey.test.ts** — `SPEC.md` §7.2. Lowering a
  currency's decimals under rows in any of the seven money tables is refused
  on the phone with the same rule the trigger enforces, archived accounts
  and soft-deleted rows included. R4 C1, R4 H-r4 (mirror parity).
- **upgrade.journey.test.ts** — `architecture/14` §14.6. Every fixture in
  `fixtures/upgrade/` opens under the current build, keeps every row, and
  matches a fresh install on `sqlite_master`, `pragma table_info`,
  `index_list`, `index_xinfo`, `foreign_key_list`. A fold collision that
  exists only after the backfill is refused before the copy is taken, naming
  the rows; a second launch reports the same cause. R2 C1, R2 C2, R3 C2, R3 H1,
  R3 M2.

Screen journeys (`apps/mobile/src/journeys/`), in D5's harness:

- **j07-lend-and-settle.journey.test.tsx** — J07 end to end: lend, see the
  debt figure, settle from the counterparty screen, figure returns to zero.
- **j16-move-money.journey.test.tsx** — J16 end to end: transfer between
  accounts of different currencies; the destination follows the currency and
  the date; a malformed fee (`1,234.56`, `,5`, `12.`) disables Save with the
  field named; switching accounts refuses a figure past the new scale. R4 H1,
  R4 H2, R4 H-r4 (date), R4 M-r4 (`,5`).
- **j10-rates.journey.test.tsx** — J10: the rates screen shows the same
  figure for a date that a capture on that date is priced with. R1 L5-r5.

### Invariants

`packages/ledger/src/invariants/`:

- **read-equals-write** — for every date over a generated two-month table of
  `nbp`, `carried_forward`, `manual` and `derived` rows: wherever `readRate`
  answers, `readNearestRate` returns the same rate, `asOf` and distance, with
  `inEffect` true; wherever it does not, `readNearestRate` is either nothing
  or `inEffect` false.
- **scale-after-every-op** — a generated sequence of registry operations over
  every money column; after each, no stored figure exceeds its currency's
  scale, and the phone's refusal set equals Postgres's for the same inputs
  (the db half lives in `packages/db/src/invariants/`).
- **fresh-equals-upgraded** — every prefix of the chain, upgraded to current,
  equals a fresh install on schema metadata (above), not on names.
- **backfills** — every `*_BACKFILLS` key names a step; after the step, no
  row holds the column's default sentinel while its source column is
  non-empty; the hook throws if its marker statement is absent.
- **outbox-replay** — replaying any entry twice is once (`architecture/08`
  H13).

`packages/db/src/invariants/`:

- **fold-parity** — JavaScript `fold(name.trim())` equals the generated
  column for a corpus of NFC, NFD, both cases of the nine Polish letters,
  non-Polish diacritics, and every ECMAScript whitespace code point at either
  edge; the trim CHECK refuses exactly the strings `.trim()` would shorten.
- **check-validated** — every `NOT VALID` constraint is `convalidated` on a
  fresh install and stays enforced for new rows when a violating row exists.
- **migration-drift** — `drizzle-kit`'s generate against the committed
  snapshot yields no statements.

### Upgrade fixtures

A fixture is a SQL dump of a populated database at one shipped version:
rows in every table the later chain touches, names that fold-collide only
after the fold, a deferred outbox entry, a watermark above zero. The first
fixtures are the replica and outbox versions this suite lands with; each PR
that adds a migration adds the fixture for the version it leaves behind.
`upgrade.journey.test.ts` iterates the directory, so a missing fixture is a
red test, not an omission.

### Gate rules

- Tier 1 runs in `pnpm test`, so in `pnpm verify`. Nothing here needs a
  process someone remembered to start.
- A fix agent may flip `it.fails` to `it`, never edit a journey's assertions
  or its fixture. A change to a journey's assertions is a spec change and
  cites the spec line that moved.
- `tests/docs-consistency.test.ts` gains a rule: every file under a
  `journeys/` or `invariants/` directory cites at least one spec path that
  exists.
- A review finding that names a concrete input and wrong output lands as a
  journey (marked `it.fails`) before its fix is dispatched.

## Tier 2 — on demand

`tools/e2e/` grows from the smoke check into Playwright specs against Expo
web (`apps/mobile` exported for web) on the running API, run by `pnpm e2e`
and by nothing else: not the hook, not the merge script. It proves that the
stack that is running is wired the way the tier-1 harness assumes.

- Specs mirror tier-1 journeys one for one: first run, daily capture,
  transfer, lend-and-settle, rates. A tier-2 failure with tier 1 green points
  at wiring, not logic.
- Each run clones a throwaway database from the template and drops it after;
  the read-only mode goes away because every spec writes.
- Playwright is already a dev dependency (the visual suite); the specs reuse
  its config with a second project pointed at the web URL.
- iOS and Android are the same journeys under Maestro, unblocked by the EAS
  cutover, and are a board card, not this design.

## What this assumes exists

`LocalLedgerSession` with `migrateReplica`/`migrateOutbox` on open; D5's
`journey-harness.tsx`; `scratchStores`; the retro branches' `LocalDeferral`,
`disposition`, versioned chains and backfills, which the marked journeys
describe and which flip green as those branches land.

## Out of scope

Device automation, performance budgets beyond J02's existing stopwatch,
sync journeys (arc 2), and any change to the operations the journeys
exercise.
