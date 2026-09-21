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
| Soft keyboard | **Everything stays reachable with it up** — see below. One module (`primitives/keyboard.ts`, `keyboard-room.ts`); iOS keeps the platform's own scroll-view inset, Android is given the same thing by measurement, the web's window really does shrink and needs neither |

**With the keyboard up, everything is still reachable.** On a phone the
keyboard *covers* the window rather than shrinking it, on both platforms, so a
layout that does nothing has its lower half behind it. Four rules, each found
on a device rather than reasoned out:

- **A scroller holding a field gets the keyboard's *overlap* as room**, and the
  focused field is brought above the keyboard with air under it. The overlap,
  not the keyboard's height: a scroller whose bottom edge a footer or a sheet
  has already lifted is covered by less, or by nothing.
- **A drag never dismisses the keyboard.** `on-drag` put it away on the first
  point of any scroll, so a field behind the keyboard could not be scrolled to
  *while typing* — the only time it matters. It is dismissed by its own
  control, by a tap on bare page, or on iOS by dragging it down.
- **A bottom-anchored action rides the keyboard.** *Save* on Add and *Move
  money* on Transfer sit on its top edge, the home-indicator inset dropped
  while it is up.
- **A popover places itself in the room the keyboard leaves**, so a searchable
  `Select`'s options are never the thing behind it.

**Two coordinate spaces, and a window height that is not the layout's.** A
keyboard event speaks in *screen* coordinates; `measureInWindow` answers in the
*window's*. Where the window sits between the system bars they differ by the
status bar — 52pt on a phone with a camera cut-out. And `Dimensions`' window
height excludes the navigation bar even where the app draws under it, so
`window − screenY` under-measures the cover by that bar. The cover is measured
from where the layout actually ends (`layoutBottomOnScreen`); anything compared
against a measured view is first moved into the window's space
(`windowTopOnScreen`). Both are pure functions with the device's own numbers in
their tests.

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

- **The status bar's glyphs follow the appearance**, through the navigator's
  own `statusBarStyle` — `dark` on cream, `light` on the near-black. Nothing
  paints that strip: under edge-to-edge the window draws behind it and whatever
  React renders at y=0 *is* the strip, which is `ground` on every route now.
  `app.json` still configures `expo-status-bar` with `style: "light"`, and that
  is not a contradiction: the plugin writes the Android theme's default, which
  shows for the instant before JS runs.

  **On iOS that one line is half the change; the other half is native.**
  `react-native-screens` applies `statusBarStyle` by setting the style on the
  screen's own `UIViewController`, and iOS honours that only when
  `UIViewControllerBasedStatusBarAppearance` is `YES` in `Info.plist`. Expo's
  prebuild template writes the key `false`, so the library asserts on the
  mismatch and red-boxes the app on the first route that mounts — a launch
  failure on a real device, not a cosmetic one. `app.json`'s `ios.infoPlist`
  sets it `true`.

  Two consequences worth stating, because neither is visible from the
  `screenOptions` line. The key is baked into the binary, so it takes effect
  only on a build — never on a JS reload, and never in Expo Go, whose
  `Info.plist` this repository does not own; the glyph colour is therefore a
  property of builds that are ours. And the key is safe to set **only because
  nothing here calls the imperative status-bar API**: React Native's
  `RCTStatusBarManager` refuses `setStyle`/`setHidden` when the key is `YES`,
  the exact mirror of the error above. The two approaches are mutually
  exclusive, which is the second reason — beyond edge-to-edge — that no
  `<StatusBar>` is mounted anywhere in the tree.
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
