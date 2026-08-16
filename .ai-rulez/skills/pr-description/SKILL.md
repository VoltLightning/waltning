---
name: pr-description
description: Write a PR description in this repo's fixed structure.
priority: high
---

# PR description

Fill `.github/PULL_REQUEST_TEMPLATE.md` — don't invent another shape:
**Summary · Why · What · How · Test plan · Evidence (opt) · References (opt)**.

- **Summary**: what's now true that wasn't. For someone deciding whether to
  read on.
- **Why**: the problem and what happens if left alone. Ages best, skipped most.
- **What**: concrete. Quote the false claim; give both the wrong and right
  figure.
- **How**: the approach **and what was rejected** — that's what stops the next
  person re-proposing it. If enforcement moved to a layer, name the layer.
- **Test plan**: repeatable steps. If it adds a check, say how you made it fail
  on purpose.

Rules: lead with the outcome; specifics over generalities; name what you didn't
do; no real names or amounts anywhere, including pasted output; length matches
the change. Before opening: `pnpm verify` passes and an adversarial review has
run (see `adversarial-review`).
