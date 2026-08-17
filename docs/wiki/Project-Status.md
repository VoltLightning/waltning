# Project Status

**The specification is complete. The build is early.** Those are two different
things, and this page exists so the first does not get mistaken for the second.

## Specified

Seventeen journeys and thirty-two screens, each written against its template
with no section missing. All **75** numbered open questions across screens and
flows are closed, with each decision recorded next to the question it answers
rather than collected elsewhere, so the reasoning stays beside the thing it
governs. The design system's own eleven are closed too.

Three mechanical audits back that rather than resting on it: every screen and
flow conforms to its template, every operation a screen references exists in the
registry, and no `TODO`, `TBD` or unresolved marker remains outside the
templates. Those audits run as tests, because a documented check that depends on
someone remembering is not a check.

Depth is **declared, not uniform**. Every screen gets all nine sections; prose
depth is tiered, and a tier-3 screen is not a stub — it is a screen whose open
questions are worth more than its prose.

Ten adversarial reviews produced 101 findings, tracked with status in
[`defects.md`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/defects.md).

## Built

Foundations are in place: the test harness, the operation registry mechanism,
and the non-superuser application role. The registry is proven end to end —
declaration, validation, audit, transaction, idempotent replay, and per-field
gating, each with tests that were broken on purpose before being trusted.

The work is organised into fifteen lanes of **kinds of work**, not a sequence;
[`build-order.md`](https://github.com/VoltLightning/waltning/blob/main/docs/specification/build-order.md)
carries the ordering and the phase reasoning, including the three things
deliberately *not* built.

## Known gaps — carried, not forgotten

True at the time of writing. This list exists so that none of them becomes
folklore.

- **Two operations exist of about 110.** The mechanism is proven; the surface is
  not.
- **The gate decides, but nothing calls it yet.** The decision function and its
  declaration check are tested; the agent runtime and the approval card that
  consume them do not exist.
- **`EXPORT_DATABASE_URL` is declared and never read** — the export path is not
  built.
- **`packages/ui` is declared and imported by nothing.** Zero components; it
  typechecks an empty barrel.
- **`pnpm dev` runs the API only**, not the app.
- **`BUILD_SHA` has no injection path**, so the health endpoint always reports
  `dev`. It needs a Dockerfile that does not exist yet.
- **The FX carry and DST checks are not in the suite.** They encode real
  reasoning and are still not executable as tests. `money.ts` itself is covered.

## Not yet decided

**On-device speech recognition** needs minutes on real hardware. It decides
whether voice capture works offline; nothing earlier depends on it, so the
registry, the API, the screens and the sync all proceed without knowing.

**Push notifications** route through a third party under the current choice, in
a system whose whole argument is physical custody. To be decided before push
conditions ship — see [[Decisions]].

## How to read this against the repository

The specification describes the finished system in the present tense, because
that is what a specification is for. **This page is where you find out what
actually runs.** When the two disagree, this page is wrong and should be fixed —
the repository is the record.
