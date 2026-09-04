# E6 · S17 Currencies and S18 Exchange rates — Implementation Plan (wave 4b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Read `2026-09-04-wave-4-shared.md` first. Base on `main` after E3 merges.

**Goal:** You can add a currency, pin it to the header toggle, retire one, choose its source, see coverage stated per currency, and see and correct the rates the phone holds — a range by hand in one entry, never overwriting another manual row silently.

**Architecture:** `packages/ui/src/fx/` gains `CurrencyChip` (the display-currency toggle over E3's preference — pinned set, active marked; `04` §4.5), `RateTable` (a `FlatList` of `date · rate · source Tag · manual amber`; gaps as explicit empty rows), `RateEditor` (single date or range, states what it will overwrite before writing), `CoverageTag`. Two screens under Settings: `apps/mobile/src/settings-currencies-screen.tsx` (route `settings/currencies`), `settings-rates-screen.tsx` (`settings/rates`); C6's Settings tab gains the two rows. `DeskBand`'s `CurrencyChip` slot (DESK1 left it empty) is filled by the same component; the FX status chip stays out (no source on the phone).

**Spec:** `screens/S17` §3–§9 · `S18` §3–§9 · `SPEC.md` §7.0, §7.6, §7.7 · `design-system/04` §4.5, §4.6 · `03` §3.7 (`RateField`, E5's).

**Board cards closed:** *S17 · Settings · Currencies* · *S18 · Settings · Exchange rates* · *D9 · FX admin* (`RateTable` `RateEditor` `RateField`; `SyncLog` reduced to its coverage half; `FxStatusChip` named as arc 2).

**Branch:** `feature/e6-fx-settings` off `main`.

## Tasks

1. **`CurrencyChip`.** Pinned currencies from the snapshot, active from `useDisplayCurrency`; tap cycles or opens a small sheet when more than three; nothing written. Placed in `Shell`'s header and `DeskBand`. Every `<FxAmount>` caller in C2–C6 that has a rate re-expresses on change — audit them and wire the ones that show a converted figure (S04's hero, S16's totals); the ones without a rate stay as they are.
2. **S17.** Row per currency: code, name, symbol, decimals, source `Select`, pinned `Toggle`, `CoverageTag` (amber below 100 with `last quote {date}`), archive (refused with the executor's reason on a `Toast`). Pivot read-only at the bottom with *Change* behind `ConfirmDialog` — E3's executor refuses once a transaction exists; the dialog says so before offering. *Add currency* → a sheet over `CreateCurrencyForm` (code, name, symbol, position, decimals, source, pinned). No backfill progress on the phone (nothing to fetch): the row's coverage says *no rates yet · set one by hand* linking to S18.
3. **S18.** Pair `Select` (quote; base is the pivot) and range chips (30 d · 90 d · year · custom via two `DateField`s) over `RateTable` (`listFxRates` paged by date, newest first); long-press a row or *Set a range* → `RateEditor` → `setManualRate` (first pass without `overwriteManual`; on `replacedManual > 0` in the refusal, a second confirm restates the count, then again with the flag); *Clear manual* on a manual row or range → `clearManualRate`. Coverage panel beneath: per currency `first · last · {pct} %` from `readCoverage`. Re-rate is **not offered** (`rerate_transactions` is server-only, `offlineEligible: false`) — the count of transactions resting on an estimate in the range is stated with *re-rate from the desk once a server exists*.
4. **Tests and stories.** Stories for each component and each screen state (`Fresh`, `HasOverrides`, `EmptyPair`, `Stale`); screen tests: pinning moves the currency into the chip; a range write of 3 days yields 3 manual rows and the second write over one of them asks first; archiving a referenced currency is refused with the reason.
5. **Report.** Commit, push; report PR *"The currencies you hold, and the rates the phone knows"*.
