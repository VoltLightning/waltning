# Issue Tracker

Where issues live for this repo. Skills that read or write issues —
`to-tickets`, `triage`, `to-spec` — read this file.

## Default: GitHub Issues

**On a fresh clone, issues are GitHub Issues**, via the `gh` CLI:

```sh
gh issue list --state open
gh issue create --title "…" --body "…" --label needs-triage
gh issue edit <n> --add-label ready-for-agent --remove-label needs-triage
```

This needs no setup beyond `gh auth login`, and it is what anyone who clones
this repository gets. Label vocabulary is in
[`triage-labels.md`](./triage-labels.md).

**Pull requests are not part of the triage queue.** External PRs would be a
second inbox, and there is no external traffic to justify one. If that changes,
say so here rather than assuming it.

## Local override

**If `docs/agents/issue-tracker.local.md` exists, read it instead of this
file.** It supersedes this one completely — not merged with it, not consulted
alongside it.

That file is gitignored. It is where a workflow that depends on tooling nobody
else has belongs: a private notes vault, a company tracker, anything behind a
login. Keeping it out of the repository is the point — the committed default
must stand alone, so that a clone with none of that tooling still works.

The same convention applies to the other files here: any
`docs/agents/<name>.local.md` supersedes `docs/agents/<name>.md`.

**If a local override exists, do not describe its contents in a commit message,
a pull request, an issue, or the wiki.** It is local because it is nobody
else's business, and the repository is public.

### Writing one

Copy the shape, not the content:

```markdown
# Issue Tracker (local)

Supersedes `issue-tracker.md`. Issues live in <where>.

## Finding it
<how to resolve the location — a command, never a hardcoded absolute path>

## Reading and writing
<the operations a skill needs: list, create, update, close>

## Triage
<how the five roles in triage-labels.md are applied here>
```

Two rules worth carrying into any override:

- **Resolve, don't hardcode.** An absolute path is specific to one machine and
  one account, and it goes stale silently.
- **If the tracker cannot be reached, stop and say so.** Do not fall back to
  the default in this file. An issue filed into the wrong tracker is worse than
  one not filed, because it looks like it was recorded.
