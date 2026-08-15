# What this repository is

A self-hosted personal finance system for **one person's real five-year
ledger**, built specification-first. `SPEC.md` is the architecture, data model,
FX semantics, security, migration and tax layer; `docs/specification/` is the
interface — principles, design system, journeys, screens, the operation
registry, computations, and a defect register.

**Most of this repository is specification, not code.** What is built is the
data foundation: ten migrations, the schema, `money.ts`, the seed, the FX
backfill, and the Money Manager import tooling. There is no API and no app yet.
When a task sounds like application work, the artefact it produces is almost
always a specification change.

## Orientation

| Looking for | Read |
|---|---|
| Why a decision was made | `SPEC.md` — it records reasoning, not just outcomes, including what was rejected |
| What is known to be wrong | `docs/specification/defects.md` |
| What to build next, in order | `docs/specification/build-order.md` |
| How a screen or journey behaves | `docs/specification/screens/`, `flows/` |
| Whether a figure is computable offline | `docs/specification/computations.md` §0 — every figure is classed **F**, **R** or **S** |

## The two facts that change how you should work here

**It is a public repository about private finances.** Every real name, bank and
balance was replaced with a placeholder, and the mapping is deliberately not in
the repository. Structural facts — row counts, currency list, tax scheme — are
real and stay real.

**There is no CI.** That is a recorded decision, which makes the pre-commit hook
the only automated gate between an edit and history. `pnpm verify` is the same
check and takes about two seconds.
