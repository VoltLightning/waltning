# State matrix

> **Coverage: 13 of 30 screens are listed here.** The other 17 each specify all
> six states in their own §6; what this table catches is the screens whose state
> handling is *non-obvious*. Stating both numbers because §8.2 names the
> alternative failure exactly — *"silent partial success is how a month goes
> half-imported and nobody notices"* — and a coverage check that presents as
> complete while covering 43% is that failure applied to itself.
>
> S04, S14, S12 and S30 belong here on their own merits and are being added:
> S04 is the mobile landing surface, S14 can cost real money offline, S12 is the
> most staleness-sensitive screen in the app, and S30 is where the outbox lives.


Every screen specifies **all six** states — loading, populated, empty, error,
offline, gated (`README.md`, working rule 2). *Populated* is the one every
screen has by construction, so this matrix tracks the other five, plus conflict
behaviour where a screen can write.

The vocabulary itself — the three empty variants, the three error variants, the
offline rule, and the recovery patterns — lives in
[`08-states-and-recovery.md`](08-states-and-recovery.md). This is the coverage
check against it.

*Gated* is `n/a` almost everywhere by design: the system is single-user (§3), so
there are no permissions to fail. It is listed rather than dropped because "no
gate exists here" is a decision, and an undocumented one reads as an oversight.

| Screen | Loading | Empty | Error | Offline | Gated | Conflict |
|---|---|---|---|---|---|---|
| Dashboard | skeleton tiles | `first-run` | rate sync failed | ✅ per-widget cache + age; never a zero (§8.3) | n/a | n/a |
| Import review | parsing progress | ✅ queue clear | `partial` — states both counts | queue locally | n/a | n/a |
| Agent | ✅ `ThinkingIndicator`, 3 phases (§8.5) | no sessions | model failed · ✅ `RefusalCard` (§8.7) | disabled, stated | auto-mode grant (§11.2) | n/a |
| Quick add | — | — | ✅ four states, `gaps.dc.html` G3 | ✅ outbox | n/a | **setting-driven; *ask* is unbuilt** |
| Receipt | ✅ extracting 2.4 s | queue empty | ✅ `terminal`, image retained | ✅ queue | n/a | n/a |
| Transactions list | skeleton rows | ✅ `filtered` names the excluding filter | query failed | cached + age | n/a | n/a |
| Calendar | skeleton grid | ✅ `range` offers nearest period | query failed | cached + age | n/a | n/a |
| Counterparty editor | — | — | ✅ `MatchWarning` (§8.4) | outbox | n/a | n/a |
| Recurring | list skeleton | no rules | ✅ `RuleHealthTag` surfaces silent failure | cached | n/a | n/a |
| Accounts | skeleton rows | ✅ `first-run` on the screen itself | save failed | cached | n/a | n/a |
| Reports | skeleton | ✅ `range` + `filtered`, distinguished | query failed | stale marker | n/a | n/a |
| Export | building | ✅ zero rows still builds (§8.7) | ✅ names the sheet; no partial tax workbook | disabled | scheme not set | n/a |
| System (S30) | independent per check | ✅ `never-drilled` | per check, not per page | **no cache — absence of contact is the finding** | drill confirms | n/a |

## What remains

**One row, and it is a real one.** Quick add's conflict behaviour has no
screen. `architecture/14` §14.2 replaced silent last-write-wins with a setting —
*latest applied wins* or *ask* — and made the tax-sensitive set **always** ask,
so what is missing is no longer a decision to live with but a component to
build: one divergence, two values, a choice. Under *latest applied wins* the
overwrite is still silent and still audited, which is the acceptable half; under
*ask*, and for every tax-sensitive field regardless of the setting, there is
currently nothing to show. Detection is sound already — the write carries the
`version` it last read, and the client-generated UUID stops a retry becoming a
duplicate.

Everything else in this table was `gap` before the flow pass. The fourteen are
enumerated in §8.6.
