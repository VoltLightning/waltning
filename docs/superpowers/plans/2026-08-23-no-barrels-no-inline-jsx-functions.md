# No Barrels and No Inline JSX Functions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every runtime barrel and every inline JSX function, then make both patterns fail the existing Biome gate.

**Architecture:** Workspace packages expose concrete owner modules through `package.json` subpaths; no source file aggregates another module's values. React components pass named handler/style functions through JSX, using `useCallback` only where captured render values cross a component boundary. Biome owns enforcement through the existing `pnpm check` and `pnpm verify` path.

**Tech Stack:** TypeScript 5.9, React 19, React Native 0.86, Expo Router 57, Biome 2.5.8, pnpm workspaces, Vitest.

---

### Task 1: Capture the red rule baseline

**Files:**
- Inspect: `biome.json`
- Inspect: all `*.ts` and `*.tsx` files included by Biome

- [ ] **Step 1: Run both disabled rules directly**

```bash
source ~/.zshrc
pnpm exec biome lint \
  --only=performance/noBarrelFile \
  --only=performance/noJsxPropsBind \
  . --max-diagnostics=500 --reporter=json > /tmp/waltning-style-red.json || true
jq -r '.diagnostics[].category' /tmp/waltning-style-red.json | sort | uniq -c
```

Expected:

```text
36 lint/performance/noBarrelFile
47 lint/performance/noJsxPropsBind
```

- [ ] **Step 2: Record the exact offender sets for later comparison**

```bash
jq -r '.diagnostics[] | [.category, .location.path] | @tsv' \
  /tmp/waltning-style-red.json | sort -u > /tmp/waltning-style-red-paths.txt
wc -l /tmp/waltning-style-red-paths.txt
```

Expected: a non-empty inventory covering package roots, domain indexes, Expo routes, schema manifests, production JSX, and JSX tests.

### Task 2: Replace workspace barrels with concrete public subpaths

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/db/package.json`
- Modify: `packages/schema/package.json`
- Modify: `packages/client/package.json`
- Modify: `packages/ledger/package.json`
- Modify: `packages/ui/package.json`
- Delete: `packages/core/src/index.ts`
- Delete: `packages/db/src/index.ts`
- Delete: `packages/schema/src/index.ts`
- Delete: `packages/schema/src/columns.pg.ts`
- Delete: `packages/schema/src/pg.ts`
- Delete: `packages/schema/src/sqlite.ts`
- Delete: `packages/client/src/index.ts`
- Delete: `packages/client/src/*/index.ts`
- Delete: `packages/ledger/src/index.ts`
- Delete: `packages/ledger/src/accounts/index.ts`
- Delete: `packages/ledger/src/transactions/index.ts`
- Delete: `packages/ui/src/index.ts`
- Delete: `packages/ui/src/*/index.ts`
- Modify: package consumers under `apps/`, `packages/`, `tests/`, and `tools/`

- [ ] **Step 1: Point package exports at owner modules**

Use explicit foundation paths and domain patterns. The intended shape is:

```json
{
  "exports": {
    "./date": "./src/date.ts",
    "./id": "./src/id.ts",
    "./money": "./src/money.ts",
    "./protocol": "./src/protocol.ts",
    "./registry/*": "./src/registry/*.ts"
  }
}
```

For React Native UI use per-domain patterns such as:

```json
{
  "exports": {
    "./accounts/*": "./src/accounts/*.tsx",
    "./fx/*": "./src/fx/*.tsx",
    "./theme/*": "./src/theme/*.ts",
    "./tokens": "./src/tokens.ts"
  }
}
```

List non-pattern exceptions explicitly when the target extension differs. Do not retain `".": "./src/index.ts"` or another compatibility root.

- [ ] **Step 2: Rewrite external imports by symbol ownership**

Representative required mappings:

```ts
import { accountingDate, todayIn } from "@waltning/core/date";
import { id, type Id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { createTransactionInput } from "@waltning/core/registry/inputs";
import { createDb, type DbHandle } from "@waltning/db/client";
import { accounts, transactions } from "@waltning/db/schema";
import { useAppearance } from "@waltning/client/appearance/use-appearance";
import { Card } from "@waltning/ui/shell/card";
```

Split imports that currently take symbols owned by multiple files. Preserve type-only imports with `import type`.

- [ ] **Step 3: Rewrite internal imports to concrete siblings**

Examples:

```ts
import { useQuery, type Query } from "../query/use-query.ts";
import { makeStyles } from "../theme/styles.ts";
import { face } from "../theme/fonts.ts";
import { createAccountExecutor } from "./accounts/create-account.executor.ts";
```

No internal module imports an `index.ts` merely to cross a directory boundary.

- [ ] **Step 4: Delete the aggregation files**

Delete every file reported by `noBarrelFile` that exists only to re-export workspace values. Keep executable `apps/api/src/index.ts` and implementation-bearing registry/router files; their filename is not what defines a barrel.

- [ ] **Step 5: Typecheck the package graph**

```bash
source ~/.zshrc
pnpm typecheck
```

Expected: exit 0 with every package resolving only declared concrete subpaths.

- [ ] **Step 6: Commit the package API migration**

```bash
git add apps packages tests tools
git commit -m "Replace barrels with explicit module imports"
```

### Task 3: Remove schema and build-tool aggregation manifests

**Files:**
- Modify: `packages/schema/src/parity.type-test.ts`
- Modify: `packages/ledger/drizzle.replica.config.ts`
- Modify: `packages/ledger/drizzle.outbox.config.ts`
- Delete: `packages/ledger/src/schema.replica.ts`
- Delete: `packages/ledger/src/schema.outbox.ts`
- Delete: `packages/ledger/src/schema.ts`
- Modify: `packages/ledger/src/schema-map.ts`
- Modify: `packages/ledger/src/session.ts`
- Modify: `packages/ledger/src/test/migrate.test.ts`
- Modify: comments in `packages/ledger/src/ddl.ts` and `packages/ledger/tools/embed-ddl.ts`

- [ ] **Step 1: Build parity maps locally in the type assertion**

Import each Postgres and SQLite table type from its concrete table file, then define two local objects:

```ts
const pg = { accountGroups: pgAccountGroups, accounts: pgAccounts /* all 13 */ };
const sqlite = { accountGroups: sqliteAccountGroups, accounts: sqliteAccounts /* all 13 */ };
```

Keep the existing `Exact`, select, insert, coverage, and non-vacuity assertions against those objects. This preserves complete-set drift detection without public dialect barrels.

- [ ] **Step 2: Let Drizzle consume concrete schema files**

Change the replica config from one re-export manifest to the SQLite table files plus `local-meta.ts`, and the outbox config to `outbox.ts`:

```ts
schema: ["../schema/src/*.sqlite.ts", "./src/local-meta.ts"]
```

```ts
schema: "./src/outbox.ts"
```

Delete both schema manifest files after the configs no longer name them.

- [ ] **Step 3: Import ledger tables from their owners**

`schema-map.ts` constructs the runtime schema object from concrete SQLite table modules, `local-meta.ts`, and `outbox.ts`. `session.ts` imports `currencies` directly. The migration test constructs its two schema maps locally rather than namespace-importing manifests.

- [ ] **Step 4: Prove schema contracts**

```bash
source ~/.zshrc
pnpm --filter @waltning/schema typecheck
pnpm --filter @waltning/ledger typecheck
pnpm vitest run packages/ledger/src/test/migrate.test.ts packages/ledger/src/test/executors.test.ts
```

Expected: both typechecks and both test files pass.

- [ ] **Step 5: Commit the manifest removal**

```bash
git add packages/schema packages/ledger
git commit -m "Point schema tooling at concrete modules"
```

### Task 4: Replace API and Expo forwarding barrels

**Files:**
- Delete: `apps/api/src/modules/accounts/index.ts`
- Delete: `apps/api/src/modules/counterparties/index.ts`
- Delete: `apps/api/src/modules/currencies/index.ts`
- Delete: `apps/api/src/modules/transactions/index.ts`
- Modify: `apps/api/src/registry/index.ts`
- Modify: `apps/api/src/registry/contract.types.ts`
- Modify: `apps/mobile/app/index.tsx`
- Modify: `apps/mobile/app/quick-add.tsx`
- Modify: `apps/mobile/app/account/new.tsx`

- [ ] **Step 1: Import API operations from their owner files**

The registry imports `getAccounts`, `createCounterparty`, `getCurrencies`, and `listTransactionsOperation` directly from their operation files. Contract assertions import `CurrencySummary` directly from `currencies.service.ts`. Delete the four module barrels.

- [ ] **Step 2: Make each Expo route an ordinary entry module**

Use an import plus local default export so the route remains the framework entrypoint without re-exporting:

```tsx
import TodayScreen from "../src/today-screen";

export default TodayScreen;
```

Apply the same shape to Quick add and account creation; keep the extension-less platform resolution.

- [ ] **Step 3: Run focused checks**

```bash
source ~/.zshrc
pnpm --filter @waltning/api typecheck
pnpm --filter @waltning/mobile typecheck
pnpm vitest run tests/architecture.test.ts apps/mobile/src/phone-preview-presentation.test.ts
```

Expected: all commands pass and Expo's generated route union contains `/`, `/quick-add`, and `/account/new`.

- [ ] **Step 4: Commit entrypoint cleanup**

```bash
git add apps
git commit -m "Remove API and route forwarding barrels"
```

### Task 5: Name every JSX function prop

**Files:**
- Modify: `apps/mobile/src/account-creation-screen.native.tsx`
- Modify: `apps/mobile/src/preview-appearance-controls.tsx`
- Modify: `apps/mobile/src/quick-add-screen.native.tsx`
- Modify: `apps/mobile/src/today-screen.native.tsx`
- Modify: `packages/ui/src/accounts/create-account-form.tsx`
- Modify: `packages/ui/src/fx/amount-field.tsx`
- Modify: `packages/ui/src/primitives/button.tsx`
- Modify: `packages/ui/src/primitives/chip.tsx`
- Modify: `packages/ui/src/primitives/icon-button.tsx`
- Modify: `packages/ui/src/primitives/segment-control.tsx`
- Modify: `packages/ui/src/shell/bottom-sheet.tsx`
- Modify: `packages/ui/src/transactions/quick-add-form.tsx`
- Modify: JSX tests reported by `noJsxPropsBind`

- [ ] **Step 1: Convert component callbacks to named bindings**

Handlers that close over component values use descriptive `useCallback` bindings:

```tsx
const handleCancel = useCallback(() => router.back(), []);
const handleAmountChange = useCallback(
  (next: money.Money | null) => setAmount(next ?? ""),
  [],
);

return <Form onCancel={handleCancel} onAmountChange={handleAmountChange} />;
```

Pressable style functions with no captured render state become named module-level functions. List-item handlers may use a small child component so each rendered item owns one named callback without hooks inside a loop.

- [ ] **Step 2: Convert test callbacks to named functions**

Use module-level `noop`, local named capture functions, or existing spies:

```tsx
function noop() {}

render(<Button label="Approve" onPress={noop} />);
```

Do not add linter ignores to tests.

- [ ] **Step 3: Run the JSX rule directly**

```bash
source ~/.zshrc
pnpm exec biome lint --only=performance/noJsxPropsBind . --max-diagnostics=500
```

Expected: exit 0 and no diagnostics.

- [ ] **Step 4: Run affected tests**

```bash
pnpm vitest run apps/mobile/src packages/ui/src
```

Expected: all selected test files pass.

- [ ] **Step 5: Commit named handlers**

```bash
git add apps/mobile packages/ui
git commit -m "Name JSX callback props"
```

### Task 6: Turn the decisions into repository rules

**Files:**
- Modify: `biome.json`
- Modify: `.ai-rulez/rules/architecture.md`
- Modify: `docs/specification/architecture/10-code-structure.md`
- Modify: `docs/specification/architecture/11-client-architecture.md`
- Regenerate: `AGENTS.md`
- Regenerate: `CLAUDE.md`

- [ ] **Step 1: Enable both Biome rules as errors**

Add the performance group without overrides:

```json
"performance": {
  "noBarrelFile": "error",
  "noJsxPropsBind": "error"
}
```

- [ ] **Step 2: Replace the obsolete public-boundary prose**

Replace “Only `index.ts` is public” with:

```text
Only concrete subpaths declared in a package's exports map are public. A public
subpath resolves directly to the module that owns the values; barrels are
forbidden. No module or feature imports another — compose at the registry or route.
```

State that JSX props take named function references and that ordinary non-JSX arrow functions remain legal.

- [ ] **Step 3: Regenerate generated agent files**

```bash
source ~/.zshrc
pnpm rules
pnpm rules:validate
```

Expected: `AGENTS.md` and `CLAUDE.md` contain the new source rule and validation exits 0.

- [ ] **Step 4: Prove both rules fail when broken**

Temporarily add one re-export and one inline JSX callback to disposable tracked files, run `pnpm check`, and confirm diagnostics `lint/performance/noBarrelFile` and `lint/performance/noJsxPropsBind`. Restore those temporary lines immediately and rerun `pnpm check` to green.

- [ ] **Step 5: Commit enforcement and docs**

```bash
git add biome.json .ai-rulez docs/specification AGENTS.md CLAUDE.md
git commit -m "Enforce explicit imports and named JSX handlers"
```

### Task 7: Verify, push, and open the stacked PR

**Files:**
- Inspect: all branch changes against `feat/installable-phone-preview`
- Create remotely: PR from `chore/ban-barrels-inline-jsx` to `feat/installable-phone-preview`

- [ ] **Step 0: Expose mobile development and bundle commands at the root**

Add `dev:all`, `dev:android`, `dev:ios`, and `dev:web`, plus matching `bundle:*` commands. `dev:all` uses one Expo Go server; `bundle:all` uses Expo's all-platform export. Document the commands in `apps/mobile/README.md` and retain the existing development-client and physical-device preview scripts.

- [ ] **Step 1: Confirm zero direct rule findings**

```bash
source ~/.zshrc
pnpm exec biome lint \
  --only=performance/noBarrelFile \
  --only=performance/noJsxPropsBind \
  . --max-diagnostics=500
```

Expected: exit 0 with no diagnostics.

- [ ] **Step 2: Run the repository gate**

```bash
pnpm verify
```

Expected: lint, all workspace typechecks, test typecheck, and all Vitest files pass.

- [ ] **Step 3: Run all mobile exports**

```bash
pnpm bundle:all
```

Expected: all three exports complete.

- [ ] **Step 4: Inspect the final diff and history**

```bash
git diff --check feat/installable-phone-preview...HEAD
git diff --stat feat/installable-phone-preview...HEAD
git status --short
```

Expected: no whitespace errors, an intentional policy migration, and a clean worktree.

- [ ] **Step 5: Push and open the PR**

Push `chore/ban-barrels-inline-jsx`, write the repository PR template, and open it against `feat/installable-phone-preview`. The description must include the 36/47 red baseline, zero final diagnostics, rejected compatibility barrels, `pnpm verify`, and all three exports.
