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

---

## 7 · What this is not

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
