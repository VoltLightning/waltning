# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those
roles to what is actually applied in this repo's tracker.

| Label in mattpocock/skills | In our tracker    | Meaning                                 |
| -------------------------- | ----------------- | --------------------------------------- |
| `needs-triage`             | `needs-triage`    | Not yet evaluated                       |
| `needs-info`               | `needs-info`      | Waiting on an answer before it can move |
| `ready-for-agent`          | `ready-for-agent` | Fully specified, an agent can take it   |
| `ready-for-human`          | `ready-for-human` | Needs a person — judgement, or hardware |
| `wontfix`                  | `wontfix`         | Will not be actioned                    |

The defaults are kept, so each role's label string equals its name. When a skill
names a role — "apply the AFK-ready triage label" — apply the string from the
middle column, and remove the one it supersedes. An issue carries at most one of
the five.

**How they are applied depends on the tracker.** With the default GitHub
tracker they are labels (`gh issue edit <n> --add-label …`). A local override
may apply them differently; see [`issue-tracker.md`](./issue-tracker.md).

## `ready-for-agent` has a specific bar in this repo

Two conditions beyond "the description is clear":

- **It states an observable done condition** — a test that fails without the
  change, a command that succeeds after it. "The code is written" is not one.
- **It does not start at the screen.** A feature is built schema → registry
  operation → service → tRPC procedure → screen, and that order is a hard
  requirement. An issue that begins at the UI is not badly specified; it is
  scoped wrong, and handing it to an agent produces an interface promising a
  figure nothing computes.

## `ready-for-human` is not a lesser state

Some work genuinely cannot be delegated: anything needing physical hardware,
and anything needing figures only a person can obtain. Those are
`ready-for-human` permanently, not until someone writes a better description.

Do not re-triage them as agent work because they look mechanical. Typing in
balances by hand looks like the most automatable task on the list, and it is
the one thing an agent cannot do — it is also the input a verification gate
depends on, so guessing it produces a check that passes and proves nothing.
