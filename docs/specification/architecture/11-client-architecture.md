# 11 · Client architecture — the manifesto

> An app is a delivery mechanism, not a place where logic lives.

This document exists because the dependency floor in `10-code-structure.md` had
no slot for shared client logic, and logic went where there was room: into
`apps/mobile`. Nothing was violated. The architecture had nowhere else to put
it.

Four independent reviews of the client tree found the same thing from four
angles, and the number is the argument:

**Of 22 files under `apps/mobile/src/` and `apps/mobile/app/`, three are
genuinely forced to be app-specific. Nineteen are there by accident.**

Two of the nineteen — `base-url.ts` and `client.ts` — carry docstrings
explaining that they were written platform-free *on purpose*. They were then
filed inside the iOS app anyway. That is not carelessness; it is what happens
when the only directories that exist are `apps/` and a contract package that
forbids React.

---

## 1 · The seam

**The question that decides where a file lives is: does it name a platform?**

Not "is it UI". Not "is it reusable". Not "have three consumers appeared yet".
Naming a platform means importing `react-native`, `expo-*`, `import.meta.env`,
a router, or reading `Platform.OS` / `__DEV__`.

By that test, the entire platform surface of this client is:

```
apps/mobile/src/platform.ts     Platform.OS · __DEV__ · EXPO_PUBLIC_*
apps/mobile/app/_layout.tsx     expo-router
apps/mobile/app/index.tsx       a screen, and §14.2 gives web a different density
```

Everything else — the transport, the base-URL resolver, the hooks, the state
machines, the money formatting, the components — is the same code on a phone
and in a browser. It belongs in packages, and an app that wants it imports it.

---

## 2 · The floor, corrected

```
                          packages/core
                    contracts · money · protocol
                     decimal.js and zod only
                     no React, no platform, no Node
                              ↑        ↑
              ┌───────────────┘        └───────────────┐
              │                                        │
      packages/client                            packages/ui
   transport · hooks · models                tokens · components
      react — never react-native            react-native (RNW on web)
              ↑                                        ↑
              └────────────┬───────────────────────────┘
                           │
              apps/mobile        apps/web        (apps/api → packages/db → core)
              routes + platform wiring, and nothing else
```

**`packages/client` may import `react`. It must never import `react-native`.**

That one line is the whole design. React is a platform-neutral library; React
Native is a renderer. A hook written against React alone runs unchanged under
Expo and under Vite, so every piece of client *behaviour* — fetching,
cancellation, error classification, staleness — is shared by construction, and
only *rendering* is negotiable.

`client` and `ui` are siblings. Neither imports the other; neither imports an
app. The one type-only edge from `client` to `apps/api/router` is what carries
operation types to the client (§11.0) and is erased before any bundler sees it.

---

## 3 · Placement is decided by kind, not by count

`CLAUDE.md` says **no abstraction before the third use**, and that rule stands.
It is about *inventing* abstractions — repositories, managers, event buses,
generic helpers nobody asked for. Those wait for three consumers, and usually
for ever.

**It says nothing about where code lives.** Placement is not an abstraction. A
hook that fetches accounts is the same hook whether one app calls it or two, and
moving it into a package invents nothing — it relocates something that already
exists. Waiting for a second app before sharing is how the second app becomes
expensive, which is the cost the monorepo was built to avoid.

So:

| Kind of code | Where, from the first line |
|---|---|
| Contracts, money, protocol, pure domain | `packages/core` |
| Transport, hooks, client state, derived models | `packages/client` |
| Tokens, components, anything that renders | `packages/ui` |
| Routes, navigation, platform reads, build config | `apps/<surface>` |

An **abstraction** over any of these still waits for the third use.

---

## 4 · Every hook has a file, and the file is named for what it returns

No hooks in route files. No hooks defined next to the component that happens to
be their first caller. Each hook's concrete module is its public entrypoint;
there is no barrel between the caller and its owner.

A hook in a route file is invisible to the test runner — `vitest.config.ts`
collects `apps/*/src/**`, and `app/` is a sibling of `src/`, not a child. A hook
that closes over a module singleton instead of taking a client cannot be pointed
at a stub. Both were true of `useProbe`, and both are properties of *where it
was written*, not of what it does.

A hook takes its dependencies as parameters. `useAccounts(api)` is testable;
`useAccounts()` reaching for a singleton is not.

---

## 5 · One state machine for asynchronous reads

Three feature hooks were written independently and came out **byte-identical
modulo the domain noun** — 33 lines each, the same `loading | ready | failed`
union, the same `live` cancellation flag, the same error normalisation. A fourth
partial copy in a route file had already drifted: it discarded the `Error` the
other three preserved.

That is not three hooks. It is one hook, written four times, diverging.

`useQuery` in `packages/client` is that hook. A feature's data access becomes
the two lines that are actually about the feature — which operation, which
arguments — and the cancellation logic exists once, where a single test can hold
it.

---

## 6 · The rules are tests

Everything above is checkable, and what is not checked does not hold. This
repository has the evidence: `packages/ui` shipped a complete design system with
a conformance suite that bans hardcoded colours, and the app hardcoded the exact
colour the token file names as its motivating defect — because the suite roots
itself at `packages/ui/src` and could not see `apps/`.

A rule whose scope is narrower than the behaviour it governs is not enforced. It
is a rule about one directory.

The enforcement that makes this document real lives in
`tests/architecture.test.ts`, and each check names the rule it holds:

| Rule | What the test refuses |
|---|---|
| `packages/client` never imports `react-native` | the line that would fork the second app |
| `packages/core` never imports a Node API | a phone bundle that crashes at run time while typecheck is green |
| No package imports `@waltning/db` | the Postgres driver reaching a phone transitively |
| `apps/*` hold only platform-named code | the next nineteen accidental files |
| Design conformance covers every `ui/` folder | a hardcoded colour outside `packages/ui` |
| Platform-variant files are imported extension-less | a web override silently ignored |
| Only screens fetch | a molecule that cannot render in a test or offline |
| No component holds a user-visible string | the next forty screens needing a retrofit |
| The translator is imported from `i18n/provider` | a component rendering its own keys |
| Every stylesheet is a `makeStyles` | a theme resolved at import time, and a colour in JSX |
| No `style={{ … }}` object in JSX | styling split across two places in one component |

---

## 7 · No word reaches a screen except through a catalogue

**Every user-visible string lives in `packages/ui/src/i18n/`, and a literal in a
component fails the gate.** This is the same rule as *no hardcoded colours*, for
the same reason and with the same evidence behind it: nothing about a hardcoded
label looks wrong. It renders, it is legible, and it is only wrong to a reader
who never sees this repository.

**The rule exists now because the retrofit is cheap now.** Localising six
screens cost an afternoon; the board holds forty more. Every string written
before the rule is one to find later, and the ones that are found late are found
by a person who does not read the language.

The shape:

| Piece | Where | Why there |
|---|---|---|
| The catalogues | `ui/i18n/en.ts`, `ui/i18n/pl.ts` | TypeScript, not JSON — **the English file is the type**, so a language missing a key does not compile and one inventing a key does not either |
| The language choice | `ui/i18n/locales.ts` | Pure functions over strings: which language a device gets, and how a figure is punctuated in it. No React, no i18next, so both are testable without mounting anything |
| The provider and `useT` | `ui/i18n/provider.tsx` | A language is a value, not a module constant — the same call `theme/provider.tsx` makes |
| The device's languages | `apps/<surface>/src/platform.ts` | A platform read. `expo-localization` on the phone, `navigator.languages` in the browser |

**`i18n` is foundation, beside `fx` and `theme`.** A language is not a domain:
every module that shows a word depends on it, and nothing in it may depend on a
screen. `tests/module-boundaries.test.ts` holds that direction.

**Components import `useT` from the provider, never `useTranslation` from
`react-i18next`.** The default i18next instance is created when that module is
first imported, and importing the translator *is* importing the module — so
initialisation is a consequence of use rather than a thing to remember. The
alternative is not an error but something worse: every component silently
renders its own keys, so `Save` reads `common.save` in every test and story that
did not happen to wrap a provider.

**A component with no provider renders English rather than throwing.** The
population of call sites that legitimately have no provider — render tests,
stories, diff previews — is large and growing, and a throw there would buy
nothing and cost a wrapper at each one.

Two things are **not** translated and the distinction is worth stating. Money's
*group separator* is fixed at U+00A0 in every language, with the reasoning in
`design-system/04` §4.1; only the decimal mark follows the reader. And
accounting dates stay bare `YYYY-MM-DD` strings end to end (§7.0a) — a localised
date is a rendering, never a value.

---

## 8 · One way to build a stylesheet

**Every component's styles come from `makeStyles`, and `StyleSheet.create` is
called in exactly one place — inside `makeStyles` itself.**

`StyleSheet.create` at module scope resolves colours at *import* time, which is
what made the theme a build-time constant before `theme/styles.ts` existed. The
alternative that suggests itself — move the colours inline and leave the layout
in a stylesheet — is worse: it splits one component's styling across two places,
which is how a hardcoded colour gets added back without anyone noticing.

**An inline `style={{ … }}` is banned for that reason, not for tidiness.** The
two files that had no stylesheet at all are the evidence. The root layout's
first frame and Storybook's own theme panel both painted a `View` that sat
*above* `ThemeProvider`, so both read `themes[name].ground` by hand and wrote
the result into JSX — the only two places in the app where a colour reached an
attribute directly. Neither needed an inline style; both needed to be a
component one level down, under the provider. That is what they are now.

`makeStyles` is a hook, so a route may define one — the narrow exception to §4's
rule that hooks do not live in route files. Both of that rule's objections are
about *behaviour* reaching for a dependency it did not take: a stylesheet has
nothing to point at a stub, and it reads the theme from context rather than a
singleton. Banning it would leave a route one way to paint itself, and that way
is the inline object.

### What the app boundary was hiding

`packages/ui`'s conformance suite bans colour literals and raw `fontSize`, and
roots at `packages/ui/src`. The web dashboard, one directory over, wrote
`fontSize: 28`, `fontSize: 13`, `fontSize: 11` and used `opacity` as ink — with
every rule passing green. This is the defect `conformance.test.ts`'s own header
describes, recurring at the boundary it could not see, which is why the styling
checks live in `tests/architecture.test.ts` and root at the repository.

**`opacity` is not a muted colour**, and the distinction is the one worth
keeping. It fades the glyph *and* the ground beneath it, so a single value reads
differently on `ground` than on `surface`, and in dark it moves text toward the
background rather than away from it. `theme.textMuted` is a colour the theme
answers for. Fading a **whole control** is a different thing and stays legal —
`opacity: 0.45` is how four primitives render disabled, and `0.5` is the scrim.
Those dim a shape, not a word, so the check fires only where opacity sits beside
a `color` or a type step.

---

## 8b · One way to move, and one way to touch

**Everything that moves is Reanimated; everything that is dragged is
gesture-handler.** React Native's own `Animated` and `PanResponder` are not
used, and `tests/architecture.test.ts` refuses an import of `Animated`,
`PanResponder` or `Easing` from `react-native` anywhere in `packages/ui`,
`packages/client` or an app.

The reason is the thread. `Animated` runs on the JS thread (its "native
driver" covers transforms and opacity, and nothing else, and Expo Go does not
ship the module that would make it real). A list rendering, a store publishing,
a JSON parse — any of them lands between two frames of a drag and the button
lags the finger, or a press answers late. Reanimated's shared values and
gesture-handler's gesture callbacks are worklets on the UI thread: the drag
that places the floating button never crosses to JS until the drop, which is a
device preference the JS side stores.

The second reason is that two vocabularies in one package is how the second
one arrives. Every `usePressScale`, `useDisclosureMotion`, pop and slide reads
the same tokens (`motion.*`, through `primitives/easing.ts`) and writes the
same kind of value. A component's motion is a `useAnimatedStyle`; a gesture is a
`GestureDetector`; the geometry a gesture needs is a `"worklet"`-marked
function in a plain `.ts` file the tests call directly. The browser runs the
same code on its main thread, which is what it has.

`GestureHandlerRootView` is the app's outermost view and the story
decorator's, for the same reason `ThemeProvider` is: a gesture outside it is
silently nothing.

Stepping discrete text on a beat is not motion — `ThinkingIndicator`'s dot
advances a string on a plain `setInterval` rather than tweening a rendered
value, and it is the one sanctioned `setInterval` in `packages/ui`;
`tests/architecture.test.ts` allowlists it by path so a second one is a
decision made in the open, not a precedent that spread because the first one
compiled.

## 9 · What this is not

It is **not** a rewrite. The moves are moves: the same files, in directories
that exist for them.

It is **not** a second app. `apps/web` is still the conditional fork of §14.6,
with its trigger unchanged — S02 or S25 missing 300 ms search or 800 ms paint
after one honest optimisation pass. This document makes that fork cheap; it does
not take it.

It is **not** a licence to abstract. Nothing here asks for a repository layer, a
service locator, or a generic `Resource<T>`. One `useQuery` replaces four copies
of the same twelve lines. That is a deletion, not a framework.

---

## Related

- `10-code-structure.md` — the module axis and the import-specifier rules
- `SPEC.md` §4.3, §14.6 — one codebase, and the stated trigger for two
- `design-system/12-build-order.md` — components before screens, same argument
- `tests/architecture.test.ts` — the enforcement
