# S33 · Settings · Models and providers

**Surface** both · **Journeys** J09 · **Frequency** rare
**Design** none
**Status** specified

---

## 1. Purpose

Which model serves which assist, whether that assist runs at all, what each is
costing, and whether swapping one made things better or worse.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| S30 Settings · system | *Models and providers* | S30 |
| S03 Agent | Model name in the session header | S03 |
| S02 Import | *Classified by …* in the review header | S02 |

## 3. Layout

### The vocabulary: assist, not surface

`models` was keyed by "surface", and that word is taken. Everywhere else in this
repo a surface is **web or mobile** — it is the word `architecture/11` uses for a
delivery mechanism, and the word this screen's own header uses two lines above.
One word for two concepts is how a table column ends up meaning whichever one
the reader arrived with.

**The five places a model may be involved are `assists`:**

| Assist | Shape (§11.4) | Degrades to |
|---|---|---|
| `quick_add` | Agentic loop, read tools | The ordinary quick-add form |
| `agent` | Agentic loop, read + write | Nothing — S03 says the agent is off |
| `classify` | Deterministic pipeline | Rules only; unmatched rows stay uncategorised |
| `receipt` | Pipeline, one pass | Manual entry from the image |
| `voice` | One pass | Nothing — S08 says voice is off |

`models.assist` replaces `models.surface`; `set_surface_model` becomes
`set_assist_model`; `run_fixture_score(surface)` becomes
`run_fixture_score(assist)`. **This rename is free right now and will not stay
free** — `models` does not yet exist in `packages/db/src/schema.ts`, so there is
no migration to write and no data to move. It is the last moment this costs
nothing.

**Five assists, not four.** §11.4's table has always named five; this screen
configured four. `quick_add` is a conversational loop with read tools and was the
one that fell out — the omission was silent because nothing cross-checks the two
lists. §11.4 is the source; this screen follows it.

**Five settings, not one.** §11.4's argument is that the choice is positional:
the agent is a conversational loop and wants a strong model; the classifier is a
deterministic pipeline over hundreds of rows and wants a cheap one with a stable
cached prefix; voice has a ten-second budget; receipts are queued and can afford
latency. A single global model setting would be the wrong shape — and so would a
single global on/off, which is why the master switch below **overrides** rather
than replaces.

### Web — ≥1024px

```
Models and providers

  Assists                                                        ● on
  ─────────────────────────────────────────────────────────────────────────────
  Turning this off stops every model call. Your per-assist settings are kept.

  Assist         Provider      Model                    Effort   30-day spend
  ─────────────────────────────────────────────────────────────────────────────
  quick add  ●   openai        <configured>             low      $ 0,31   ▸
  agent      ●   —             —                        —        $ 0,00   ▸
  classify   ●   openrouter    <configured>             medium   $ 1,88   ▸
  receipt    ○   openai        <configured>             medium   $ 0,94   ▸
  voice      ●   openai        <configured>             low      $ 0,21   ▸

  Providers
  ─────────────────────────────────────────────────────────────────────────────
  openrouter     key set ✓   last used 14:02          Test
  openai         key set ✓   last used 09:41          Test
  anthropic      no key                                Test
  gemini         no key                                Test

  ⓘ  Keys live in the Pi's environment (§5.3). This screen shows whether one is
     present and working — never the value, and never a field to paste one into.
```

`agent` above is **on with no provider**. That is the honest default state, not
an error — see §6.

### Mobile — 390pt

The web table is five columns wide and does not survive 390pt. Same data, one
level deeper: the list carries what you scan for — is it on, what is it costing,
is anything wrong — and the detail carries what you change.

```
  ←  Models and providers

  ┌───────────────────────────────────────┐
  │  Assists                        ● on  │
  │  Off stops every model call.          │
  └───────────────────────────────────────┘

  quick add                       on  ▸
  openai · <configured> · $ 0,31

  agent                           on  ▸
  ⚠ no provider chosen

  classify                        on  ▸
  openrouter · <configured> · $ 1,88

  receipt                        off  ▸
  openai · <configured> · $ 0,94

  voice                           on  ▸
  openai · <configured> · $ 0,21

  Providers                            ▸
  2 of 4 have a key
```

Tapping an assist opens its detail — the same fields the web row expands to, and
the same per-row save (§7). Providers is its own screen on mobile, carrying the
key-presence list and `Test`.

**Why this screen is on mobile at all.** It was specified web-only, which put the
master switch — the one control whose entire value is being reachable when you
want it *now* — behind a desktop browser. The rest of the screen comes along
because a settings screen that can only turn things off, and never tell you what
you turned off, is worse than not having it.

## 4. Components

| Component | Use |
|---|---|
| `Table` | The five assists; row expands to the full config (web) |
| `ListRow` | The five assists (mobile); tap opens the detail |
| `Switch` | The master switch, and one per assist |
| `Amount` | Spend, per P1 — it is money |
| `Tag` | `key set` · `no key` · `unreachable` |
| `Select` | Provider, and model — both populated from `list_models` (§7) |
| `SegmentControl` | Effort |
| `Banner(warn)` | The ambient state: an assist whose provider has no key, or no provider at all |
| `FieldError` | Per-field, on save. Not ambient — see §6 |
| `ComparisonTable` | Before and after a model swap (§5.6) |

## 5. Data

| Reads | Writes |
|---|---|
| `get_assists` — the five rows, the master switch, 30-day spend per assist, and each one's last fixture score | `set_assist_model(assist, provider, model_id, effort, max_tokens)` |
| `get_provider_status` — key presence and last-success timestamp per provider. **Presence, never the value** | `set_assist_enabled(assist, enabled)` |
| `list_models(provider)` — the provider's own catalogue, proxied by the API (§7) | `set_all_assists_enabled(enabled)` |
| | `test_provider(provider)` |
| | `run_fixture_score(assist)` |

Behind those reads: `models` (assist, enabled, provider, model_id, effort,
max_tokens), `settings.assists_enabled`, the `agent_tool_calls` spend rollup, and
the fixture scores from `07-test-strategy.md`.

**None of these five writes, and none of the three reads, existed in
`operations.md`** — this screen named them in its §5 and the registry had no
form of them. Added there in the same pass as this rewrite.

**Spend is per assist, never per feature.** §15's earlier wording said per
feature; because an assist may point at a different provider, per-feature totals
would not add up.

**`settings` does not exist yet.** No settings or config table is in
`schema.ts` — the master switch is its first row, and it arrives with the table.

## 6. States

| State | Treatment |
|---|---|
| Loading | Skeleton rows; the table shape is known |
| Populated | Five rows, always — an assist is never absent, only off or unconfigured |
| Empty | n/a. Five rows ship whether or not anything is configured |
| **On, no provider** | The fresh-install default. `Banner(warn)`, row shows `—`. **Not an error** — also the permanent state on a backendless phone (`architecture/14` §14.1): no Pi means no environment for a key to live in, so every assist sits here and degrades to its fallback (§3's table) |
| **On, provider has no key** | `Banner(warn)` naming the assist and the provider. Degrades exactly as offline does |
| **Off** | Row still listed, marked off, **spend still shown**. Its settings are intact |
| **Master off** | Real values throughout, one banner over the table. Per-assist switches keep their positions |
| Error | Provider unreachable → `Tag(unreachable)` on that provider; assists still listed |
| Offline | **Read-only from cache, and says so.** Changing a model while unable to reach the Pi would be a write with no way to validate it |
| Gated | Every write here is a config change — **never auto-eligible** (§11.2), and **never agent-visible** (§8) |

**Off is degraded behaviour with disabled presentation.** Turning `classify` off
does not break import: rules still run, and rows they do not match arrive
uncategorised for review. What changes is that S02's review header stops claiming
a model classified anything, because none did. An assist that silently kept
working while the screen said it was off would make this screen a lie; one that
took the whole feature down with it would make turning it off unaffordable.

**The master switch overrides; it does not clear.** Turning it off stops every
model call and leaves all five per-assist settings exactly where they were.
Turning it back on restores them. A master switch that wrote `false` into five
rows would be a switch you cannot undo, and the moment you most want it is the
moment you are least sure you will not want it back.

**A warning is ambient; an error happens on save.** These are different states
and the screen must not merge them:

- **`Banner(warn)`** describes the world as it is — this assist is on and cannot
  currently reach a model. It is information, it persists, and it blocks nothing.
- **`FieldError`** is the *result of an action*. You aimed `agent` at a provider
  with no key and pressed save; the save was refused and the provider field says
  why.

Merging them gives you a screen that is either shouting on first run or silent
when you break something.

## 7. Interaction

- **The unit of save is one assist.** A row is a form. Expanding `voice` and
  saving it validates `voice` — `agent` sitting misconfigured two rows up is not
  a reason you cannot change your voice budget, and after a key rotation you can
  repair assists one at a time and watch each come good rather than being forced
  into one big-bang edit at the worst possible moment.
- **Validation is two-layer, and the server is the one that decides.** The client
  validates before it submits so the common mistake never leaves the device; the
  server validates again and returns field errors at 422 (`architecture/12`).
  Client-side validation is a courtesy, not a guarantee — the agent, the outbox
  and any future client all reach the same operation.
- **You may not aim an assist at a provider with no key.** The save is refused
  with a field error on the provider. You may still *have* such a configuration —
  a key can be revoked after the fact, and this screen has to be able to show
  that rather than refuse to load.
- **Model choices come from the provider, not from us.** `list_models(provider)`
  calls the provider's own catalogue — every one of the four publishes one
  (`GET /v1/models` for OpenAI and Anthropic, `GET /v1beta/models` for Gemini,
  `GET /api/v1/models` for OpenRouter). Fetched live, cached briefly. **Nothing
  in this repo lists model names**, so nothing goes stale and a model published
  this morning is selectable this morning. The adapter normalises; OpenAI's
  catalogue needs filtering because it returns embeddings and speech models
  beside chat models, and that filter lives in the OpenAI adapter, which is the
  only place that knows it is needed.
- **Effort is a segment, not free text**, and its options come from the model.
  Anthropic's catalogue reports which effort levels each model supports;
  offering `high` on a model that has no such level is a setting that fails at
  call time instead of at choosing time.
- **Changing a model is a write with a diff**, like any other. It states the
  assist, both model ids, and the last fixture score — because that score is the
  only evidence the change is an improvement.
- **`Test` sends a fixed trivial prompt** and reports latency and success. It
  never sends ledger content: a connectivity check must not be the thing that
  leaks a payee.
- Expanding a row shows `max_tokens`, the cache-breakpoint setting, and the last
  ten calls with their latencies.

## 8. Rules this screen must obey

- **P1 — money.** Spend renders through `<Amount>`; it is real money and gets the
  same treatment as a transaction.
- **No key is ever displayed or entered here.** §5.3 puts keys in the Pi's
  environment, injected by Compose. This screen reports presence, not value. A
  paste field would be a second place a key lives, which is one too many. It
  follows that **there is no key field to put an error on** — a missing key is
  fixed by editing the Pi's environment and restarting, and this screen's job is
  to say so precisely.
- **Every write on this screen is `agentVisible: false`** (§11.0). The agent may
  not enable or disable an assist, and may not change its own model, provider,
  effort or token budget. Choosing whether it runs and choosing what it runs on
  are the same shape of decision: it can argue for a more capable model, and the
  approval card would arrive carrying its own framing of why it needs one. This
  is a narrower exclusion than it sounds — it is one screen, and everything on it
  is configuration of the agent rather than work done with it.
- **All model calls originate from the API** (§5.3). Nothing here implies the
  client talks to a provider — including `list_models`, which the API proxies.
  **A backendless phone has no API to proxy through**, so this is
  not a screen the phone loses — it is a screen that shows five assists stuck
  on `no provider`, same as fresh-install, with the same documented fallback
  for each (§3).
- **A model swap is not retroactive.** `import_rows.model_id` records which model
  answered (§9.4, C10); changing this screen never re-runs anything. Re-running is
  `reclassify`, which is a different operation with a different name.
- **A provider is configuration *and* an adapter** (§11.4). The earlier wording —
  "adding one is a row, not a code change" — was true of the row and false of
  everything else: a provider that no adapter can speak to is a string. The
  registry of adapters is the code change; which assist points at which is the
  row.

## 9. Open questions

1. ~~**Should an assist be allowed to point at a provider with no key?**~~
   **Decided, and this reverses the earlier answer. It may exist; it may not be
   saved.** The original reasoning was that refusing would make the ordinary
   setup order — configure the assist, then add the key — impossible. That order
   turned out not to be the ordinary one: keys live in the Pi's environment and
   arrive by editing `.env` and restarting, so the key is a deploy-time act that
   naturally precedes a runtime one. What the refusal must not do is prevent the
   screen from *displaying* such a state, because a key can be revoked long after
   it was configured. So: `Banner(warn)` for the state, `FieldError` on the
   attempt, and the two are never the same treatment.

2. ~~**Should this screen show a cost forecast?**~~ **Decided: no. Thirty-day
   actuals only.** A forecast on a single-user ledger with this volume would be
   extrapolating from a few dollars, and the number that changes behaviour is what
   you *did* spend after swapping a model. `ComparisonTable` covers the question a
   forecast pretends to answer, with evidence.

3. ~~**Does a fixture score belong on a settings screen?**~~ **Decided: yes, and
   it is the point.** §11.4 says the classifier stays a deterministic pipeline
   partly so it can be scored; a model swap with no score beside it is a change
   with no feedback, which is how quality drifts silently. Running a score is an
   explicit action here because it costs money.

4. ~~**Should assists ship on or off?**~~ **Decided: on, with no provider.** All
   five are enabled from a fresh install and none has a provider, so nothing
   calls out and nothing is hidden. The alternative — ship off — reads as safer
   and mostly moves the confusion: a system that does nothing because five
   switches are off looks identical to one that is broken. `provider: null` is
   the state that explains itself, and §7's save rule means you cannot leave the
   screen having configured something that cannot work.

5. ~~**Should an assist be able to use the provider's web search?**~~
   **Decided: no, and dropped rather than deferred.** It would have added a
   capability flag, a per-assist opt-in, and a direct conflict with §11.4's
   replayability guarantee for `classify` — a pipeline whose context includes
   live web results is not re-derivable from its recorded inputs, which is the
   one property that tier exists to have. If it ever returns it starts at §11.4,
   not on this screen.
