/**
 * The approval gate, and the declaration check behind it — §11.2.
 *
 * The gate itself is a pure decision, so most of this is fast. The test that
 * earns its place is the last one: an operation whose input can write a
 * tax-sensitive field must *declare* it, and forgetting fails the build.
 *
 * That matters because the operation this exists for does not exist yet.
 * `update_transaction` is both recategorisation — the thing you would obviously
 * auto-grant — and the only way to write `is_business`. When someone writes it,
 * they will be thinking about categories. The check is what remembers the rest.
 */

import { gateDecision, sensitiveFieldsWritten, TAX_SENSITIVE_FIELDS } from "@waltning/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { registry } from "./index.ts";

const NOW = new Date("2026-08-17T12:00:00Z");
const LATER = new Date("2026-08-17T13:00:00Z");
const EARLIER = new Date("2026-08-17T11:00:00Z");

const recategorise = {
  name: "update_transaction",
  kind: "write",
  autoEligible: true,
  taxSensitiveFields: ["is_business", "date"],
} as const;

describe("reads and ordinary writes", () => {
  it("never gates a read", () => {
    expect(
      gateDecision({ ...recategorise, kind: "read" }, { is_business: true }, null, NOW),
    ).toEqual({ gated: false });
  });

  it("gates a write by default — no grant, no auto", () => {
    const d = gateDecision(recategorise, { category_id: "x" }, null, NOW);
    expect(d).toMatchObject({ gated: true, reason: "write-by-default" });
  });

  it("lets a grant lift the gate for the operation it names", () => {
    const grant = { operations: ["update_transaction"], expiresAt: LATER };
    expect(gateDecision(recategorise, { category_id: "x" }, grant, NOW)).toEqual({ gated: false });
  });

  it("does not let a grant cover an operation it does not name", () => {
    const grant = { operations: ["something_else"], expiresAt: LATER };
    expect(gateDecision(recategorise, { category_id: "x" }, grant, NOW)).toMatchObject({
      gated: true,
    });
  });

  it("treats an expired grant as no grant", () => {
    const grant = { operations: ["update_transaction"], expiresAt: EARLIER };
    expect(gateDecision(recategorise, { category_id: "x" }, grant, NOW)).toMatchObject({
      reason: "grant-expired",
    });
  });

  it("never auto-runs an operation declared not auto-eligible", () => {
    const grant = { operations: ["update_transaction"], expiresAt: LATER };
    expect(
      gateDecision({ ...recategorise, autoEligible: false }, { category_id: "x" }, grant, NOW),
    ).toMatchObject({ reason: "not-auto-eligible" });
  });
});

describe("the field boundary beats the grant boundary", () => {
  /**
   * The motivating failure: grant recategorisation for a session and a single
   * tool call moves rows out of the tax view with no approval and no
   * distinguishing mark. Under ryczałt the damaging direction is *out*.
   */
  it("gates a call that writes a tax-sensitive field even under a valid grant", () => {
    const grant = { operations: ["update_transaction"], expiresAt: LATER };
    const d = gateDecision(recategorise, { category_id: "x", is_business: true }, grant, NOW);

    expect(d).toMatchObject({ gated: true, reason: "tax-sensitive-field" });
    // The approval card shows only the sensitive fields; the rest are applied.
    expect(d).toMatchObject({ fields: ["is_business"] });
  });

  it("gates on the field the call writes, not on every field it could write", () => {
    const grant = { operations: ["update_transaction"], expiresAt: LATER };
    // Same operation, same grant, no sensitive field in this payload.
    expect(gateDecision(recategorise, { category_id: "x" }, grant, NOW)).toEqual({ gated: false });
  });

  it("reports every sensitive field the call touches", () => {
    const grant = { operations: ["update_transaction"], expiresAt: LATER };
    const d = gateDecision(recategorise, { is_business: true, date: "2026-01-01" }, grant, NOW);
    expect(d).toMatchObject({ fields: ["is_business", "date"] });
  });

  it("checks the field before the grant, so the audit trail cannot be misread", () => {
    // With no grant at all the answer is still tax-sensitive rather than
    // write-by-default: the reason recorded is why it was really gated.
    expect(gateDecision(recategorise, { is_business: true }, null, NOW)).toMatchObject({
      reason: "tax-sensitive-field",
    });
  });
});

describe("every operation declares the sensitive fields it can write", () => {
  /**
   * The check that outlives this file's other tests. `update_transaction` does
   * not exist yet; when it does, whoever writes it will be thinking about
   * categories, not about `is_business`. Forgetting the declaration should fail
   * the build rather than quietly widen what a grant covers.
   */
  const shapeOf = (input: unknown): string[] => {
    const shape = (input as { shape?: Record<string, unknown> }).shape;
    return shape ? Object.keys(shape) : [];
  };

  it("declares any tax-sensitive key its input schema accepts", () => {
    const undeclared: string[] = [];

    for (const op of Object.values(registry)) {
      const declared = new Set(op.taxSensitiveFields ?? []);
      for (const key of shapeOf(op.input)) {
        if ((TAX_SENSITIVE_FIELDS as readonly string[]).includes(key) && !declared.has(key)) {
          undeclared.push(`${op.name} accepts "${key}" without declaring it tax-sensitive`);
        }
      }
    }

    expect(undeclared, "undeclared tax-sensitive fields").toEqual([]);
  });

  it("finds the schema keys at all, so the check cannot pass vacuously", () => {
    // A broken shape reader would make the assertion above trivially true.
    expect(shapeOf(registry.create_counterparty.input)).toContain("name");
    expect(shapeOf(z.object({ is_business: z.boolean() }))).toEqual(["is_business"]);
  });

  it("declares nothing it cannot write", () => {
    for (const op of Object.values(registry)) {
      const keys = new Set(shapeOf(op.input));
      for (const declared of op.taxSensitiveFields ?? []) {
        expect(keys.has(declared), `${op.name} declares "${declared}" but cannot write it`).toBe(
          true,
        );
      }
    }
  });
});

describe("sensitiveFieldsWritten", () => {
  it("returns nothing when the operation declares nothing", () => {
    expect(sensitiveFieldsWritten({}, { is_business: true })).toEqual([]);
  });

  it("ignores a non-object payload rather than throwing", () => {
    expect(sensitiveFieldsWritten(recategorise, "garbage")).toEqual([]);
    expect(sensitiveFieldsWritten(recategorise, null)).toEqual([]);
  });
});
