# Domain Docs

How the engineering skills should consume this repo's domain documentation.

**This repo is specification-first, and the specification came before these
conventions.** The domain is defined in `SPEC.md` and `docs/specification/`,
and restating any of it elsewhere would create a second copy that drifts. That is the repo's own working
rule: nothing is duplicated; a rule lives in one place and everything else
references it.

## Before exploring, read these

- **`docs/specification/README.md`** — the map of where each part of the
  specification lives, and `SPEC.md` Appendix B for the vocabulary.
- **`docs/adr/`** — read the decision records that touch the area you are about
  to work in.
- Then follow the map into whichever of `SPEC.md` or `docs/specification/`
  actually answers your question.

If `docs/adr/` doesn't exist yet, **proceed silently**. Don't flag its absence
and don't propose creating it upfront — `/domain-modeling` creates records
lazily, when a decision is genuinely resolved.

## Layout

Single-context. One specification covers the whole system.

```
/
├── SPEC.md                          ← the system: data model, FX, security, tax
├── docs/
│   ├── TAXONOMY.md                  ← the category tree
│   ├── adr/                         ← decision records, created lazily
│   └── specification/               ← the interface
│       ├── README.md                ← the map
│       ├── operations.md            ← every write in the system
│       ├── computations.md          ← every derived figure
│       ├── architecture/01–10       ← containers … code structure
│       ├── flows/  screens/         ← 17 journeys, 32 screens
│       └── defects.md               ← what ten adversarial reviews found
└── docs/wiki/                       ← orientation, published to the GitHub wiki
```

This is a pnpm workspace with six packages, but it is **not** multi-context.
The packages are layers of one domain, not separate domains, and
`architecture/10` already documents how they depend on each other. A
`CONTEXT-MAP.md` with six per-package files would be six more documents to keep
true about a vocabulary that does not actually differ between them.

## Use the specification's vocabulary

When your output names a domain concept — an issue title, a refactor proposal,
a test name — use the term as the specification defines it. The glossary is
`SPEC.md` Appendix B, mirrored in `docs/wiki/Glossary.md`.

Two that are load-bearing and easy to paraphrase into something wrong:

- An **operation** is a named, validated, audited write in the registry. It is
  not "an endpoint" and not "a mutation".
- A figure's **F / R / S class** says where it may be computed. It is not a
  caching hint.

If the concept you need isn't defined anywhere, that is a signal — either you
are inventing language the project doesn't use, or there is a real gap worth
noting for `/domain-modeling`.

## Flag conflicts rather than overriding them

If your output contradicts an ADR, say so explicitly:

> _Contradicts ADR-0003 — but worth reopening because…_

The same applies to the specification itself, and it is stronger there:
**when code must diverge from the spec, the spec changes in the same pull
request.** Never silently. A specification that quietly stops describing the
system is worse than none, because the next person will trust it.

`docs/specification/defects.md` is where known-wrong things are already
tracked. Check it before reporting something as new.
