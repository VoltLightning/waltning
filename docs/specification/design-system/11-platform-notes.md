# Platform notes

One codebase via Expo + React Native Web (`SPEC.md` §14.6).

| Concern | Approach |
|---|---|
| Tokens | One TS module, consumed by RN `StyleSheet` and web CSS variables alike |
| Type | IBM Plex Sans via `expo-font`; web and Storybook via the same files |
| Icons | `@phosphor-icons/react` (web) / `phosphor-react-native` — same names, one wrapper |
| Charts | ⚠️ The known RN Web friction point. `victory-native` renders both, but treemap and dense tables may need a web-only path |
| Tables | Import review and Reports are dense and keyboard-driven — most likely to force `apps/web` |
| Keyboard | J/K/A/R/S/T on import review is web-only; mobile uses swipe |
| Haptics | Approve, Save, Undo on native; no-op on web |
| Safe area | The app reads the device once and provides four numbers; `packages/ui` renders numbers and imports no safe-area library |

**The device's chrome is a value, not a read.** A status bar is 24 on Android
and 59 on an iPhone with a Dynamic Island, and the shell's clearance was a
hardcoded 34 — a guess that floated the heading on one device and clipped it
under the other, with nothing in the layout saying which. The home indicator was
not cleared at all, so the last card and the add button sat under it on every
gesture-navigation phone.

`useSafeAreaInsets()` returns whatever the running device reports, which on
every machine this suite runs on is zero — so the layout that breaks on a
notched phone is precisely the one nothing can render. `apps/<surface>` performs
the read (`architecture/11`'s forced file) and hands `packages/ui` a
`SafeAreaInsets` through a provider shaped exactly like `ThemeProvider`; a story
can then *be* an iPhone, and the screenshot is the evidence.

Two rules follow, both in `shell.test.tsx`:

- **Clearance and padding add, never `max()`.** The inset is how much room the
  device needs; the padding is the design's own breathing room. `max()` would
  satisfy a naive "does it clear the notch" check while putting the heading hard
  against the status bar on exactly the phones with the biggest one.
- **`GroundPanel` clears the bottom and the sides, never the top.** The top
  belongs to the header above it, and the app guarantees there is one: the shell
  on the ledger, a navigation header on every other route. Sides always, because
  in landscape the notch is on one of them.

**Every route's top strip is painted by the app, in `shell`.** The ledger has
`TodayFrame`'s shell; every other route takes a navigation header styled from
the same token. One structural decision, three symptoms:

- **The status bar never flips.** `shell` is a deep green in *both* appearances,
  so the surface under the clock and battery is dark whatever the theme and the
  glyphs are `light` everywhere — one app-wide `<StatusBar>`, no per-route
  override to forget. They had never been set at all: the OS drew them in its
  own choice, which on a light-appearance phone is dark, over a dark green fill.
- **The Android band.** Expo enforces edge-to-edge from SDK 54, so the system
  leaves the status-bar area to the app and backs it itself when nothing claims
  it. `headerStatusBarHeight` defaults to the safe-area inset, so a header grows
  to include the strip and paints across it. The header *is* the claim.
- **A pushed route had no title and no way back.** The `Cancel` button in each
  form was standing in for navigation.

`headerShadowVisible: false`: §2.5 allows the system exactly one shadow and
reserves it for the floating button. A header is a surface, and surfaces here
separate by edge and by step.

**Escape hatch:** if the dashboard fights RN Web, `apps/web` reuses these tokens
and the tRPC client. Building tokens as a shared module first is what keeps that
split cheap.
