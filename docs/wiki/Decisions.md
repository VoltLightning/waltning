# Decisions

The full stack table with a *why* against every row is `SPEC.md` §4.3, and it is
the authority. This page holds the ones that surprise people, the ones that were
refused, and the ones that were reached during the build rather than before it.

## Refusals

**No Turborepo or Nx.** Four packages and no CI — there is nothing to cache.

**No GraphQL.** One consumer. tRPC is strictly less machinery for the same
end-to-end types.

**No Kubernetes.** It is one Raspberry Pi.

**No Prisma.** Its engine binary is a liability on ARM. Drizzle produces SQL you
can read and migrations you can review, which matters when the migrations carry
triggers and grants.

**No logo CDN for service icons.** Fetching `netflix.com`'s logo at render time
tells a third party what you subscribe to, and breaks offline rendering. Icons
are bundled. Brands do occasionally get removed from the icon set for legal
reasons, so a contract test asserts every catalog slug still resolves — the
upgrade fails loudly rather than rendering blanks.

**No persisted client cache.** Persisting TanStack Query to disk is the standard
Expo pattern, and it would silently promote arbitrary server responses into the
encrypted container, breaking the enumerated tier list in §14.3.

**No `drizzle-kit push`, ever.** It cannot see triggers, views, grants or
generated columns — precisely the objects that carry the guarantees.

## No CI, and what that costs

Recorded in
[`architecture/07`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/architecture/07-test-strategy.md).
Four packages, one developer.

The consequence is the important part: **`.githooks/pre-commit` is the only
automated thing between an edit and history**, which raises its importance
rather than lowering it. It is installed by `git config core.hooksPath` from
`prepare`, so there is no hook-manager dependency to keep current, and it is
budgeted under two seconds so it is never worth skipping — a gate people skip is
not a gate.

It refuses key material and financial-data file types **even when force-added**,
sweeps the staged diff against a gitignored list of real terms, formats and
lints staged files without rewriting them, typechecks the whole program, and
runs the tests.

Two lessons are baked into it:

- The force-add check originally re-implemented a subset of `.gitignore` by
  hand, and the two drifted the day it was written. Asking `git check-ignore`
  instead inherits every present and future rule.
- That fix was itself broken. `git check-ignore` consults the index, and a
  force-added path is *tracked* — so ignore rules stop applying and it returns
  "not ignored" for exactly the files the guard exists to catch. `--no-index` is
  load-bearing; without it the entire section is a no-op that looks like a
  control.

## Biome, and why no named style guide

Airbnb's config last shipped in 2021 and caps at ESLint 8; Standard caps at 8
too. Neither installs against a modern toolchain without `--force`.

They died for a reason worth understanding: most of their rules were
*formatting* rules, and formatters made those obsolete. What replaced the style
guide is a division of labour — **the formatter owns formatting and you take its
defaults; the linter owns correctness only.** There is no modern equivalent of
"we follow Airbnb", and adopting one would be a 2021 answer to a 2021 problem.

Biome is one binary in place of five packages whose versions must agree, and it
is fast enough to sit inside a two-second gate that also runs on the Pi.

What this gives up is named rather than hidden: `eslint-plugin-drizzle`, whose
two rules catch an `update` or `delete` with no `WHERE` — a real hazard in a
ledger. The compensating controls are the operation registry and the period
guard trigger, and if it ever bites, adding ESLint for that one plugin is
contained.

## `unknown`, `any` and `never` are discouraged

`any` and non-null assertion are lint **errors** and fail the gate. Beyond that:
**type parameters before `unknown`, `any` or `never`.**

`unknown` as a placeholder is a design smell rather than a safe default. It
pushes a cast to every call site and discards the type the caller already had —
so it does not remove the risk, it relocates it to wherever the code is least
reviewed. Make it generic instead.

Legitimate uses exist and each is worth a comment: `catch` bindings, where the
language gives no choice; JSON off the wire; `unknown` in a *constraint*
position for a deliberately heterogeneous collection; `never` for exhaustiveness.

**A loose type at a seam is where contracts leak.** Concrete declarations are
usually fine — it is the generic collection that holds them where `unknown`
creeps in and validation quietly becomes skippable. Those seams are pinned with
compile-time assertions in `contract.types.ts`, and each assertion was broken
once on purpose to prove it fails.

## One codebase for iOS and web

Expo with React Native Web, one `expo-router` tree, rather than a React Native
app plus a separate React site. The reasoning and the friction points are in
[`platform-notes`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/design-system/11-platform-notes.md);
charts are the known rough edge, and treemap is the one component likely to need
a web-only path.

One trap that costs an afternoon: **files with platform variants must be
imported without an extension.** `./Button.tsx` silently ignores `Button.web.tsx`
and nothing errors. Everywhere else, explicit `.ts` specifiers.

Another: **install Expo packages with `expo install`, never npm latest.** SDK 57
wants React Native 0.86.2; pinning 0.87.0 breaks the web bundler with an error
that names a missing polyfill file rather than a version mismatch.

## Modules first, layers inside them

Not `controllers/`, `services/`, `models/` as three global folders. A change to
one feature would touch all three and read as three unrelated edits, and nothing
would stop feature A reaching into feature B.

Modules own their whole vertical slice, only `index.ts` is public, and no module
imports another — composition happens at the registry or in routes. A boundary
test enforces it, because a forbidden import is invisible in review and obvious
to a script.

Atomic design applies as a **scale inside a UI module**, not as three global
folders. A component moves to `packages/ui` when a *second* feature uses it —
not when it looks generic.

**No abstraction before the third use.** No repositories over Drizzle, no
generic helpers, no event bus, no managers.

## Provisional, and named as such

| Decision | Status |
|---|---|
| **Push notifications** | `expo-notifications` routes through Expo's push service — a third party in the path of a system whose whole argument is physical custody. Direct APNs keeps it first-party at the cost of an Apple key and more code. Decide before S30's push conditions ship |
| **Speech recognition** | Pending an on-device `en-*` spike on real hardware. If it works, `expo-speech-recognition`; if not, S08 voice capture stays online-only and the capture grammar carries offline entry |

## Package names and APIs move

§4.3 records **what was chosen and why**. The *why* is the part that survives a
version bump; verify the package against its current documentation when you add
it.
