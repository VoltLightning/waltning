/**
 * §11.0, enforced.
 *
 * The claim — *"the tRPC router and the agent's tools are both generated from
 * one registry, so there is no operation the UI can perform that the agent
 * cannot"* — has been in the specification since the first draft with nothing
 * behind it. These tests are what stands behind it.
 *
 * The important one is the mismatch test: it is not enough that the two agree
 * today, because they would also agree today if both generators were reading
 * the same list and neither was actually derived. It has to be shown that
 * introducing a divergence *fails*.
 */

import type { JsonObject, JsonValue } from "@waltning/core/json";
import { type AnyOperation, defineOperation } from "@waltning/core/registry/operation";
import { toolSchemas } from "@waltning/core/registry/tools";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { routerFromRegistry } from "../trpc/from-registry.ts";
import { appRouter } from "../trpc/router.ts";
import { AUDIT_ENTITIES } from "./audit-entities.ts";
import type { OperationContext } from "./context.ts";
import { defineOperation as defineApiOperation } from "./define.ts";
import { registry } from "./index.ts";

const names = (r: object) => Object.keys(r).sort();

/**
 * A context these tests never reach into: every case here fails at validation,
 * before the handler runs. Named so that is explicit — `{} as OperationContext`
 * scattered inline reads like an oversight rather than a statement that the
 * handler is not the thing under test.
 */
const unusedContext = {} as OperationContext;

/**
 * A JSON Schema is `{ [key: string]: JsonValue }`, so walking into it is a
 * walk through a union. One narrowing helper rather than a cast at each step:
 * a cast would let a schema that lost its `properties` object pass the walk
 * and fail the assertion for the wrong reason.
 */
function jsonObject(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}

/**
 * The procedure names tRPC actually exposes.
 *
 * `_def.procedures` is tRPC's runtime map; reading it needs a structural type
 * rather than the router's precise one, because the point here is to inspect
 * what was built at run time, not what the compiler believes.
 */
function routerProcedures(router: { _def: { procedures: object } }): string[] {
  return Object.keys(router._def.procedures).sort();
}

describe("the registry is the single source", () => {
  it("gives the router and the agent tools the same operations", () => {
    const fromRouter = routerProcedures(routerFromRegistry(registry));
    const fromTools = toolSchemas(registry)
      .map((t) => t.name)
      .sort();

    expect(fromRouter).toEqual(names(registry));
    expect(fromTools).toEqual(names(registry));
  });

  /**
   * The test that gives the others meaning. An operation the UI can reach and
   * the agent cannot is precisely the drift §11.0 forbids — so adding one to
   * only one side must break something.
   */
  it("fails when an operation reaches one surface but not the other", () => {
    const rogue = defineOperation({
      name: "ui_only_operation",
      kind: "read",
      autoEligible: true,
      offlineEligible: true,
      opVersion: 1,
      description: "An operation deliberately given to the router alone.",
      input: z.object({}),
      handler: async () => ({}),
    });

    const divergent = { ...registry, [rogue.name]: rogue };
    const fromRouter = routerProcedures(routerFromRegistry(divergent));
    const fromTools = toolSchemas(registry)
      .map((t) => t.name)
      .sort();

    expect(fromRouter).toContain("ui_only_operation");
    expect(fromTools).not.toContain("ui_only_operation");
    expect(fromRouter).not.toEqual(fromTools);
  });

  it("mounts the operations on the real application router", () => {
    const mounted = Object.keys(appRouter._def.procedures).filter((p) => p.startsWith("op."));
    expect(mounted.sort()).toEqual(names(registry).map((n) => `op.${n}`));
  });
});

describe("operation diagnostics", () => {
  it("reports registry execution without recording operation inputs", async () => {
    const diagnostics: object[] = [];
    const probe = defineApiOperation({
      name: "diagnostic_probe",
      kind: "read",
      autoEligible: true,
      offlineEligible: true,
      opVersion: 1,
      description: "A diagnostic probe whose input must never be copied into operational logs.",
      input: z.object({ privateValue: z.string() }),
      handler: async () => ({ ok: true as const }),
    });
    const context: OperationContext = {
      ...unusedContext,
      actor: "user",
      requestId: "req-test",
      now: new Date("2026-08-23T10:00:00Z"),
      diagnostics: (event: object) => diagnostics.push(event),
    };

    await probe.invoke({ privateValue: "secret-ledger-value" }, context);

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toMatchObject({
      scope: "registry_operation",
      phase: "start",
      requestId: "req-test",
      operation: "diagnostic_probe",
      kind: "read",
      actor: "user",
    });
    expect(diagnostics[1]).toMatchObject({
      scope: "registry_operation",
      phase: "success",
      requestId: "req-test",
      operation: "diagnostic_probe",
      kind: "read",
      actor: "user",
    });
    expect(JSON.stringify(diagnostics)).not.toContain("secret-ledger-value");
  });

  it("reports a failed operation with its complete cause chain", async () => {
    const diagnostics: object[] = [];
    const databaseError = Object.assign(new Error("database unavailable"), {
      code: "ECONNREFUSED",
    });
    const probe = defineApiOperation({
      name: "failing_diagnostic_probe",
      kind: "read",
      autoEligible: true,
      offlineEligible: true,
      opVersion: 1,
      description: "A diagnostic probe that preserves the complete causal error chain.",
      input: z.object({}),
      handler: async () => {
        throw new Error("operation failed", { cause: databaseError });
      },
    });
    const context: OperationContext = {
      ...unusedContext,
      actor: "user",
      requestId: "req-failure",
      now: new Date("2026-08-23T10:00:00Z"),
      diagnostics: (event: object) => diagnostics.push(event),
    };

    await expect(probe.invoke({}, context)).rejects.toThrow("operation failed");

    expect(diagnostics.at(-1)).toMatchObject({
      scope: "registry_operation",
      phase: "failure",
      requestId: "req-failure",
      error: {
        name: "Error",
        message: "operation failed",
        cause: {
          name: "Error",
          message: "database unavailable",
          code: "ECONNREFUSED",
        },
      },
    });
  });
});

describe("the widened form cannot skip validation", () => {
  /**
   * The contract this enforces, tested because a type nobody attacks is a
   * type nobody has checked.
   *
   * A generic consumer — the router, the agent runtime — holds operations as
   * `AnyOperation<Ctx>`, where the input type is necessarily loose. If
   * `handler` were reachable there, `handler("garbage", ctx)` would compile,
   * and the only thing standing between a model's tool call and the database
   * would be both call sites remembering to parse. `AnyOperation` omits
   * `handler`; `invoke` is the only way in, and it parses first.
   */
  it("rejects input that does not match the schema", async () => {
    const widened: AnyOperation<OperationContext> = registry.get_currencies;
    await expect(widened.invoke({ includeArchived: "yes" }, unusedContext)).rejects.toThrow();
    await expect(widened.invoke("garbage", unusedContext)).rejects.toThrow();
  });

  /**
   * A filter the server cannot apply must be a **refusal**, not a shrug.
   *
   * §13's free-text search is a trigram index this branch does not build, so
   * `search_transactions` has no `text` input. The failure mode worth naming
   * is not the missing feature — it is a plain `z.object()`, which strips an
   * unknown key silently: a caller searching for "toner" would then receive
   * a correctly-shaped page of *every* row in range, and a running total
   * (S10 §3) computed over the wrong set. `.strict()` turns that into an
   * error that names the field.
   */
  it("refuses a text filter rather than answering with unfiltered rows", async () => {
    const widened: AnyOperation<OperationContext> = registry.search_transactions;
    await expect(widened.invoke({ text: "toner" }, unusedContext)).rejects.toThrow(/text/);
  });

  /**
   * `audit_log.entity_id` is a uuid. A natural key — a currency code, a tag
   * name — must be refused here, naming the field, rather than reach Postgres
   * as bad uuid syntax that no guard maps (22P02 surfaced as `internal`).
   */
  it("refuses a non-uuid entityId on get_audit_log, by name", () => {
    const input = registry.get_audit_log.input;
    expect(() => input.parse({ entity: "currencies", entityId: "PLN" })).toThrow(/entityId/);
    expect(() =>
      input.parse({ entity: "currencies", entityId: "0f2b7a5e-8d3c-4a1b-9e6f-1c2d3e4f5a6b" }),
    ).not.toThrow();
  });

  it("still accepts the structural filters beside it", () => {
    // The refusal above must be about `text` specifically, not about
    // `.strict()` having broken every caller of this operation.
    expect(() =>
      registry.search_transactions.input.parse({ scope: "business", limit: 10 }),
    ).not.toThrow();
  });

  it("applies schema defaults on the way through", async () => {
    // The agent calls with `{}`. Defaults must arrive from the schema, not
    // from a handler, or the two callers diverge on the first optional field.
    let seen: { flag: boolean } | undefined;
    const probe = defineOperation({
      name: "probe_defaults",
      kind: "read",
      autoEligible: true,
      offlineEligible: true,
      opVersion: 1,
      description: "Records the parsed input so the test can assert defaults were applied.",
      input: z.object({ flag: z.boolean().default(true) }),
      handler: (input, _ctx: OperationContext) => {
        seen = input;
        return Promise.resolve(null);
      },
    });

    await probe.invoke({}, unusedContext);
    expect(seen).toEqual({ flag: true });
  });
});

describe("every declaration is complete", () => {
  const ops = Object.values(registry);

  it("keys the registry by the operation's own name", () => {
    for (const [key, op] of Object.entries(registry)) expect(key).toBe(op.name);
  });

  it("derives the tRPC verb from kind — reads query, writes mutate", () => {
    const r = routerFromRegistry(registry);
    for (const op of ops) {
      const procs = r._def.procedures as Record<string, { _def: { type: string } }>;
      const proc = procs[op.name];
      if (!proc) throw new Error(`no procedure for ${op.name}`);
      expect(proc._def.type, op.name).toBe(op.kind === "read" ? "query" : "mutation");
    }
  });

  it("gives the model a description long enough to be documentation", () => {
    // Written for the model to read. A four-word description is the tool
    // being misused later, at a moment nobody is watching.
    for (const op of ops) expect(op.description.length, op.name).toBeGreaterThan(40);
  });

  it("produces a JSON Schema per operation with its declared inputs", () => {
    for (const t of toolSchemas(registry)) {
      expect(t.inputSchema["type"], t.name).toBe("object");
      expect(t.inputSchema, t.name).toHaveProperty("properties");
    }
  });

  it("never marks a write auto-eligible without saying so deliberately", () => {
    // §11.2: most writes are not. This asserts the current declarations match
    // that intent rather than drifting into convenience.
    for (const op of ops) {
      if (op.kind === "write") expect(op.autoEligible, op.name).toBe(false);
    }
  });
});

describe("defineOperation refuses declarations that are always mistakes", () => {
  const base = {
    kind: "write",
    autoEligible: false,
    offlineEligible: false,
    opVersion: 1,
    description: "A description long enough to satisfy the documentation rule for models.",
    input: z.object({}),
    handler: async () => ({}),
  } as const;

  it("refuses a write with no audit spec", () => {
    expect(() => defineOperation({ ...base, name: "unaudited_write" })).toThrow(/audit/);
  });

  it("refuses a read that claims to audit", () => {
    expect(() =>
      defineOperation({
        ...base,
        name: "audited_read",
        kind: "read",
        audit: { entity: "x", action: "read", entityId: () => "id" },
      }),
    ).toThrow(/nothing to audit/);
  });

  it("refuses a name that is not lower_snake_case", () => {
    expect(() =>
      defineOperation({
        ...base,
        name: "createCounterparty",
        audit: { entity: "x", action: "y", entityId: () => "id" },
      }),
    ).toThrow(/lower_snake_case/);
  });
});

describe("offline eligibility", () => {
  /**
   * `architecture/09` and §14.3: an operation that needs server state the
   * device cannot have must never enter an outbox. The full contract test
   * arrives with the outbox; this pins the declarations it will read.
   */
  it("declares eligibility explicitly on every operation", () => {
    for (const op of Object.values(registry)) {
      expect(typeof op.offlineEligible, op.name).toBe("boolean");
      expect(op.opVersion, op.name).toBeGreaterThanOrEqual(1);
    }
  });

  /**
   * §14.3 and `architecture/09`: an operation needing server state the device
   * cannot have must never enter an outbox. The outbox itself does not exist
   * yet, so this asserts the property the drain will read — that the flag is
   * declared, and that the operations the specification names as ineligible
   * are declared that way rather than by accident.
   */
  it("refuses to queue an operation that is not offline-eligible", () => {
    // The check the drain will perform, written against today's registry so
    // that adding an ineligible operation to an outbox becomes a test failure
    // rather than a data-loss bug found on a train.
    const queueable = (name: string): boolean =>
      Object.values(registry).find((op) => op.name === name)?.offlineEligible === true;

    expect(queueable("get_currencies")).toBe(true);
    expect(queueable("create_counterparty")).toBe(false);

    // `operations.md` names these as permanently ineligible. They are not
    // declared yet; when they are, this list is what fails if one is marked
    // queueable.
    const mustNeverQueue = [
      "run_import",
      "close_period",
      "rerate_transactions",
      "materialize_occurrence",
    ];
    for (const name of mustNeverQueue) {
      const op = Object.values(registry).find((o) => o.name === name);
      if (op) expect(op.offlineEligible, name).toBe(false);
    }
  });

  it("keeps create_counterparty offline-ineligible", () => {
    // Uniqueness is on the normalized name, so two devices offline for a week
    // both create the same person and one drain fails on a constraint after
    // transactions are already attached.
    expect(registry["create_counterparty"]?.offlineEligible).toBe(false);
  });
});

/**
 * `audit_log.entity` carries the **SQL** table name.
 *
 * The registry writes the audit row on a handler's behalf
 * (`registry/operation.ts`), copying `AuditSpec.entity` straight into
 * `audit_log.entity` — so whatever a declaration spells there is what every
 * later reader must ask for. Drizzle gives two spellings of the same table:
 * the camelCase TypeScript property (`accountGroups`) and the SQL identifier
 * the row is actually stored under (`account_groups`). They are equally easy
 * to type and only one of them can ever match, which is exactly the kind of
 * divergence that reads as an empty audit trail rather than as an error —
 * `get_audit_log("accountGroups", …)` would return no rows for a row that has
 * a full history.
 *
 * `@waltning/ledger`'s `read-audit-log.ts` states the convention in prose;
 * this is what holds every declaration to it.
 */
describe("an audit spec names its table the way the database does", () => {
  // The same derivation `get_audit_log`'s Zod input is built from
  // (`audit-entities.ts`), imported rather than repeated. Two copies of a
  // derivation agree until one of them is edited, and the failure that
  // follows is an empty audit trail — which is silence, not an error.
  const sqlTableNames = new Set(AUDIT_ENTITIES);

  const auditEntities = Object.values(registry)
    .map((op) => op.audit?.entity)
    .filter((entity): entity is string => entity !== undefined);

  it("has a schema and at least one audited operation to check", () => {
    // Both guards exist because every assertion below is vacuously true over
    // an empty set — a test that passes when the registry is empty proves
    // nothing about the registry.
    expect(sqlTableNames.size).toBeGreaterThan(10);
    // One audited declaration today (`create_counterparty`). The walk below is
    // over `Object.values(registry)`, not over a list written here, so it
    // covers every declaration the registry grows — this guard only asserts
    // the walk is not vacuous.
    expect(auditEntities.length).toBeGreaterThan(0);
  });

  it("spells every entity as the SQL table name, not the camelCase property", () => {
    for (const entity of auditEntities) {
      expect(sqlTableNames.has(entity), `audit entity "${entity}"`).toBe(true);
      expect(entity, `audit entity "${entity}"`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("would reject the camelCase spelling — the check has teeth", () => {
    // The divergence this exists to catch, shown failing: `account_groups` is
    // a table, `accountGroups` is a property name that names no row anywhere.
    expect(sqlTableNames.has("account_groups")).toBe(true);
    expect(sqlTableNames.has("accountGroups")).toBe(false);
  });

  /**
   * The read side of the same hazard.
   *
   * A `z.string()` here would have made `get_audit_log("accountGroups", id)` a
   * successful call returning `[]` — indistinguishable from a row with nothing
   * recorded against it, and the one answer a caller must never be given
   * silently. The enum turns it into a validation error naming the field.
   */
  it("refuses a camelCase entity on get_audit_log and accepts the SQL name", async () => {
    const widened: AnyOperation<OperationContext> = registry.get_audit_log;
    const entityId = "11111111-1111-4111-8111-000000000001"; // RFC 4122 shaped: z.uuid() checks the version and variant nibbles

    await expect(
      widened.invoke({ entity: "accountGroups", entityId }, unusedContext),
    ).rejects.toThrow(/entity/);

    // The accepted spelling parses. `invoke` is not used here because the
    // handler would then reach for a database this test does not open — the
    // question is validation, and `input.parse` is exactly that half.
    expect(() =>
      registry.get_audit_log.input.parse({ entity: "account_groups", entityId }),
    ).not.toThrow();
  });

  it("hands the model the permitted entity names in the tool schema", () => {
    // The enum is only useful to an agent if it survives into the JSON Schema
    // the tool is described by — otherwise the model still guesses, and a
    // guessed spelling is the silent-empty-history failure again.
    const schema = toolSchemas(registry).find((t) => t.name === "get_audit_log")?.inputSchema;
    const properties = jsonObject(schema)?.["properties"];
    const values = jsonObject(jsonObject(properties)?.["entity"])?.["enum"];

    expect(values).toContain("account_groups");
    expect(values).not.toContain("accountGroups");
  });
});
