# C1 · Tab shell and the state components — Implementation Plan (wave 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app has tabs — Today · Ledger · `+` · Calendar · Debt — and the design system has every state component the screens will compose from: `TabBar`, `BottomSheet` (exists), `Shell(hero)`, and D4's `EmptyState` (three variants), `ErrorState` (three), `Skeleton`, `Banner` (three tones), `Toast` + `UndoToast`, `MatchWarning`, `ThinkingIndicator`, `ThresholdSlider`, `RuleHealthTag`. Calendar and Debt tabs are stubs that render `EmptyState(range)` until their arcs.

**Architecture:** `expo-router`'s own `Tabs` (bundled in `expo-router/ui` — no new dependency) drives navigation; `packages/ui/src/shell/tab-bar.tsx` renders it (a `TabBar` component taking `items` and `activeName`, the platform-neutral bar; the route file `apps/mobile/app/(tabs)/_layout.tsx` binds it to the router — the only file that names `expo-router`). Every state component lives in `packages/ui/src/states/`, one file each, with a story per variant and a render test. `EmptyState` gains `variant: "first-run" | "filtered" | "range"` (the existing call sites pass `first-run`). Every word through `useT()`.

**Spec:** design §3 C1 · `design-system/05-composites.md` §5.1 (structural), §5.4 (messaging) · `design-system/08-states-and-recovery.md` §8.1–8.5, §8.8 · `design-system/09-state-matrix.md` (six states) · `screens/S04-today.md` §3 (the tab list).

**Board cards closed:** *`expo-router` file tree + tab shell* · *D2 · structure* (the `TabBar`/`Shell` half; `Dock` is D3 capture) · *D4 · states*.

## Global Constraints

- `packages/ui` names no platform beyond `react-native`; `expo-router` appears only under `apps/mobile/app/`. Route files compose and define no hooks (`makeStyles` excepted).
- `makeStyles` only; tokens only (`space`, `radius`, `type`); no raw numbers (conformance test); §2.4 shape rule: `sm` rects for controls, `pill` only for the radio, the switch, and **the floating add button** — the raised `+` on the tab bar is that button's home for now (the floating/docking behaviour is F's card).
- Every visible word: `en.ts` + `pl.ts`. Every animation: transform/opacity only, `motion.*` tokens, `useReducedMotion` branch.
- Every new component: story per state, render test, axe-clean (the visual suite runs axe on every story).
- Branch `feature/c1-shell-and-states` off `main` **after A1–A4/B1–B3 have merged** (C1 is wave 2; it rebases on whatever landed).

---

### Task 1: `EmptyState` variants and `ErrorState`

`states/empty-state.tsx`: add `variant` (required — update the three existing call sites and stories). §8.1: *first-run* offers create/import, *filtered* states the excluded count (`count` prop, **no plural message** — render "{{count}} hidden by filters" as a number and a noun that does not decline: the Polish-plurals card is blocked on a build; use `states.filteredHidden: "Hidden by filters: {{count}}"`), *range* names the period and offers *widen*. `states/error-state.tsx`: `variant: "recoverable" | "terminal" | "partial"`, props `what`, `why`, `cost?`, `action?` per §8.2 — never a bare code. Tests + 6 stories. Commit.

### Task 2: `Skeleton`, `Banner`, `Toast`/`UndoToast`

`skeleton.tsx`: `shape: "row" | "hero" | "block"`, a single shimmer at `motion.base` on opacity only, reduced-motion → static `subtleFill`. `banner.tsx`: `tone: "warn" | "negative" | "neutral"`, `message`, optional one `action` — §5.4: warn = P4 amber (the only amber), negative = danger, neutral = offline-as-freshness. `toast.tsx`: `Toast` (message, 4 s, dismiss) and `UndoToast` (message, `onUndo`, 8 s, repeats collapse to a count via `count` prop) — timers through a `useTimer` hook in its own file; slide in on `translateY` at `motion.move`. Tests include *undo within 8 s calls `onUndo`* and *reduced motion renders without transform*. Stories. Commit.

### Task 3: `MatchWarning`, `ThinkingIndicator`, `ThresholdSlider`, `RuleHealthTag`

Per §5.4/§8.4/§8.5: `MatchWarning` (candidate row + its balance via `<Amount>`, **no default action** — two equal buttons); `ThinkingIndicator` (`phase: "thinking" | "tool" | "streaming"`, cancel button appears at 20 s — prop `elapsedMs` so the test can assert without waiting); `ThresholdSlider` (0.50–0.99, **cannot reach 1.00**, value shown as a two-decimal figure); `RuleHealthTag` (`Tag` variant over five states with keys `states.rule.<state>`). Tests, stories. Commit.

### Task 4: `TabBar` and `Shell(hero)`

`shell/tab-bar.tsx`: `TabBar({ items: readonly { name; label; icon: ReactNode; active }[]; onSelect(name); onAdd(); addDisabled? })` — five targets ≥ 44px, the raised `+` in the middle (56px, `radius.pill`, `elevation.float`), safe-area bottom from `useSafeArea()`. `shell/shell.tsx`: `Shell({ leading, trailing, hero, children })` — the sage band (`theme.shell`) holding the header row and `DualTotal`; `TodayFrame` is refactored to compose `Shell` (behaviour unchanged, its tests still pass). Stories; a test that every tab is a `tab` role with `aria-selected`. Commit.

### Task 5: The route tree

`apps/mobile/app/(tabs)/_layout.tsx` — `Tabs` from `expo-router/ui` with `TabList`/`TabTrigger`/`TabSlot`, rendering `<TabBar>`; `(tabs)/index.tsx` (Today), `(tabs)/ledger.tsx` (S10 stub → `EmptyState(range)` until C4), `(tabs)/calendar.tsx`, `(tabs)/debt.tsx` (stubs). `quick-add` and `account/new` stay as stack routes above the tabs (the root `Stack` gets a `(tabs)` screen with `headerShown: false`). The `+` pushes `/quick-add`. Route titles via `t("routes.*")` — add `routes.ledger/calendar/debt` in both languages. `phone-preview-presentation.test.ts` and `screens.test.tsx` updated for the new path. Verify in Chrome against `expo start --web` before the PR (the same headers/worker setup #78 landed). Commit `"Tabs at the bottom, and moving between them works"`.

### Task 6: Gate and PR

`pnpm test:visual:update` (root — ~30 new baselines), `git add -A && pnpm verify`. PR *"The shell and every state a screen can be in"*; quote the three cards' *Done when*s; screenshots of the tab bar in both themes.
