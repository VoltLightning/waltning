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
- **`GroundPanel` clears both edges by default**, and a panel under the shell
  opts out of the top. That direction is deliberate: forgetting to opt out is
  extra padding anyone can see, forgetting to opt in is content under the status
  bar that no test machine ever renders. Left and right are always cleared —
  they are always the screen's sides.

**Escape hatch:** if the dashboard fights RN Web, `apps/web` reuses these tokens
and the tRPC client. Building tokens as a shared module first is what keeps that
split cheap.
