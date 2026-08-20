/**
 * The case that motivated this module gets its own test, first.
 *
 * A row-level `version` answers "did anything move", and §14.2 asks "did *this
 * field* move". Every test below is a shape where those two answers differ.
 */

import { describe, expect, it } from "vitest";
import { conflictDecision, versionUnchanged } from "./conflict.ts";
import { TAX_SENSITIVE_FIELDS } from "./gate.ts";

/** The four faces of a cross-currency transfer (§14.2, §7.5). */
const TRANSFER = [["amount_original", "to_amount", "fx_rate", "to_fx_rate"]];

const row = {
  payee: "Bank A · PLN",
  category_id: "cat-food",
  is_business: false,
  amount_original: "100.00000000",
  fx_rate: "0.25000000",
};

describe("the defect this replaces", () => {
  /**
   * The whole reason for the change. Phone reads at version 1 and goes offline;
   * a laptop fixes the payee, taking the row to version 2; the phone's queued
   * `category_id` edit then arrives carrying a stale version.
   *
   * Under a row-level check this is a conflict. §14.2 says it is a merge, and
   * nothing about `category_id` moved.
   */
  it("merges a disjoint edit that a stale version reported as a conflict", () => {
    const decision = conflictDecision(
      false, // version advanced — the laptop's payee fix
      { category_id: { from: "cat-food", to: "cat-coffee" } },
      { ...row, payee: "Bank B · PLN" },
    );

    expect(decision.kind).toBe("merge");
  });

  /**
   * The same shape on a tax-sensitive field, which is where it stopped being
   * cosmetic. H16 blocks a tax-sensitive field with a stale version, so a payee
   * typo fixed elsewhere used to block this edit **permanently**, reporting
   * that another device changed `is_business`. Nothing did.
   */
  it("does not block a tax-sensitive edit because an unrelated field moved", () => {
    const decision = conflictDecision(
      false,
      { is_business: { from: false, to: true } },
      { ...row, payee: "Bank B · PLN" },
      [],
      TAX_SENSITIVE_FIELDS,
    );

    expect(decision.kind).toBe("merge");
    expect(decision).not.toHaveProperty("taxSensitive");
  });
});

describe("what still counts as a conflict", () => {
  it("flags the same field changed under the write", () => {
    const decision = conflictDecision(
      false,
      { payee: { from: "Bank A · PLN", to: "Bank C · PLN" } },
      { ...row, payee: "Bank B · PLN" },
    );

    expect(decision).toEqual({ kind: "conflict", fields: ["payee"], taxSensitive: false });
  });

  it("marks a tax-sensitive conflict so it always asks", () => {
    const decision = conflictDecision(
      false,
      { is_business: { from: false, to: true } },
      { ...row, is_business: true },
      [],
      TAX_SENSITIVE_FIELDS,
    );

    expect(decision).toMatchObject({ kind: "conflict", taxSensitive: true });
  });

  /**
   * **No false negatives, which is the property worth keeping.** The old
   * row-level check manufactured conflicts and never missed one. This must not
   * trade that away: a genuinely concurrent same-field edit is still caught,
   * with or without the version having anything to say.
   */
  it("catches a same-field edit even when the version happens to match", () => {
    const decision = conflictDecision(
      true,
      { payee: { from: "Bank A · PLN", to: "Bank C · PLN" } },
      { ...row, payee: "Bank B · PLN" },
    );

    expect(decision.kind).toBe("conflict");
  });

  it("reports clean only when nothing moved and the version agrees", () => {
    expect(conflictDecision(true, { payee: { from: "Bank A · PLN", to: "x" } }, row).kind).toBe(
      "clean",
    );
  });
});

describe("fields that are not independent", () => {
  /**
   * §14.2: merging `amount_original` from one device with `fx_rate` from
   * another produces a plausible number **neither device ever held** — and two
   * of the four faces feed generated values, so the wrong figure propagates.
   * A conflict on one face is a conflict on all four.
   */
  it("expands a conflict on one transfer face to the whole group", () => {
    const decision = conflictDecision(
      false,
      { amount_original: { from: "100.00000000", to: "120.00000000" } },
      { ...row, amount_original: "110.00000000" },
      TRANSFER,
    );

    expect(decision).toMatchObject({ kind: "conflict" });
    if (decision.kind !== "conflict") throw new Error("unreachable");
    expect([...decision.fields].sort()).toEqual([
      "amount_original",
      "fx_rate",
      "to_amount",
      "to_fx_rate",
    ]);
  });

  /**
   * Grouping must not manufacture conflicts either. A field in a declared group
   * that nobody touched, on a row where nothing in the group moved, is still a
   * merge — otherwise every transfer edit would prompt.
   */
  it("does not expand when no member of the group moved", () => {
    const decision = conflictDecision(
      false,
      { payee: { from: "Bank A · PLN", to: "Bank C · PLN" } },
      row,
      TRANSFER,
    );

    expect(decision.kind).toBe("merge");
  });
});

describe("the version fast path", () => {
  it("is a hint to look closer, never a refusal", () => {
    expect(versionUnchanged(4, 4)).toBe(true);
    expect(versionUnchanged(1, 2)).toBe(false);

    // A stale version with an untouched field is still a merge. If this ever
    // returns "conflict", the row-level defect is back.
    expect(
      conflictDecision(false, { note: { from: "", to: "x" } }, { ...row, note: "" }).kind,
    ).toBe("merge");
  });
});
