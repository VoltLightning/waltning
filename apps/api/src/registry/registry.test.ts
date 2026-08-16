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

import type { AnyOperation } from "@waltning/core";
import { defineOperation, toolSchemas } from "@waltning/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { routerFromRegistry } from "../trpc/from-registry.ts";
import { appRouter } from "../trpc/router.ts";
import type { OperationContext } from "./context.ts";
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
