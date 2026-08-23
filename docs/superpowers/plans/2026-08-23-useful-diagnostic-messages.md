# Useful Diagnostic Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace generic mobile and Expo web log messages with deterministic messages that identify the event being reported.

**Architecture:** Keep event producers and structured properties unchanged. Build the human-readable message at the LogTape sink from the closed `MobileDiagnosticEvent` union, using its most specific safe identifier, normalized outcome, and optional storage boundary.

**Tech Stack:** TypeScript, LogTape 2.3.2, Vitest, Expo/Metro

---

### Task 1: Render useful event messages

**Files:**
- Modify: `apps/mobile/src/diagnostics.test.ts`
- Modify: `apps/mobile/src/diagnostics.ts`

- [x] **Step 1: Make the regression test require the useful message**

Parse the existing failure record and assert its visible message:

```ts
const record = JSON.parse(String(output.mock.calls[0]?.[0]));
expect(record.message).toBe("create_account failed at replica");
```

Add success cases for client action, client state, API response, ledger startup and app startup events so every selector in the closed union is covered:

```ts
expect(messages).toEqual([
  "create_account completed",
  "phone_ledger_refresh completed",
  "GET /trpc/accounts.list completed",
  "ledger_startup ready completed",
  "app_startup root completed",
]);
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
source ~/.zshrc
pnpm vitest run apps/mobile/src/diagnostics.test.ts
```

Expected: FAIL because the received message is still `Waltning operation failed` or `Waltning operation completed`.

- [x] **Step 3: Add the centralized message builder**

Add these functions to `apps/mobile/src/diagnostics.ts`:

```ts
function diagnosticIdentity(event: MobileDiagnosticEvent): string {
  if ("operation" in event) return event.operation;
  if ("action" in event) return event.action;
  if ("update" in event) return event.update;
  if (event.scope === "api_request") return `${event.method} ${event.path}`;
  if ("stage" in event) return `${event.scope} ${event.stage}`;
  return `${event.scope} ${event.component}`;
}

function diagnosticOutcome(event: MobileDiagnosticEvent): string {
  if (event.phase === "start") return "started";
  if (event.phase === "failure") return "failed";
  return "completed";
}

function diagnosticMessage(event: MobileDiagnosticEvent): string {
  const boundary = "boundary" in event ? ` at ${event.boundary}` : "";
  return `${diagnosticIdentity(event)} ${diagnosticOutcome(event)}${boundary}`;
}
```

Pass `diagnosticMessage(event)` to `logger.error`, `logger.debug`, and `logger.info` instead of the three generic strings.

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
source ~/.zshrc
pnpm vitest run apps/mobile/src/diagnostics.test.ts apps/mobile/src/platform.test.tsx
```

Expected: both files pass and no LogTape startup notice is emitted.

- [x] **Step 5: Run the repository gate**

Run:

```bash
source ~/.zshrc
pnpm verify
```

Expected: formatting, typechecks, and all tests pass.

- [x] **Step 6: Commit and push the PR stack**

```bash
git add apps/mobile/src/diagnostics.ts apps/mobile/src/diagnostics.test.ts docs/superpowers/plans/2026-08-23-useful-diagnostic-messages.md
git commit -m "Name mobile diagnostic events"
git push origin fix/mobile-ledger-diagnostics
```
