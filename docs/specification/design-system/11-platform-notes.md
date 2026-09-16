# Platform notes

One codebase via Expo + React Native Web (`SPEC.md` §14.6).

| Concern | Approach |
|---|---|
| Tokens | One TS module, consumed by RN `StyleSheet` and web CSS variables alike |
| Type | IBM Plex Sans via `expo-font`; web and Storybook via the same files |
| Icons | Phosphor **duotone path data, vendored** (`packages/ui/src/shell/phosphor.tsx`), drawn through `react-native-svg` — one file for both targets. Not `phosphor-react-native`: its entry re-exports 1,512 icons from 63 MB of source, Metro does not tree-shake across that, and it took the iOS bundle from 6.3 MB to 13 MB. Adding a glyph is a copy, not an install |
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
  on the ledger, `PageHeader` on every other route. Sides always, because
  in landscape the notch is on one of them. The clearance lives on the scroll
  content, not on the panel itself, so the last row clears the home indicator
  at the end of the scroll — not at the fold, where a short screen's content
  happens to end. `clearBottom` (default `true`) turns the bottom half off for
  a panel that is not actually the screen's own bottom edge — a `Dock` sits
  below it (`transfer-screen.tsx`, `quick-add-screen.tsx`) and clears that
  inset itself, so the panel passes `clearBottom={false}` rather than clearing
  the same inset a second time.

**No route wears a navigation band.** The deck has none: every artboard that
is not a tab root — S09, S13, S16, S17, S18, S30's *Back up* — opens with a
`displayTwo` title and a muted line on the same cream the cards sit on, and
puts the way back in the corner as a drawn mark. Twelve shipped screens wore a
sage band with a small white title instead, purely because that is what
`Stack.Screen` draws when nobody says otherwise, and the result was that Today
looked like the design and everything you navigated *to* looked like a
different app.

So the header is the screen's own — `PageHeader`, composed *beside*
`GroundPanel` rather than inside it, which is what makes the top inset that
screen's to clear. `tests/architecture.test.ts` refuses a route layout that
leaves the platform's header on, because the failure mode is one new route
quietly re-enabling it.

**Every route's top strip is therefore painted by the app, in `ground`.** The
ledger has `TodayFrame`; everything else has `PageHeader`. One structural
decision, three symptoms:

- **The status bar's glyphs are still set for a green strip, and are now
  wrong.** `app.json` configures `expo-status-bar` with `style: "light"`, which
  writes `android:windowLightStatusBar=false` at *build* time. That was right
  while `shell` — a deep green in both appearances — painted the strip on every
  route. It has been wrong on the ledger since that screen got its hero and the
  strip there became `ground`, and it is wrong everywhere now. **It is not
  fixable from here:** the correct value is per appearance, which is a runtime
  property, and the API that sets it without turning edge-to-edge off is
  `react-native-edge-to-edge`'s — a native module. It arrives with the build
  that is ours (E0 · *Leave Expo Go*); until then the light appearance's clock
  reads faintly on cream.
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
