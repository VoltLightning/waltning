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

## Known: two trackers, and nothing reconciles them

**Carried deliberately. Read this before assuming either tracker is complete.**

`CONTRIBUTING.md` tells anyone outside to open a GitHub issue, and
`.github/ISSUE_TEMPLATE/` has three forms ready for them. So GitHub Issues is a
real front door, not a placeholder — while the maintainer's working queue is
whatever the local override points at. Nothing syncs the two, and nothing will.

Today that costs nothing: there is no external traffic, so the GitHub side is
empty and the override is the whole picture.

**The decision is forced the first time someone outside files an issue.** At
that moment there are two live inboxes, and the failure is quiet — work gets
planned against a queue that is missing whatever arrived in the other one.

Three ways out, none of them chosen yet:

| | |
|---|---|
| **Triage across, plan in one** | GitHub stays the inbox for outside; anything real is copied to the working queue as a card and the issue closed with a pointer. One planning surface, one manual step per external issue |
| **Drop the override** | Move to GitHub Issues outright. One tracker, no reconciliation, and the working queue becomes public — including the parts that are currently private for good reason |
| **Close the door** | Turn GitHub Issues off and say so in `CONTRIBUTING.md`. Honest, and gives up the only channel anyone outside has |

**Whichever is chosen, say so here and in `CONTRIBUTING.md` in the same
change.** A contributor told to open an issue that nobody reads is worse than
one told not to bother.

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
