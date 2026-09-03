# DESK1 · The breakpoint and the band — Implementation Plan (wave 3a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Read `2026-09-04-wave-3-shared.md` first.

**Goal:** At desk width the app has a desk shell — brand, nav, the add action as a command bar slot, currency chip, scope segment, the hero in one row — and below the breakpoint the phone composition is untouched. **No floating add button above the breakpoint.**

**Design:** the canvas *Waltning Desk Layout* (2026-09-03), the top-band board; the arc design's DESK section is the scope. Match it: IBM Plex Sans, the Hearth tokens, a 14px band row, nav items as `sm` rectangles with the active one on `rgba(255,255,255,0.10)`, the hero row `displayOne` for mine and `displayTwo` for ours with the currency in `shellTextMuted`.

**Architecture:** `packages/ui/src/primitives/use-breakpoint.ts` — `useBreakpoint(): "phone" | "desk"` over `useWindowDimensions` (react-native, allowed in `ui`; the app never reads the width itself), threshold `1024` as a token (`tokens.ts` §2.9-style `breakpoint = { desk: 1024 }`). `packages/ui/src/shell/desk-band.tsx` — `DeskBand({ brand, nav: ReactNode, commandBar: ReactNode, currency: ReactNode, scope: ReactNode, hero: ReactNode, collapsed?: boolean })`: two rows expanded, one row collapsed (S10 and every non-landing route). `apps/mobile/app/(tabs)/_layout.tsx` — at `desk`, render `DeskBand` above the `TabSlot` and no `TabBar`, no `FloatingAdd`; the nav is the same four `TabTrigger`s rendered as links. The command bar slot holds a disabled placeholder field (`desk.addPlaceholder`, "Add — press N") until DESK2. `CurrencyChip` shows the ledger's first currency; the scope segment renders *All · Mine · Shared · Business* as a `SegmentControl` bound to screen state that nothing reads yet (say so).

**Spec:** the arc design's DESK section · `screens/S01-dashboard.md` §3 web (the band) · `design-system/05-composites.md` §5.1 (`Shell`) · `architecture/14` §14.4 (one codebase, width decides).

**Board card closed:** *DESK1 · The breakpoint and the band*.

**Branch:** `feature/desk1-breakpoint-and-band` off `main`.

## Tasks

1. `breakpoint` token + `useBreakpoint` with a test that fakes `useWindowDimensions` (a `jsdom` window resize).
2. `DeskBand` expanded and collapsed, stories in both themes at 1440 wide (a `Frame` decorator like `floating-add.stories.tsx`), axe green; hero from the same `DualTotal` C2 uses (if C2 has not merged, `CurrencyTotals` with a `TODO(C2)` is forbidden — use `DualTotal` with the snapshot's subtotals as *mine* and no *ours*, and say so).
3. The tabs layout switch; a render test that mounts the layout at 390 and at 1440 and asserts the bar and the button are present only at 390.
4. Chrome proof against `expo start --web`: 1440 shows the band, 390 the tabs; the floating button absent above and present below. Screenshots in the PR.
5. Gate and PR *"The desk has its own shell"*; quote *Done when*.
