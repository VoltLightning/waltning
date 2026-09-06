# S30 · Settings · System

**Surface** both · **Journeys** J10, J15 · **Frequency** rare, and after every alarm
**Design** none
**Status** specified

---

## 1. Purpose

Report whether the system underneath the ledger is still healthy — and prove
that the backup you have never needed would actually work. That question
presumes a backend to report on. A backendless phone backs itself up a different
way and this screen's backup and drill panels do
not apply to it (`architecture/14` §14.3) — see §3.

## 2. Entry and exit

| From | Via | Back to |
|---|---|---|
| S01 Dashboard | `system_health` widget, tapped | S01 |
| Settings | System row — badged when degraded | Settings |
| J10 | *FX coverage* from the rate screens (S17, S18) | S18 |
| J15 | Cutover precondition — the restore drill must have passed | J15 |
| Push notification | Backups failed **twice consecutively** · a drill overdue past its quarter · a currency in active use more than a week behind (S18) | — |

### The Settings menu itself

Every settings screen names Settings as its entry — S16 §2 *Accounts*, S17
*Currencies*, S18 *Exchange rates*, S19 *Categories*, this screen's *System*
row above — and the tab root is the one list that has to carry all of them. It
is a card of grouped rows, one row per destination, label and chevron, in this
order:

```
  ┌─────────────────────────────────┐
  │  Accounts                     › │
  │  Categories                   › │
  │  Currencies                   › │
  │  Exchange rates               › │
  └─────────────────────────────────┘
```

**The register comes first** because it is the only one of them a person opens
to look at their money rather than to configure something. The rest are
reference data, in the order they depend on each other.

The screen draws no title of its own: a title on the only card on a screen
names the screen rather than the card, and the screen's name belongs to the
header above the ground. Rows, not buttons — `design-system/05` §5.1's card of
grouped rows is exactly a list of destinations, and three stacked buttons in a
titled card was a card pretending to be a screen. A row is added here when the
screen it leads to exists, never before: a menu entry to a placeholder is a
promise the app cannot keep.

## 3. Layout

**Backup, drill and FX-coverage cards require a backend.** They report on the
backend, so a backendless phone has none of them to show — not a degraded
state, just nothing to be a claim about. Its durability is instead the
app-owned, age-encrypted export (`architecture/14` §14.3): a self-backup the
owner triggers and controls, key in iCloud Keychain, ciphertext kept
somewhere Apple is not. Once a backend exists, these cards start reporting on
it, and the phone's own export becomes a second, independent copy rather than
the only one. **Ledger invariants** run against the live Postgres database
(§15.1), so that card also requires a backend. The **outbox** card alone is
phone-local and renders regardless — see its own note below.

### Mobile — 390pt

One column of status cards, worst-first. The order is not fixed: whatever is
degraded rises to the top, because this screen is opened *because* something is
wrong far more often than out of curiosity.

```
  ┌ Backups ─────────────────────── ⚠ ┐
  │  Last successful   2 days ago     │
  │  Off-site (B2)     2 days ago     │
  │  Encrypted         age ✓          │
  │  Retention         30 · 12 · 3    │
  │  Restore drill     87 days ago ⚠  │
  │                    [ Run a drill ]│
  └───────────────────────────────────┘
  ┌ FX coverage ─────────────────── ⚠ ┐
  │  PLN EUR GBP BYN        100%      │
  │  RUB                     23%      │
  │  GEL                    0.5%  ⚠   │
  │                  [ Re-run GEL ]   │
  └───────────────────────────────────┘
  ┌ Ledger invariants ────────────  ✓ ┐
  │  11 checks · last run 04:00       │
  │  ✓ balances reconcile      52/52  │
  │  ✓ transfers valued               │
  │  ✓ tax_ledger clean               │
  │  ⚠ clearing · PLN  340,00 · 8 d   │
  │                    [ Run now ]    │
  └───────────────────────────────────┘
  ┌ Storage · Services · Model spend ─┐
  │  …                                │
  └───────────────────────────────────┘
```

The clearing line is **not a defect** — a non-zero clearing balance is a prompt
to allocate (§6.4), and it appears here as an amount and an age rather than as a
failure.

### Web — ≥1024px

Two columns: **evidence** left (backups, restore-drill log, FX coverage — the
things with history worth reading) and **liveness** right (services, storage,
model spend — the things that are only ever "now"). The extra width buys the
drill log and the per-currency coverage table, which are unreadable on a phone.

## 4. Components

| Component | Notes |
|---|---|
| `Card` | One per domain, ordered worst-first |
| `StatTile` | Age of last backup, days since drill, disk headroom |
| `Banner(warn)` | Degraded — amber, one meaning: not finished or not fully observed (P4) |
| `Banner(negative)` | Failing — a backup that has not succeeded in over 48 h |
| `ErrorState(recoverable)` | Per check, with `RetryAction` |
| `RetryAction` | **Paced, not merely retried** — the GEL path is rate-limited, and retrying is the wrong remedy (`design-system/08` §8.4) |
| `ProgressBar` | Determinate — drill and backfill both report real progress |
| `Sparkline` | Model spend over 30 days |
| `Tag` | `never drilled` · `passed` · `failed` |

No new components. That is the point of specifying it after `08`.

## 5. Data

| Reads | Writes |
|---|---|
| Backup manifest — last success, size, destination, encryption status | `run_backup` |
| Restore-drill log — date, duration, outcome, rows verified | `run_restore_drill` |
| FX coverage per currency (`fx_rates` grouped by quote) | `backfill_fx_rates(currency, from, to)` |
| **Ledger invariant results** (`SPEC.md` §15.1) | `run_invariant_checks` |
| Disk headroom, container health, **`link` state with its specific remedy** (`architecture/09`) | — |
| **Outbox** — pending count, **oldest entry age**, and every blocked entry with the server's refusal reason | `retry_entry` · `edit_entry` · `discard_entry` |
| Model token spend per surface (§11.4) | — |

#### The outbox card is local, and renders when nothing else here can

The rest of this screen reports on the Pi, so unreachable means one thing and
there are no cached values — *absence of contact is the finding*. **The outbox
card is the exception**, and it must be carved out explicitly: it is device state,
not a claim about the Pi's health, so it renders in full while offline. That is
precisely when you have twelve pending entries and want to see them.

Without this the screen H15 designates as the home of blocked entries is
specified to show a red banner and nothing else at the moment the queue exists.

It shows **age, not just count** — an outbox two weeks old is a different
situation from one two hours old, and the age is what makes the pressure to
stand up a weaker sync path legible before it is acted on.

The `link` state names its own remedy rather than saying *offline*: Tailscale not
running, node key expired, another VPN holding iOS's single tunnel slot, the Pi
not answering, Postgres down, session expired. This is the one screen you open
*because* it is broken, so it is the one screen that must name the layer.

**The invariant panel is the reason this screen is not only about
infrastructure.** §15.1's checks run against the live database on a schedule and
report here: balances that disagree with their own query, a transfer that cannot
be valued, a `tax_ledger` row that should be impossible. A ledger's
characteristic failure is a number quietly wrong for months, and this is where
that becomes visible.

A violation is a **defect report, not an exception** — it never blocks a write.

Every write goes through the operation registry (§11.0), so the agent inherits
them: *"when did the last backup run"* and *"re-run the GEL backfill"* are
ordinary tool calls. `run_restore_drill` is **never eligible for auto mode** —
it is expensive and it touches a scratch database.

## 6. States

| State | Treatment |
|---|---|
| Loading | Skeleton cards in the same shape; checks resolve independently and fill in as they land, rather than blocking on the slowest |
| Populated | Healthy: every card collapsed to one line. This screen should be boring |
| Empty | **`never-drilled`** — no restore drill on record. Distinct from a passing one and from a failing one, because "never tested" is the actual state of most backups |
| Error | Per check, not per page. One unreachable container must not blank the backup history |
| Offline | The Pi *is* the thing being reported on, so unreachable means one thing: `Banner(negative)` stating when it was last reached. No cached values — a cached "healthy" is the most dangerous lie this screen could tell |
| Gated | `run_restore_drill` confirms (`ConfirmDialog`) — the one genuinely expensive action here, and **always manually triggered**. The system tracks the quarter, badges, and pushes when overdue; it never runs the drill itself, because a drill ends in a judgement about whether the restored data is right and an automated green tick would certify less than it appears to |

**The offline row is the interesting one.** Everywhere else in this system,
offline means serve the cache with its age (§8.3). Here the cache would assert
health about a machine you cannot reach, which inverts the screen's purpose.

## 7. Interaction

### Mobile
Tap a card to expand its detail. Pull to refresh re-runs the checks. No
destructive gestures — nothing here is swipe-to-anything.

**Every action is available on mobile**, including `run_restore_drill`. This is
the screen a push notification lands you on, and an alert whose only remedy is
*get to a laptop* is a worse alert. The drill's confirmation matters more here
than on the desktop, because a thumb is closer to it.

### Web
Full keyboard reachability. The drill log is a table with its own scroll
container, never widening the page.

### Shared
`run_restore_drill` confirms. `run_backup` and `backfill_fx_rates` do not —
both are idempotent and safe to repeat, and a confirmation on a safe action
teaches people to click through the ones that matter.

## 8. Rules this screen must obey

- **P4** — amber is degraded, `negative` is failing, and the distinction is
  carried by text as well as tint (**P5**).
- **P1** — model spend is money, so it renders through `<Amount>` with its
  currency, not as a bare number.
- Never render a **cached** health value. Absence of contact is the finding.
- The widget is the alarm; this screen is the evidence. Neither replaces the
  other — the failure mode of backups is that nobody goes looking, which is why
  `system_health` sits on the dashboard at all.

### Unresolved conflicts

The badge that leads to S35 lives here, beside the outbox it belongs to — an
unresolved conflict *is* a blocked entry, and this screen already owns those.

**Unresolved only.** Resolved conflicts are history and live on the row they
belong to (S09's `AuditHistory`), where you have a reason to be looking. A
second list of settled conflicts would be a screen that is empty almost always
and consulted almost never — and the one question it answers, *what did I
discard last week*, is answered on the row itself once you are there.

Each entry names the transaction, the field, and whether it blocks a tax close
(§13). Tapping opens S35 at that conflict.

## 9. Open questions

1. ~~**Does a failed nightly backup warrant a push notification?**~~ **Decided:
   yes, on the second consecutive failure.** One failure is usually a restart, a
   locked file or a router reboot, and resolves itself. Two in a row is a fault.

   **The threshold exists to keep the channel rare enough to stay trusted** —
   which is the only property that matters for a notification you need to work
   eighteen months from now. Firing it for things that fix themselves would
   train the mute. The same rule covers a restore drill overdue past its
   quarter.

   **The general rule this establishes: alert on the symptom, not the event.** A
   failure that self-corrects is not worth a notification; a gap that persists
   is. S18 follows it — a failed FX sync says nothing, a currency a week behind
   pushes.

   The channel currently carries exactly three conditions. That is the design.
2. ~~**Should the restore drill be schedulable from here?**~~ **Decided:
   tracked and escalated by the system, triggered by you.** S30 knows the
   quarter, badges the widget when one is due, and pushes once it is overdue —
   but the drill only ever runs because you pressed the button.

   **A restore drill is not finished when a checksum matches.** It ends with a
   judgement about whether the restored data is actually right, and automating
   the mechanical half would produce a green tick that certifies less than it
   appears to. Keeping the trigger manual keeps the result something you
   watched.

   **The honest risk, recorded:** the escalation is a reminder, and reminders are
   what this was meant to replace. If two consecutive quarters go by unrun, that
   is evidence the manual trigger has failed and automation should be revisited
   — not evidence that you need a louder nag.
3. ~~**Should this screen exist on mobile at all?**~~ **Decided: both surfaces,
   fully — actions included.** The phone is what you are holding when the Pi is
   unreachable, and it is also where you are when a push says backups have
   failed twice. Making that notification actionable from the device that
   delivered it is the point; sending an alert whose only remedy is "get to a
   laptop" is a worse alert.

   **`run_restore_drill` keeps its `ConfirmDialog` on both surfaces**, and this
   is where that confirmation earns its place — it is the one genuinely
   expensive action in the system, and a thumb is closer to it here than a
   pointer ever is on the desktop.
