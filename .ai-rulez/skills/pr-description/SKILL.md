---
name: pr-description
description: Write a pull request description in this repository's standard structure — Summary, Why, What, How, Test plan, and optional Evidence and References.
priority: high
---

# Writing a pull request description

The structure is fixed and lives in `.github/PULL_REQUEST_TEMPLATE.md`. Fill it;
do not invent a different shape.

```
## Summary        one or two sentences
## Why            why this needs to exist
## What           what is being fixed or added
## How            the approach, and what was rejected
## Test plan      how you know it works
## Evidence       optional
## References     optional
```

## What each section is for

**Summary** — what changed, and what is now true that was not before. Written
for someone deciding whether to read the rest. Not a restatement of the title.

**Why** — the problem, and what happens if it is left alone. This is the section
that ages best and the one most often skipped. If it came from an issue or a
review finding, name it.

**What** — concrete. If a stated guarantee was false, quote it. If a figure was
wrong, give both values. "Fixed FX handling" says nothing; "the margin was
defined twice, in pivot and in destination currency, and the two were mixed in
one total" says what happened.

**How** — the approach, **and what was considered and rejected.** The rejected
options are frequently the most useful part, because they stop the next person
proposing them again. If enforcement moved to a new layer — constraint, trigger,
role privilege, type, registry validation — name the layer and why that one.

**Test plan** — steps someone else could repeat. If the change adds a check,
**say how you made it fail on purpose**; a gate never seen to fail is not a
gate. Verification by execution counts, verification by reading does not.

**Evidence** — optional. Command output, before-and-after figures, timings,
query results. Redact first.

**References** — optional. Issues, `SPEC.md` sections, defect IDs, prior PRs.

## How to write it

**Lead with the outcome.** First sentence answers "what happened", not "here is
some background".

**Be specific over general.** Numbers, section references, quoted claims. This
repository's own history is the argument: the useful findings all carried
concrete values, and the vague ones went nowhere.

**Say what you did not do.** Known gaps, deliberate omissions, things left for a
follow-up. A description that implies more completeness than exists costs the
reviewer their trust in all of it.

**Never include private data.** No real names, amounts, payees, accounts or
institutions — including in pasted output. Placeholders throughout.

**Match the length to the change.** A one-line fix gets one-line sections. A
design decision does not.

## Before opening

- `pnpm verify` passes.
- Every claim in the description is one you actually checked.
- A review has been run against the change — reviews here are adversarial by
  default. See the `adversarial-review` skill, and fold anything it confirms
  into the change or into **What** as a known gap.
