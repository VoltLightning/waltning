# D5 · J02 acceptance — under ten seconds, offline — Implementation Plan (wave 4b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Read `2026-09-04-wave-4-shared.md` first. Base on `main` after D4b merges.

**Goal:** The board's card: *the whole daily-capture journey works end to end, offline, inside ten seconds — checked with a stopwatch rather than estimated.* The test is the stopwatch.

**Architecture:** J02 §3 and S05 §3 both say **the ten-second target belongs to the keypad path, which uses no model** — so this journey times taps and a save, not `parseCapture` (the arc design's *"a test that times the grammar path"* was wrong and is corrected in this PR). Two tests, one file, `apps/mobile/src/journeys/j02-daily-capture.test.tsx` (new folder `journeys` in the `apps/mobile/src` allowlist — a journey crosses screens and belongs to none). Both drive the **real** screens under react-native-web with a real `LocalLedgerSession` over an in-memory SQLite replica (`packages/ledger/src/test/scratch.ts`), no server, no network: the first counts interactions, the second measures wall-clock. A count is deterministic and fails in review; a wall-clock bound is the stopwatch the card asks for and is set loose enough not to flake on a laden CI box.

**Spec:** `flows/J02-daily-capture.md` §3, §6, §7 · `screens/S05` §3, §7 · `SPEC.md` G3 · `architecture/14` §14.6 (intent commits first).

**Board card closed:** *J02 daily capture — under ten seconds, offline*.

**Branch:** `feature/d5-j02-acceptance` off `main` (after D4b).

## Tasks

1. **The harness.** `apps/mobile/src/journeys/journey-harness.tsx`: mounts the tab shell's Today route and the Quick add route inside a stub router (`tabs-shell.test.tsx` already stubs `expo-router/ui`; extend that stub with `push`/`dismissTo` that swap the mounted screen) over one `createPhoneLedger` built on `scratchStores()`. Fixture: one account `Cash · PLN` (pivot rate present — seed `fx_rates` USD/PLN for today so the capture is valuable), the seeded taxonomy, one prior capture to `Eating out` with payee `Costa` so the proposal fires. Offline is the default: no transport exists in this harness.
2. **Interaction count.** From Today: tap `+` → keypad `4` `8` `,` `9` `0` → account chip (already last-used: **0 taps** inside the window; the test also runs the cold case at +1) → category chip → `Eating out` in the sheet → Save. Assert the total is **≤ 12 taps** (J02 §1's *"a capture is a dozen taps"*) and that the ledger holds one row `48.90 PLN`, `expense`, `Eating out`, dated the harness's device date, with an outbox entry sequenced **before** the replica row (`§14.6`: intent first — assert `applied_seq` advanced).
3. **Wall clock.** The same script, `performance.now()` from the `+` press to the Today screen re-rendering with the new row in *recent*. Assert **< 3 000 ms** in the test runner — ten seconds is the human budget; three is the machine's share of it with room for a slow box, and the number is named `MACHINE_BUDGET_MS` with that reasoning beside it. Run it **three times** and take the median so a first-render JIT stall does not fail the suite.
4. **The proposal path.** Type payee `Costa` (the payee chip → sheet → `TextField`) and assert the category chip fills as a proposal at confidence 1 and that accepting it costs **one** tap — this is the tap D2 was built to save.
5. **What the test refuses.** A capture on an uncapturable account (no rate) is refused before Save with the currency named (`transactions.needsRate`) and the outbox holds nothing — the refusal is asked before the write (§14.6).
6. **Docs.** The arc design §3 D: *"D5 is the acceptance journey: a test that times the grammar path"* → *"…that times the keypad path — J02's own target"*. J02 §7 gains a line under *Success*: *Measured by `j02-daily-capture.test.tsx` — tap count and wall clock, offline, on every gate.*
7. **Report.** Commit, push, report PR *"J02, with the stopwatch"*: the two numbers the test holds and why they are what they are.
