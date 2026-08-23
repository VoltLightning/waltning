# Diagnostic message design

## Problem

Mobile and Expo web diagnostics currently render every event as one of three generic messages: `Waltning operation started`, `Waltning operation completed`, or `Waltning operation failed`. The structured fields distinguish the events, but the visible message does not. A developer scanning Metro cannot tell which action ran without parsing the complete JSON record.

## Decision

Derive the human-readable message centrally from the typed diagnostic event. Use the most specific available identity in this order:

1. `operation`
2. `action`
3. `update`
4. request `method` and `path`
5. `scope` and, when present, `stage` or `component`

Append the event outcome: `start` becomes `started`, `success` and `response` become `completed`, and `failure` becomes `failed`. When an event has a storage `boundary`, append `at <boundary>` so the outbox and replica steps are distinguishable.

Examples:

- `create_account started`
- `create_account failed at replica`
- `phone_ledger_refresh completed`
- `GET /trpc/accounts.list completed`
- `ledger_startup migrate_replica failed`

The structured event schema and its redacted properties remain unchanged. Emitters do not own prose and require no edits.

## Verification

A formatter test must fail against the generic message and pass only when the rendered JSON `message` identifies the actual event. Existing tests continue to prove that Metro receives one plain record, nested error causes remain visible, and LogTape's informational meta-logger notice stays suppressed.
