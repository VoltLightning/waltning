/**
 * `unknown` is budgeted, per file, with a reason.
 *
 * `CLAUDE.md`: *"Type parameters before `unknown`, `any`, `never`.
 * `unknown`/`never` as placeholders are a design smell — they push a cast to
 * every call site and discard the type the caller had."* It then names the
 * legitimate uses: `catch` bindings, JSON off the wire, a *constraint* position
 * for a deliberately heterogeneous collection, and `never` for exhaustiveness.
 *
 * That is a rule, and a rule that is not a test is not a rule. The failure mode
 * is not one bad `unknown` — it is the thirtieth, arriving one at a time, each
 * defensible on its own line and collectively a codebase where nothing is
 * typed. By the time anyone notices, the sweep costs a day.
 *
 * So the count is pinned. **Adding one is a decision made here, in the open,
 * with a reason beside it** — the same shape as the folder allowlist in
 * `architecture.test.ts`, and for the same reason: an allowlist makes the
 * exception visible where a blocklist only bans the last mistake.
 *
 * **Lowering a number is always fine and needs no edit here** — the assertion
 * is an upper bound. Raising one, or adding a file, should be argued for in the
 * pull request that does it.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * The budget, and why each file has one.
 *
 * A file absent from this map must contain **no** `unknown` at all.
 */
const BUDGET: Record<string, { max: number; why: string }> = {
  "apps/api/src/common/pg-errors.ts": {
    max: 5,
    why: "catch bindings — the language gives no choice, and each one is narrowed by a type guard rather than cast",
  },
  "packages/core/src/registry/gate.ts": {
    max: 4,
    why: "a runtime boundary that must survive junk (there is a test passing it `null` and a string), plus `unknown` as the value type of a field bag whose keys are all it reads",
  },
  "packages/ledger/src/write.ts": {
    max: 3,
    why: "two in one constraint — the driver's run-result and the schema map, neither of which this module touches — and the JSON payload the drain replays. It was eight: `TRun` and `TSchema` threaded by hand through three declarations, which is one decision typed out three times",
  },
  "packages/ledger/src/accounts/create-account.executor.ts": {
    max: 1,
    why: "the driver's run-result, in a position nothing consumes — `expo-sqlite` on the device and `better-sqlite3` in tests, and an executor never reads one because every statement ends in `.all()`",
  },
  "packages/ledger/src/transactions/create-transaction.executor.ts": {
    max: 1,
    why: "the driver's run-result, in a position nothing consumes — `expo-sqlite` on the device and `better-sqlite3` in tests, and an executor never reads one because every statement ends in `.all()`",
  },
  // A3 · the same `ReplicaTx = LocalTx<unknown, typeof schema>` as
  // `create-account.executor.ts` above, once per executor file — the driver's
  // run-result, in a position nothing consumes.
  "packages/ledger/src/accounts/update-account.executor.ts": {
    max: 1,
    why: "the driver's run-result, in a position nothing consumes — same as create-account.executor.ts",
  },
  "packages/ledger/src/accounts/archive-account.executor.ts": {
    max: 1,
    why: "the driver's run-result, in a position nothing consumes — same as create-account.executor.ts",
  },
  "packages/ledger/src/accounts/reorder-accounts.executor.ts": {
    max: 1,
    why: "the driver's run-result, in a position nothing consumes — same as create-account.executor.ts",
  },
  "packages/ledger/src/accounts/update-group.executor.ts": {
    max: 1,
    why: "the driver's run-result, in a position nothing consumes — same as create-account.executor.ts",
  },
  "packages/ledger/src/accounts/reorder-groups.executor.ts": {
    max: 1,
    why: "the driver's run-result, in a position nothing consumes — same as create-account.executor.ts",
  },
  "packages/ledger/src/accounts/archive-group.executor.ts": {
    max: 1,
    why: "the driver's run-result, in a position nothing consumes — same as create-account.executor.ts",
  },
  "packages/ledger/src/accounts/reconcile-account.executor.ts": {
    max: 1,
    why: "the driver's run-result, in a position nothing consumes — same as create-account.executor.ts",
  },
  "packages/ledger/src/accounts/create-group.executor.ts": {
    max: 1,
    why: "the driver's run-result, in a position nothing consumes — same as create-account.executor.ts",
  },
  "packages/ledger/src/categories/create-category.executor.ts": {
    max: 1,
    why: "the driver's run-result, in a position nothing consumes — same as create-account.executor.ts",
  },
  "packages/ledger/src/categories/rename-category.executor.ts": {
    max: 1,
    why: "the driver's run-result, in a position nothing consumes — same as create-account.executor.ts",
  },
  "packages/ledger/src/categories/reparent-category.executor.ts": {
    max: 1,
    why: "the driver's run-result, in a position nothing consumes — same as create-account.executor.ts",
  },
  "packages/ledger/src/categories/convert-leaf-group.executor.ts": {
    max: 1,
    why: "the driver's run-result, in a position nothing consumes — same as create-account.executor.ts",
  },
  "packages/ledger/src/categories/merge-categories.executor.ts": {
    max: 1,
    why: "the driver's run-result, in a position nothing consumes — same as create-account.executor.ts",
  },
  "packages/ledger/src/categories/archive-category.executor.ts": {
    max: 1,
    why: "the driver's run-result, in a position nothing consumes — same as create-account.executor.ts",
  },
  "packages/ledger/src/transactions/update-transaction.executor.ts": {
    max: 1,
    why: "the driver's run-result, in a position nothing consumes — same as `create-transaction.executor.ts`",
  },
  "packages/ledger/src/transactions/delete-transaction.executor.ts": {
    max: 1,
    why: "the driver's run-result, in a position nothing consumes — same as `create-transaction.executor.ts`",
  },
  "packages/ledger/src/executor.ts": {
    max: 3,
    why: "two raw-payload doors (`invoke`, `mintedIds`) taking JSON off a disk, which is exactly as trustworthy as JSON off a wire, and one widened `Row` in a constraint position — a registry is heterogeneous and TypeScript has no existential type for `returns something`",
  },
  "packages/ledger/src/open.ts": {
    max: 1,
    why: "the drizzle schema-map constraint, named once. It is not the `LocalDb` alias `write.ts` refuses: it answers only for the schema map, never for the driver's run-result, and every declaration still carries both type parameters",
  },
  "packages/ui/src/shell/float-geometry.ts": {
    max: 2,
    why: "JSON off the disk — the stored button position, which is exactly as trustworthy as JSON off a wire and is checked field by field before it becomes a position",
  },
  "packages/ui/.vitest/reanimated.ts": {
    max: 1,
    why: "a CommonJS mock with no declared type, cast once to the module it stands in for",
  },
  "packages/ledger/src/outbox.ts": {
    max: 1,
    why: "the queued payload is the operation's validated input as JSON, and the outbox is deliberately not allowed an opinion about its shape — the drain's upcasters are",
  },
  "apps/api/src/registry/idempotency.ts": {
    max: 3,
    why: "hashes arbitrary JSON — it walks a value it is deliberately not allowed to have an opinion about",
  },
  "packages/core/src/registry/conflict.ts": {
    max: 3,
    why: "a field patch compares values it never interprets; `Object.is` is the whole of its knowledge",
  },
  "apps/api/src/trpc/from-registry.ts": {
    max: 2,
    why: "the accumulator holds procedures of many different output types — a constraint position for a genuinely heterogeneous collection",
  },
  "apps/api/src/trpc/index.ts": {
    max: 2,
    why: "`error.cause` is unknown by construction; the code beside it is now tRPC's own union",
  },
  "packages/client/src/query/use-query.ts": {
    max: 2,
    why: "a dependency array is heterogeneous by definition, and a promise rejection is a catch binding",
  },
  "packages/core/src/protocol.ts": {
    max: 2,
    why: "JSON off the wire, before Rule 0 has authenticated it — the one place a value has genuinely no type yet",
  },
  "packages/core/src/registry/operation.ts": {
    max: 2,
    why: "`invoke(raw)` takes unvalidated input on purpose (validating it is the method's job), and `AnyOperation` is a heterogeneous registry",
  },
  "tools/migrate-mm/src/import.ts": {
    max: 2,
    why: "reads a foreign export whose shape is the thing being discovered",
  },
  "apps/api/src/registry/define.ts": {
    max: 1,
    why: "passes unvalidated input through to the gate, which is where the runtime check lives",
  },
  "apps/mobile/src/fonts.ts": {
    max: 1,
    why: "`satisfies Record<RequiredFace, unknown>` checks key coverage and deliberately makes no claim about the asset values",
  },
  "apps/mobile/src/phone-ledger.native.ts": {
    max: 1,
    why: "pnpm gives the same Drizzle version different nominal package identities for its Expo and Postgres peer sets; the native platform seam proves the runtime adapter and contains that package-manager-only cast",
  },
  "apps/mobile/src/phone-ledger.web.ts": {
    max: 1,
    why: "the same package-manager-only Drizzle cast, on the browser's half of the seam",
  },
  "packages/db/src/fx/backfill.ts": {
    max: 1,
    why: "an unrecognised rate source, which is a string from the database and not a type",
  },
  "packages/schema/src/dashboard-widgets.pg.ts": {
    max: 1,
    why: "a widget's config is per-kind, so the shape is open by design",
  },
  "packages/schema/src/dashboard-widgets.sqlite.ts": {
    max: 1,
    why: "as above, on the other dialect",
  },
  "tools/e2e/src/smoke.ts": {
    max: 1,
    why: "a catch binding — the e2e probe reports whatever a failed fetch threw, and narrowing it would mean guessing at the shape of a failure it exists to discover",
  },
  "packages/client/src/transport/field-errors.ts": {
    max: 1,
    why: "fieldErrorsFromZod takes whatever a controller or a transport caught, exactly like a catch binding, and narrows it with an instanceof guard rather than a cast",
  },
};

/**
 * Comments are stripped first.
 *
 * Half the occurrences in this repository are prose *explaining why an
 * `unknown` was removed* — counting those would make the budget rise every time
 * someone documented a fix, which is the exact opposite of what it is for.
 */
function usages(source: string): number {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  return code.match(/\bunknown\b/g)?.length ?? 0;
}

function sourceFiles(): string[] {
  return execFileSync("git", ["ls-files", "*.ts", "*.tsx"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !f.includes(".test.") && !f.includes("node_modules"));
}

describe("`unknown` stays budgeted", () => {
  it("no file exceeds its allowance, and none has one without a reason", () => {
    const files = sourceFiles();
    // Non-vacuous: if the listing ever comes back empty this passes over
    // nothing, which is the failure mode every scan in this repo has had once.
    expect(files.length, "source files found").toBeGreaterThan(50);

    const over: string[] = [];
    for (const file of files) {
      const n = usages(readFileSync(`${repoRoot}${file}`, "utf8"));
      if (n === 0) continue;
      const allowed = BUDGET[file];
      if (!allowed) {
        over.push(`${file}: ${n} unknown, no budget — add one with a reason, or type it`);
      } else if (n > allowed.max) {
        over.push(`${file}: ${n} unknown, budget ${allowed.max} — ${allowed.why}`);
      }
    }

    expect(over, "files over budget").toEqual([]);
  });

  it("every budget entry is still earning its place", () => {
    // A budget for a file that no longer uses `unknown` is a licence nobody
    // asked for. Stale entries are how an allowlist quietly becomes permission.
    const stale = Object.keys(BUDGET).filter(
      (f) => usages(readFileSync(`${repoRoot}${f}`, "utf8")) === 0,
    );

    expect(stale, "budgets for files that no longer need one — delete them").toEqual([]);
  });

  it("every reason says something", () => {
    const empty = Object.entries(BUDGET)
      .filter(([, v]) => v.why.trim().length < 20)
      .map(([f]) => f);

    expect(empty, "a budget without a real reason is just a bigger number").toEqual([]);
  });
});
