---
priority: medium
---

# Agent skills

Three conventions the installed engineering skills read. Each is one line here
because the wrong default is expensive; the detail is in the file named.

**Any `docs/agents/<name>.local.md` supersedes `docs/agents/<name>.md`
entirely** — check for one before acting on the committed default. Overrides
are gitignored, personal, and never described in a commit, PR or the wiki.

- **Issue tracker** — GitHub Issues via `gh` by default.
  `docs/agents/issue-tracker.md`
- **Triage labels** — the five defaults: `needs-triage`, `needs-info`,
  `ready-for-agent`, `ready-for-human`, `wontfix`.
  `docs/agents/triage-labels.md`
- **Domain docs** — single-context. `CONTEXT.md` routes into `SPEC.md` and
  `docs/specification/` rather than restating them; ADRs go in `docs/adr/`,
  written lazily. `docs/agents/domain.md`
