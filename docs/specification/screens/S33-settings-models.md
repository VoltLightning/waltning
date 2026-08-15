# S33 · Settings · Models and providers

**Surface** web · **Journeys** J09 · **Frequency** rare
**Design** none
**Status** specified

---

## 1. Purpose

Which model serves which surface, what each is costing, and whether swapping one
made things better or worse.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| S30 Settings · system | *Models and providers* | S30 |
| S03 Agent | Model name in the session header | S03 |
| S02 Import | *Classified by …* in the review header | S02 |

## 3. Layout

`models` is a table of four rows — one per surface — and it has never had a
screen, despite §11.4 defining the schema and §5.3 defining where the keys live.
Spend appeared on S30; configuration appeared nowhere.

```
Models and providers

  Surface        Provider      Model                    Effort   30-day spend
  ─────────────────────────────────────────────────────────────────────────────
  agent          openrouter    <configured>             high     $ 4,12   ▸
  classify       openrouter    <configured>             medium   $ 1,88   ▸
  receipt        openai        <configured>             medium   $ 0,94   ▸
  voice          openai        <configured>             low      $ 0,21   ▸

  Providers
  ─────────────────────────────────────────────────────────────────────────────
  openrouter     key set ✓   last used 14:02          Test
  openai         key set ✓   last used 09:41          Test
  anthropic      no key                                Test

  ⓘ  Keys live in the Pi's environment (§5.3). This screen shows whether one is
     present and working — never the value, and never a field to paste one into.
```

**Four surfaces, not one setting.** §11.4's whole argument is that the choice is
positional: the agent is a conversational loop and wants a strong model; the
classifier is a deterministic pipeline over hundreds of rows and wants a cheap
one with a stable cached prefix; voice has a ten-second budget; receipts are
queued and can afford latency. A single global model setting would be the wrong
shape.

## 4. Components

| Component | Use |
|---|---|
| `Table` | The four surfaces; row expands to the full config |
| `Amount` | Spend, per P1 — it is money |
| `Tag` | `key set` · `no key` · `unreachable` |
| `SegmentControl` | Effort — low · medium · high |
| `Banner(warn)` | A surface configured with a provider that has no key |
| `ComparisonTable` | Before and after a model swap (§5.6) |

## 5. Data

| Reads | Writes |
|---|---|
| `models` — surface, provider, model_id, effort, max_tokens | `set_surface_model(surface, provider, model_id, effort)` |
| Provider key presence and last-success timestamp | `test_provider(provider)` |
| `agent_tool_calls` spend rolled up per surface, 30 days | — |
| Fixture score per surface, last run (`07-test-strategy.md`) | `run_fixture_score(surface)` |

**Spend is per surface, never per feature.** §15's earlier wording said per
feature; because a surface may point at a different provider, per-feature totals
would not add up.

## 6. States

| State | Treatment |
|---|---|
| Loading | Skeleton rows; the table shape is known |
| Populated | Four rows, always — a surface is never absent, only unconfigured |
| Empty | n/a. Defaults ship configured |
| Error | Provider unreachable → `Tag(unreachable)` on that provider, surfaces still listed |
| Offline | **Read-only from cache, and says so.** Changing a model while unable to reach the Pi would be a write with no way to validate it |
| Gated | Every write is a config change — **never auto-eligible** (§11.2) |

## 7. Interaction

- **Changing a model is a write with a diff**, like any other. It states the
  surface, both model ids, and the last fixture score — because that score is the
  only evidence the change is an improvement.
- **`Test` sends a fixed trivial prompt** and reports latency and success. It
  never sends ledger content: a connectivity check must not be the thing that
  leaks a payee.
- **Effort is a segment, not free text.** §11.4 uses three levels and the
  registry validates them.
- Expanding a row shows `max_tokens`, the cache-breakpoint setting, and the last
  ten calls with their latencies.

## 8. Rules this screen must obey

- **P1 — money.** Spend renders through `<Amount>`; it is real money and gets the
  same treatment as a transaction.
- **No key is ever displayed or entered here.** §5.3 puts keys in the Pi's
  environment, injected by Compose. This screen reports presence, not value. A
  paste field would be a second place a key lives, which is one too many.
- **All model calls originate from the API** (§5.3). Nothing here implies the
  client talks to a provider.
- **A model swap is not retroactive.** `import_rows.model_id` records which model
  answered (§9.4, C10); changing this screen never re-runs anything. Re-running is
  `reclassify`, which is a different operation with a different name.
- **Provider names are configuration, not architecture** (§11.4). Adding one is a
  row, not a code change.

## 9. Open questions

1. ~~**Should a surface be allowed to point at a provider with no key?**~~
   **Decided: yes, with a warning, and the surface degrades rather than fails.**
   Refusing the configuration would make the ordinary setup order — configure the
   surface, then add the key — impossible. The `Banner(warn)` names the surface
   and the missing provider, and that surface behaves exactly as it does offline:
   the deterministic path still works, the model path waits.

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
