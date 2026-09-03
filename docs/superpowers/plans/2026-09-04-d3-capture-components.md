# D3 · Capture components — Implementation Plan (wave 3a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Read `2026-09-04-wave-3-shared.md` first.

**Goal:** The four capture primitives every later screen composes exist as components with stories and tests: `SearchField`, `DateField`, `Keypad`, `Dock`. `TrailRow` (voice), `QueueItem` (receipts) and `SyncChip` (unspecified) are **not** built — the first two belong to excluded screens, the third has no spec.

**Architecture:** `SearchField` and `DateField` are primitives (`packages/ui/src/primitives/`). `Keypad` and `Dock` are the keypad half of S05 and live in `packages/ui/src/transactions/` beside `QuickAddForm`. Nothing here fetches; every component takes values and callbacks.

**Spec:** `design-system/03-primitives.md` §3.7 (inputs) · `05-composites.md` §5.1 (`Dock`) · `screens/S05-quick-add.md` §3 mobile (mode row · keypad · full-width Save) · `02-tokens.md` §2.4 shape rule, §2.7 motion.

**Board cards closed:** *Capture components — `Keypad` `AmountField` `DateField` `SearchField` `TrailRow` `QueueItem` `SyncChip`* (the four in scope; the PR body says which three are out and why).

**Branch:** `feature/d3-capture-components` off `main`.

## Tasks

### Task 1 · `SearchField`
`primitives/search-field.tsx`: `SearchField({ value, onChangeText, placeholder, onClear?, autoFocus?, resultCount? })` — leading magnifier mark (drawn, like `FloatingAdd`'s plus; no icon library yet), a clear control that appears only with a value (≥44px target, labelled `common.clear`), `role="searchbox"`, and an optional live-region line announcing `resultCount` through `common.results` (needs a plural — use the two-form English/Polish keys the catalogue already supports for counts; if none, add `common.resultsOne`/`common.resultsMany` and say so). Tests: clear appears with text and calls `onClear`; the live region announces the count. Story: `Empty`, `WithText`, `WithResults`.

### Task 2 · `DateField`
`primitives/date-field.tsx`: `DateField({ label, value, onChange, today, error?, hint? })` over `TextField`, validating `isAccountingDate` and refusing anything else with `transactions.invalidDate`; beneath it a row of three `Chip`s — *Today*, *Yesterday*, and the weekday of two days ago — each computing the bare `YYYY-MM-DD` with `addDays` from `@waltning/core/date` (D1 added it). No `Date` arithmetic in the component; the chips call the core helper. Tests: chips set the exact strings; a typed `2026-02-30` is refused. Replace the plain `TextField` date in `QuickAddForm` and `CreateAccountForm` with it (their tests keep passing — the label and the value contract are the same).

### Task 3 · `Keypad`
`transactions/keypad.tsx`: `Keypad({ onKey(key: "0"–"9" | "," | "delete"), disabled? })` — a 4×3 grid of `sm`-radius keys, ≥44px each, bottom-anchored by its consumer; press feedback is `usePressScale` and nothing else (§2.7: a keypad key is *constant* frequency → `motion.none`… the scale is the only feedback; no ripple). Comma is the decimal key, labelled by the locale's decimal mark (`money.decimalMark` or the catalogue's `common.decimalMark`). Tests: every key reports; delete reports `"delete"`. Story: `Default`, `Disabled`.

### Task 4 · `Dock`
`transactions/dock.tsx`: `Dock({ mode: "keypad", modes: readonly {value, label, disabled?}[], onMode, children, onSave, saveLabel, saveDisabled })` — the bottom-anchored composer: a mode row of `SegmentControl` (only `keypad` enabled in arc 1; `voice`/`receipt`/`converse` present but `disabled` with `common.later` as the accessibility hint), the keypad slot (`children`), and a full-width primary Save. Clears the bottom inset (`useSafeArea`). The Dock does not know the draft — S05's next card wires `AmountField` + `Keypad` into it. Tests: modes render, disabled ones announce; Save reaches `onSave`. Story: `Keypad` (with a `Keypad` inside), `SaveDisabled`.

### Task 5 · Gate and PR
Baselines (`pnpm test:visual:update` under the lock), gate, PR *"The capture primitives, ready to compose"*: quote the card, list the three components not built and where each lives (S08 voice, S07 receipts, no spec).
