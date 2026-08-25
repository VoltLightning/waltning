# Quick Add focused finance chat

## Outcome

Mobile Quick Add exposes a fourth input mode, `💬`. It starts a new, persistent
S03 Agent session focused on adding one transaction. The session has the full
finance-agent capability surface: it may search the ledger, answer questions,
and propose any registry write. Every write receives S03's ordinary approval
and audit treatment.

Quick Add does not host a second agent loop. S03 owns the conversation, session
history, tools, write gates, and audit records.

## Delivery boundary

The focused chat is an extension of the base S03 Agent, not a prerequisite for
the rest of Quick Add. S05's keypad, deterministic grammar, voice, and photo
paths may ship without it. The `💬` entry ships only with or after S03's session
runtime, operation tools, approval gate, audit trail, and mobile conversation
screen exist.

The implementation plan for this design covers the focused-session integration.
It does not absorb the whole S03 build into the capture milestone. If S03 is
still absent when planning begins, its existing specification receives a
separate prerequisite plan and lands first.

## User experience

### Entry

The mobile S05 dock contains `[123] [◉] [▣] [💬]`. Tapping `💬` while online:

1. snapshots the current Quick Add draft;
2. mints a client UUID for the prospective transaction if the draft does not
   already have one;
3. starts a new S03 session with `quick_add_transaction` launch context; and
4. navigates to S03 with the header title *Add transaction* until the first
   user message supplies the ordinary session title.

The session is retained in Agent history. It does not resume an unrelated
session and is not discarded on navigation.

Tapping `💬` while offline stays in Quick Add, preserves every field, states
that Agent requires a connection, and points to the offline-capable capture
modes. Agent turns are never queued: a later response may require a question
whose answer does not exist yet.

### Live transaction draft

S03 pins a compact transaction-draft card between the session header and the
conversation. The card begins with the Quick Add snapshot and shows the
current:

- type;
- amount and currency;
- account;
- category;
- accounting date;
- scope;
- note; and
- counterparty and role, when present.

The card is a live working draft, not an immutable handoff receipt. Validated
draft patches from agent turns update it. A machine-filled or machine-changed
field carries the ordinary marker and provenance trail. The user changes the
card by talking to the agent; it does not embed a second set of form controls.
Back remains the direct escape to manual editing.

The draft is not a ledger row and none of its patches are registry writes. It
may remain incomplete between turns. The authoritative `create_transaction`
contract validates the completed proposal.

### Approval and resolution

When the draft can represent one payment event, S03 renders its ordinary
`create_transaction` `DiffCard`. The live draft freezes while that proposal is
pending.

- **Approve** executes `create_transaction` through the registry, records the
  normal agent audit trail, links the resulting transaction to the launch
  context, and resolves the draft.
- **Decline** records the declined tool call, unfreezes the draft, and lets the
  conversation continue.
- **A failed proposal** leaves the draft unresolved and editable through chat.
- **Any other read or write** behaves exactly as it does in S03 and does not
  resolve the Quick Add draft.

The focused draft describes one payment event. If the conversation identifies
additional transactions, S03 gives them independent proposals and client UUIDs.
Only the `create_transaction` proposal carrying the focused draft's UUID can
resolve the launch context.

### Navigation

Back is conditional on the focused draft, not on whether the session performed
some write:

| Focused draft state | Back target |
|---|---|
| Active, pending, declined, or failed | Quick Add, restored from the original snapshot |
| Resolved by its matching approved `create_transaction` | Today |

The session remains in Agent history in either case. Reopening it restores the
live card and its resolution state.

## Architecture

### One loop

S05 is a transaction composer and entry point. S03 is the only finance-chat
loop. Mobile route composition connects them; neither the transaction module
nor the agent module imports the other.

The app route translates the Quick Add state into a concrete core launch
contract, starts S03, and composes the transaction-draft card above the Agent
conversation. Shared behavior remains in `packages/client`, rendering remains
in `packages/ui`, and router/navigation knowledge remains in `apps/mobile`.

The focused session uses the `agent` assist and its configured model. The
`quick_add` assist remains available to S05's explicit one-pass model
interpretation path; it does not configure S03.

### Launch contract

The core contract is a discriminated structure rather than an open JSON bag:

```ts
type QuickAddAgentContext = {
  kind: "quick_add_transaction";
  draftId: string;
  initial: TransactionDraft;
  current: TransactionDraft;
  provenance: Partial<Record<TransactionDraftField, DraftProvenance>>;
  state: "active" | "awaiting_approval" | "resolved";
  resolvedTransactionId: string | null;
};
```

`TransactionDraft` uses money strings and bare `YYYY-MM-DD` accounting dates.
Its fields are nullable where Quick Add may legitimately be incomplete. Zod
validates launch input, stored state, and every draft patch. A compile-time
contract assertion pins the concrete type at the client/API seam.

### Persistence

Because S03 is online-only and its sessions are server-owned, the focused draft
is server-only state. An `agent_quick_add_contexts` table stores exactly one
context per focused session:

- `session_id`, primary key and foreign key to `agent_sessions`;
- `draft_id`, unique client UUID used as the transaction external ID;
- validated initial and current draft documents;
- field provenance;
- state;
- optional `resolved_transaction_id`, foreign key to `transactions`; and
- created and updated timestamps.

A database constraint makes `state = 'resolved'` equivalent to a non-null
`resolved_transaction_id`. JSON columns must contain objects; the service
validates their complete concrete contracts on write and read. Ledger
guarantees remain on `create_transaction`, where incomplete or stale draft
values cannot enter the authoritative table.

A new `start_agent_session` registry operation accepts the launch context. It is
not agent-visible and is not offline-eligible: an agent cannot recursively
start itself, and an offline session cannot exist. Creating the session and its
focused context is atomic. The first ordinary `send_message` supplies the
session's user-authored title. Draft patches produced by a turn are validated
before the turn service persists them. A rejected patch changes neither stored
state nor rendered state.

### Atomic resolution

The focused draft's UUID becomes the `external_id` of its matching
`create_transaction` proposal. The approval coordinator finds the focused
context through the proposal's session and verifies that UUID before resolving
it. Applying the registry operation and recording the resulting transaction ID
on the context occur in one server transaction.

This preserves two independent guarantees:

- replaying an uncertain approval cannot insert a second transaction; and
- no unrelated agent write can make navigation treat the Quick Add draft as
  complete.

## State and error handling

| Condition | Treatment |
|---|---|
| Session creation fails | Stay in Quick Add with the original draft unchanged |
| Connection drops after navigation | Show S03's recoverable error; Back restores the draft |
| Model returns an invalid draft patch | Reject it before persistence and let the model retry or explain |
| Account, category, or counterparty became stale | Proposal validation fails; nothing writes; the agent re-resolves the reference |
| Duplicate candidate exists | Show the matched transaction before approval can complete |
| Approval response is lost | Refetch by the focused UUID before another attempt |
| Proposal is declined | Keep the declined audit record, unfreeze the draft, continue the session |
| Turn is cancelled | Commit neither a partial assistant message nor a partial draft patch |
| Response is unauthenticated | Apply Rule 0; trust neither its status nor its draft state |

Every failure keeps the original Quick Add snapshot recoverable until the
matching transaction is authoritatively resolved.

## Components and ownership

| Unit | Responsibility | Home |
|---|---|---|
| Quick Add chat action | Check connectivity, snapshot the draft, request navigation | transaction behavior in `packages/client`; route wiring in `apps/mobile` |
| Focused launch contract | Concrete draft, patch, provenance, and resolution schemas | `packages/core` |
| Session start operation | Create the session and focused context atomically | `apps/api` registry and agent service |
| Agent session model | Start the session, apply validated patches, expose resolution | `packages/client/src/agent/` |
| Transaction draft card | Render fields, machine markers, trail, and frozen/resolved state | `packages/ui/src/transactions/` |
| S03 route | Compose the card with the existing Agent conversation | `apps/mobile` |
| Session/context persistence | Store the context and resolve it atomically with approval | `apps/api` and `packages/db` |

No new top-level source folder, barrel, agent runtime, or operation catalogue is
introduced.

## Scope

Included:

- the mobile S05 `💬` entry;
- a new persistent focused S03 session per entry;
- live draft handoff and field-level provenance;
- full S03 read and write capability;
- ordinary `DiffCard` approval and audit;
- conditional Back behavior; and
- explicit offline recovery in Quick Add.

Excluded:

- implementation of the base S03 Agent prerequisite;
- changes to voice or receipt capture;
- offline agent turns or queued messages;
- chat embedded inside Quick Add;
- changes to the web command-bar grammar;
- new ledger or finance tools created only for this entry point; and
- a second model or agent runtime for transaction chat.

## Verification

### Contracts and state

- Accept money only as decimal strings and dates only as `YYYY-MM-DD` strings.
- Reject an invalid launch context or draft patch before state changes.
- Prove the compile-time client/API contract fails when a concrete field drifts.
- Seed a blank and a partial Quick Add draft.
- Apply patches with provenance, freeze on proposal, unfreeze on decline, and
  resolve only on the matching approved create.

### Database and service

- Run integration tests against real PostgreSQL.
- Prove one focused context per session and one unique draft UUID.
- Break the resolved-state constraint and observe PostgreSQL reject it.
- Persist the session and focused context atomically.
- Apply `create_transaction` and context resolution atomically.
- Replay the same UUID and prove that exactly one transaction exists.
- Approve an unrelated write and prove the focused context remains unresolved.
- Reject stale references and duplicate candidates without losing the draft.

### UI and journey

- Render blank, partial, machine-filled, frozen, declined, failed, and resolved
  card states with accessible labels.
- Show field provenance without formatting money outside `<Amount>` or
  `<FxAmount>`.
- Open a new session from Quick Add and retain it in Agent history.
- Restore Quick Add before resolution and return to Today after resolution.
- Stay in Quick Add and explain the limitation when offline.
- Exercise full S03 search and an unrelated gated write inside the focused
  session.

### Architecture and gate

- Assert that S05 has no agent runtime or generated tool set.
- Assert that feature modules do not import each other and the app route only
  composes them.
- Keep every JSX prop on a named function reference and every package export on
  a concrete subpath.
- Run `pnpm verify`.

## Canonical specification amendments

Implementation begins by rewriting the affected specification passages so they
describe this design directly:

- S05's fourth mobile mode launches a focused S03 session.
- S03 accepts S05 entry, renders the live transaction-draft card, and defines
  conditional Back behavior.
- J02 routes conversational capture through S03 while preserving Quick Add's
  offline alternatives.
- J09 includes the focused transaction entry and its matching-create
  resolution rule.
- `operations.md` includes `start_agent_session` as a user-facing,
  non-agent-visible, online-only operation.
- `architecture/04` shows one Agent loop rather than a separate S05 loop.
- `architecture/02` assigns the conversational loop solely to S03 while keeping
  S05's deterministic and one-pass assists distinct.
- The implementation board places this integration with or after S03 without
  delaying S05's offline capture paths.

## Success criteria

- Any partial Quick Add draft reaches a new S03 session without losing a field.
- The pinned card remains legible and current throughout a multi-turn
  conversation.
- The user can use every ordinary S03 read and write capability in the session.
- Approving the focused proposal produces exactly one audited transaction.
- Declining, cancelling, losing the connection, or performing another write
  never resolves or loses the draft.
- Back restores the draft before resolution and returns to Today after it.
- Reopening the retained session restores the card and its resolution state.
