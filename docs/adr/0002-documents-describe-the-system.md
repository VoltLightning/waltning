# Documents describe the system, not their own history

**Status:** accepted · 2026-08-22

The specification states what is true now. When the design changes, the document
is **rewritten whole** rather than annotated with what it used to say — no "was
X, now Y", no "an earlier draft claimed", no section reconciling this file
against a previous version of another one. The change record lives in git, in
the commit and pull request that made the change, and in the task that proposed
it.

Two files here are **records rather than descriptions**, and keep their history
because it is their content: `docs/specification/defects.md`, where an entry's
`Open`/`Fixed` status is the point, and `docs/adr/` itself, where a decision
carries a date and can be superseded. An ADR stripped of its status is not an
ADR.

A rejected **alternative** is not history. Knowing that SQLite everywhere was
considered, and what it costs, is part of understanding the system's shape — see
`0001`. The line is whether a passage argues a design or recounts its own
drafting.

## Why the distinction is worth a decision

A survey of the 105 markdown files found **90 passages narrating the
specification's own editorial history**, across 29 files. That is a small
fraction of the prose and it had already started to rot: `docs/wiki/The-Operation-Registry.md`
says `operations.md` ends with *two* contradictions, and `operations.md` says
*three*. The changelog had drifted out of sync with the changelog.

That is the whole argument. Prose describing the present is checked every time
someone reads it against the thing it describes. Prose describing the past is
checked by nobody, ages silently, and still costs a reader the same attention.

The alternative — leaving it, on the grounds that the reasoning is genuinely
useful — fails on where the reasoning lands. In roughly forty of the ninety, the
argument was carried *by* the narration: a trap was taught by recounting having
fallen into it. Those keep the trap and drop the fall. "These are two properties,
routinely conflated, and collapsing them costs the following" says everything
that "an earlier draft collapsed them and five reviews took it apart" says,
without dating itself.

## Consequences

**Sequence leaves the specification.** `docs/specification/build-order.md` was a
phase table reconciling two earlier plans; it is deleted, and the board carries
the order. Its two durable rules are worth restating wherever work is sequenced:
*order by irreversibility, not by size* — a wrong reading of the export costs
five years of history and is found months later, where a wrong empty state costs
an afternoon — and *order by what a delay actually costs*, since a tail with no
risk sequences itself and a head that is entirely risk **is** the plan.

The former `SPEC.md` §16 phase table had the same property and was removed in a
follow-up change.

**The numbered delivery vocabulary is removed.** The glossary defined the phone
alone, a backend, and the web dashboard as a numbered sequence, which is a plan
in a glossary and ambiguous besides now that the phone is two platforms. Each
use is replaced by the precondition it stood for: "with no backend", "once a
server exists". Those stay true whatever order things arrive in, which the
numbers do not.

**There is no test.** This repository's rule is that a rule without a test is not
a rule, and this is the exception, argued rather than overlooked. What makes a
sentence an offender is *whose* history it narrates, which no pattern can see:
`no longer` matches both "correctness no longer depends on every future query
being right" and "the ECB delisted RUB in 2022" — one a statement about the
system, one a fact about the world, and 24 such legitimate uses against the 90
real ones. A checker would be silenced by rephrasing rather than by fixing, and
prose written to slip past a regex is worse than the prose it replaced.
