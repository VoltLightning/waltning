/**
 * §11.2's gate, at the point it is actually applied.
 *
 * `gate.test.ts` next door tests `gateDecision` — the pure function that
 * decides. It has always passed, and it proved nothing about the system,
 * because **nothing called it**. §11.2 says every write gates by default and
 * the code had no default at all: the guarantee held exactly as far as whoever
 * wrote the next caller remembered it.
 *
 * So these tests do not re-check the decision. They check that a gated call
 * *does not run* — which is the only form of the guarantee that survives
 * someone forgetting.
 */

import { counterparties } from "@waltning/db/schema";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Scratch, scratchDatabase } from "../../../../packages/db/src/test/scratch.ts";
import { DomainError } from "../common/errors.ts";
import type { Actor, OperationContext } from "./context.ts";
import { registry } from "./index.ts";

let s: Scratch;

beforeAll(async () => {
  s = await scratchDatabase("gate");
}, 60_000);

afterAll(async () => {
  await s?.drop();
});

const NOW = new Date("2026-08-17T10:00:00Z");

function ctx(actor: Actor, grant: OperationContext["grant"] = null): OperationContext {
  return { db: s.db, actor, requestId: "test", now: NOW, grant };
}

/** `create_counterparty` is declared `autoEligible: false` — never automatic. */
const create = registry.create_counterparty;

async function counterpartyCount(name: string): Promise<number> {
  const [row] = await s.db
    .select({ n: count() })
    .from(counterparties)
    .where(eq(counterparties.name, name));
  return Number(row?.n ?? 0);
}

describe("an agent write", () => {
  it("is refused, and writes nothing", async () => {
    const name = "Gated Placeholder";

    const error = await create.invoke({ name }, ctx("agent")).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe("approval_required");

    // The half that matters. A gate that reports a refusal after the row exists
    // is not a gate — and this is the assertion that would have failed for the
    // whole time `gateDecision` had no caller.
    expect(await counterpartyCount(name)).toBe(0);
  });

  it("says why, so a client can build the approval card", async () => {
    const error = (await create
      .invoke({ name: "Reason Placeholder" }, ctx("agent"))
      .catch((e: unknown) => e)) as DomainError;

    expect(error.details?.reason).toBe("not-auto-eligible");
  });

  it("is still refused under a grant that names it", async () => {
    // A grant lifts the default; it does not lift `autoEligible: false`.
    // Naming a counterparty is cheap to defer and expensive to merge, which is
    // why the declaration says never — and a grant must not be able to
    // overrule a declaration, or the declaration is advice.
    const name = "Granted Placeholder";
    const grant = { operations: [create.name], expiresAt: new Date("2026-08-17T11:00:00Z") };

    const error = await create.invoke({ name }, ctx("agent", grant)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DomainError);
    expect(await counterpartyCount(name)).toBe(0);
  });

  it("is refused once a grant has expired", async () => {
    const grant = { operations: [create.name], expiresAt: new Date("2026-08-17T09:00:00Z") };
    const error = await create
      .invoke({ name: "Expired Placeholder" }, ctx("agent", grant))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DomainError);
  });
});

describe("a person's write", () => {
  it("runs — pressing save is the approval", async () => {
    // Gating this would show an approval card for every action the user just
    // took, which trains people to dismiss the card that matters.
    const name = "User Placeholder";
    const row = await create.invoke({ name }, ctx("user"));

    expect(row.name).toBe(name);
    expect(await counterpartyCount(name)).toBe(1);
  });
});

describe("a read", () => {
  it("is never gated, even for an agent", async () => {
    // Reads do not gate at all (§11.2). An agent that cannot look things up
    // cannot propose anything worth approving.
    const currencies = await registry.get_currencies.invoke({}, ctx("agent"));
    expect(Array.isArray(currencies)).toBe(true);
  });
});
