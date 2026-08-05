# State matrix

Every screen needs all five. Only the import queue has an empty state today.

| Screen | Loading | Empty | Error | Offline | Conflict |
|---|---|---|---|---|---|
| Dashboard | skeleton tiles | first run, no accounts | rate sync failed | **gap** — says nothing when the Pi is unreachable | n/a |
| Import review | parsing progress | ✅ queue clear | parser rejected file | queue locally | n/a |
| Agent | **gap** — no streaming or thinking state | no sessions | model failed / refusal | disabled, stated | n/a |
| Quick add | — | — | **gap** — speech not understood, no network, low confidence, duplicate on save | ✅ outbox | last-write-wins, unsurfaced |
| Receipt | ✅ extracting 2.4s | queue empty | **gap** — unreadable photo | ✅ queue | n/a |
| Reports | skeleton | month with no data | query failed | stale marker | n/a |
| Export | building | nothing in range | build failed | disabled | n/a |

**The Quick-add error states are the single largest gap** — it is the screen
used daily, and the only one where a machine fills fields.
