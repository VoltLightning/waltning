# Decisions

The full table, with a reason against every row, is `SPEC.md` §4.3 and it is the
authority. This page holds the ones that surprise people, the ones that were
refused, and the ones reached during the build rather than before it.

## Refusals

**No monorepo build tool** (Turborepo, Nx). Those exist to cache work across
many packages and many CI runs. There are four packages here and no CI — there
is nothing to cache.

**No GraphQL.** It solves the problem of many different clients each wanting a
different shape of data. There is one client. tRPC gives the same end-to-end
types with far less machinery.

**No Kubernetes.** It is one Raspberry Pi.

**No Prisma.** Its query engine ships as a compiled binary, which is a liability
on ARM hardware. Drizzle produces SQL you can read and migrations you can
review — which matters when the migrations carry triggers and permissions.

**No logo service for subscription icons.** Fetching Netflix's logo from a CDN
at render time tells a third party that you pay for Netflix, and breaks when
you are offline. Icons are bundled with the app instead. Brands do occasionally
get removed from icon sets for legal reasons, so a test checks every icon in the
catalogue still resolves — an upgrade that drops one fails loudly instead of
rendering blanks.

**No `.json` translation files, and no Lingui.** JSON cannot be a type, so a
language missing a key is a blank label at run time instead of a compile error.
Lingui's macro would have removed key-naming entirely and was rejected on build
topology: `packages/ui` is bundled by Metro *and* by Vite, so a macro is two
pipelines to keep in step and a test suite that sees un-expanded macro calls
when they drift. i18next needs no build step.

**No saving the client's data cache to disk.** Storing it is the standard
pattern for this stack, and it would quietly copy arbitrary server responses
into the phone's encrypted storage — breaking the explicit list of what is
allowed to live there.

**Never `drizzle-kit push`.** It compares your schema file to the database and
applies the difference, but it cannot see triggers, views, permissions or
generated columns. Those are precisely the objects carrying the guarantees, so
it would report success while removing them.

## No CI, and what that costs

Recorded in
[`architecture/07`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/architecture/07-test-strategy.md).
Four packages, one developer, no automated build running on push.

The consequence is the important part. **The pre-commit hook is the only
automated thing between an edit and the project's history**, which raises its
importance rather than lowering it. It is installed by pointing git's hooks
directory at a folder in the repository, so there is no hook-manager dependency
to keep current, and it is kept under two seconds so it is never worth skipping.
A gate people skip is not a gate.

Two lessons are baked into it, and both are the same shape:

**It asks git what is ignored instead of guessing.** The check for "files
someone force-added past the ignore rules" originally re-implemented a subset of
those rules by hand. The two copies drifted the day it was written, and several
kinds of sensitive file sailed straight through. Asking git directly inherits
every present and future rule.

**That fix was itself broken.** `git check-ignore` consults the index, and a
force-added file is *already tracked* — so ignore rules stop applying to it, and
the command cheerfully returns "not ignored" for exactly the files the check
exists to catch. One flag, `--no-index`, is load-bearing. Without it the entire
section was a no-op that looked like a control, and only re-running the original
attack found it.

## One tool for formatting and linting

**Biome**, replacing Prettier, ESLint and three companion packages whose
versions all have to agree with each other.

### Why no named style guide

Airbnb's config last shipped in 2021 and supports up to ESLint 8; Standard's
caps at 8 as well. The current ESLint is 10. Neither installs against a modern
toolchain without forcing it.

They died for a reason worth understanding. Most of their rules were
**formatting** rules, and automatic formatters made those obsolete. What
replaced the style guide is a division of labour:

> **The formatter owns formatting, and you take its defaults.**
> **The linter owns correctness, and nothing else.**

There is no modern equivalent of "we follow Airbnb". Adopting one would be a
2021 answer to a 2021 problem.

Speed mattered too: this runs inside a two-second commit gate, and again on the
Pi before cutover.

**What this gives up is named rather than hidden.** There is an ESLint plugin
whose two rules catch an `UPDATE` or `DELETE` with no `WHERE` clause — a real
hazard in a ledger. The compensating controls are that every write goes through
the registry and that a database trigger blocks edits to already-filed rows. If
it ever bites, adding ESLint back for that one plugin is contained: Biome keeps
formatting, ESLint lints.

## `unknown`, `any` and `never` are discouraged

`any` and the non-null assertion `!` are **errors** that fail the gate. Beyond
that, the rule is: **reach for a type parameter before reaching for `unknown`,
`any` or `never`.**

Using `unknown` as a placeholder looks like the safe choice and is not. It does
not remove the risk — it moves it. The caller had a real type; `unknown`
discards it and forces a cast at every call site, which is to say it relocates
the danger to wherever the code is least reviewed. A type parameter keeps the
caller's type and lets the compiler carry it through.

Legitimate uses exist, and each is worth a comment explaining itself: catching
an error, where the language gives no choice; JSON arriving from outside; a
deliberately mixed collection where `unknown` appears as a *constraint*; and
`never` to prove a switch handled every case.

**Loose types leak at the seams.** The individual declarations are usually fine.
It is the generic container holding them where `unknown` creeps in and
validation quietly becomes optional. Those seams are pinned with
compile-time assertions in a dedicated file, and each assertion was broken once
on purpose to confirm it fails.

## One codebase for iOS and web

Expo with React Native Web and a single file-based route tree, rather than a
React Native app plus a separate React website. The reasoning and the friction
points are in
[`platform-notes`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/design-system/11-platform-notes.md);
charts are the known rough edge, and one chart type will probably need a
web-only version.

Two traps that each cost an afternoon:

**Files with platform-specific versions must be imported without an extension.**
Writing `./Button.tsx` silently ignores `Button.web.tsx`, and nothing errors —
you just get the wrong component on the web. Everywhere else, extensions are
explicit.

**Install Expo packages with `expo install`, not the latest from npm.** The SDK
pins a specific React Native version. Installing a newer one breaks the web
bundler with an error naming a missing internal file, which points nowhere near
the actual cause.

## Features first, layers inside them

Not global `controllers/`, `services/`, `models/` folders. One change would
touch all three and read as three unrelated edits, and nothing would stop one
feature reaching into another's internals.

Each feature owns its whole vertical slice, only its entry file is public, and
no feature imports another — they are composed at the registry or in the route
tree. A test enforces it, because a forbidden import is easy to miss in review
and trivial for a script to find.

Atomic design — atoms, molecules, organisms — is a **scale inside one feature**,
not three global folders. A component moves to the shared package when a
*second* feature uses it, not when it looks reusable.

**No abstraction before the third use.** Two similar things are a coincidence.

## Provisional, and named as such

| Decision | Status |
|---|---|
| **Push notifications** | The standard Expo route sends notifications through Expo's own service — a third party in the path of a system whose whole argument is that you hold your own data. Talking to Apple directly keeps it first-party, at the cost of a signing key and more code. Decide before push ships |
| **Speech recognition** | Waiting on a test with real hardware. If on-device recognition works, voice capture works offline; if not, it stays online-only and the typed capture grammar covers the offline case |

## Package names and APIs move

§4.3 records **what was chosen and why**. The *why* is the part that survives a
version bump — check the package against its current documentation when you add
it.

## Every word comes from a catalogue

Recorded in
[ADR 0003](https://github.com/VoltLightning/waltning/blob/main/docs/adr/0003-strings-live-in-a-typed-catalogue.md)
and enforced by `tests/architecture.test.ts`. A string literal in a component
fails the gate, the same way a hardcoded colour does — and for the same reason,
which is that neither looks wrong. A hardcoded label renders, is legible, and is
only wrong to a reader who never sees this repository.

The timing is the argument. Localising the six screens that existed cost an
afternoon; forty more are on the board. Every string written before the rule is
one to find later, and late is when it is found by someone who does not read the
language.

The English catalogue **is the type**: a language missing a key does not
compile. Two tests cover what the type cannot see — a key that is present and
empty, and a placeholder renamed inside a translated sentence.

**Polish is the second language, and not arbitrarily.** It is the language of
~96% of imported statement text, the currency most of this ledger is in, and it
has **four plural categories where English has two** — a second language sharing
English's grammar would have proved the wiring and none of the hard parts.
Hermes ships no `Intl.PluralRules`, so the device gets a polyfill.

One thing does **not** follow the language: money's group separator stays
U+00A0 everywhere. Only the decimal mark moves, so a złoty balance reads
`12 480,20`. `Intl.NumberFormat` is deliberately unused for figures — it would
take the separator with it, and Hermes formats differently on Android and iOS.
