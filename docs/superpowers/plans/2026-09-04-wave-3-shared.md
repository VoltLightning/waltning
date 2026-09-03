# Wave 3 · what every plan in this wave shares

> Read this first; every wave-3 plan points here instead of repeating it.

**Base:** `main` at or after PR #91 (C1: tab shell, `Shell`, `TabBar`, every state component; wave 1 all landed: A1–A4 figures and ops, B1–B3 forms and field errors, D1 grammar, D2 payee memory).

**Rules:** `CLAUDE.md` and `docs/superpowers/specs/2026-09-03-arc-phone-stack-design.md` §4, plus these three that wave 1 taught:

1. **The gate is one foreground call** — acquire the machine-wide lock, verify, commit, release, never backgrounded, never waited on through a monitor:
   ```
   until mkdir /tmp/waltning-verify.lock 2>/dev/null; do sleep 20; done; git add -A && pnpm verify && git commit -q -F /tmp/<branch>-msg.txt; rc=$?; rmdir /tmp/waltning-verify.lock; exit $rc
   ```
   Stories changed? `pnpm test:visual:update` the same way first. A small visual change (an icon, a mark) sits under the suite's 1% pixel tolerance and will *pass against a stale baseline* — rewrite that story's baselines explicitly (`cd packages/ui && pnpm exec playwright test -g "<title>" --update-snapshots=all`) and look at the PNG.
2. **Motion is Reanimated + gesture-handler.** `Animated`, `PanResponder`, `Easing` from `react-native` are banned by a test; under Vitest both libraries are stood in for (`packages/ui/.vitest/`); every `useAnimatedStyle` carries its dependency array.
3. **A screen is one file in `apps/mobile/src/<name>-screen.tsx`, composed from `packages/ui`, with the ledger through `useLedgerController()`.** Reads and writes reach the screen through `PhoneLedgerSnapshot` / `PhoneLedgerController` (`packages/client/src/ledger/create-phone-ledger.ts`) over `LocalLedgerSession` (`packages/ledger/src/session.ts`). **Exposing an executor the session does not yet expose is part of the screen's PR**: add the session method (one line calling `write(executor, input, capture)`), the port method, the controller method that returns `{ id } | { fieldErrors }` (B1's contract — never throw for a refusal), and its test. Every screen: a render test per state under react-native-web, a story per state, keys in `en.ts` **and** `pl.ts`.

**Shared vocabulary that exists — compose, do not reinvent:** `Shell`, `GroundPanel`, `Card`, `TabBar`, `BottomSheet`, `DualTotal`, `CurrencyTotals`, `FloatingAdd` (`packages/ui/src/shell/`); `EmptyState`×3, `ErrorState`×3, `Skeleton`, `Banner`, `Toast`, `UndoToast`, `MatchWarning`, `ThresholdSlider`, `RuleHealthTag` (`states/`); `TransactionList`, `TransactionRow`, `QuickAddForm` (`transactions/`); `BalanceRow`, `CreateAccountForm` (`accounts/`); `Amount`, `FxAmount`, `AmountField` (`fx/`); `Button`, `IconButton`, `Chip`, `Select`, `MultiSelect`, `RadioGroup`, `SegmentControl`, `TextField`, `Toggle`, `Checkbox`, `Tag` (`primitives/`). Field errors: `packages/client/src/transport/field-errors.ts` and the `fieldErrors` prop pattern in both forms.

**What no wave-3 PR builds** (named so nobody invents it): FX rates and `FxAmount` with a live basis (#e3); counterparty writes (E3); voice, receipts, the agent (excluded from arc 1); the audit log on the phone; an undo for a soft delete or an archive — no `restore_*` operation exists in `operations.md`, so a delete/archive shows a plain `Toast`, and *"restore ops for delete/archive"* is the follow-up card to name in the PR body.

**Order inside the wave.** 3a runs first, in parallel, off `main`: **D3** (capture components — `SearchField`, `DateField`, `Keypad`, `Dock`), **D4a** (S06 category sheet), **C2** (S04 Today), **DESK1**. 3b runs once D3 and D4a have merged: **C3**, **C4**, **C5**, **C6** — they compose `SearchField` and the category sheet.
