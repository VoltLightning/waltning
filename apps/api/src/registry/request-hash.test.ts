/**
 * `requestHash`, pinned — no database, because none of this needs one.
 *
 * The hash is what `findReceipt` compares a retry against. If it ever changes
 * value for the same input, every outbox entry already queued becomes "a
 * different request carrying a used entry id" and is refused — one silent edit
 * turning the replay protection into a wall.
 *
 * That is not hypothetical. The separator between the operation name and its
 * payload was a **literal NUL byte** in the source: invisible in every editor,
 * enough for git to classify the file as binary so it never showed a diff in
 * review, and silently removable by anything that normalises text. It is `\0`
 * now — the same two bytes reach `sha256`, and a human can see it.
 */

import { describe, expect, it } from "vitest";
import { requestHash } from "./idempotency.ts";

describe("requestHash", () => {
  /**
   * The value, not just the behaviour.
   *
   * Every property below would still hold if the algorithm changed wholesale,
   * and a wholesale change is exactly what breaks queued entries. This is the
   * assertion that costs someone a deliberate decision.
   */
  it("has not changed value", () => {
    expect(requestHash("create_counterparty", { name: "Placeholder Ltd", kind: "person" })).toBe(
      "00f7220c6f3c39e721e27cf9de2358a5dcca3e84dc00d5bda85ae96169e1d68c",
    );
  });

  /**
   * **Written first as a claim about the separator, and the claim was wrong.**
   *
   * The comment beside `\0` said it is what stops `("ab","c")` colliding with
   * `("a","bc")`. Removing the separator and re-running left this passing:
   * `canonical` emits a self-delimiting JSON value, so the payload always
   * begins with a character an operation name cannot contain, and the two were
   * never ambiguous. A test that passes with and without the thing it claims to
   * test is worth less than none.
   *
   * So this asserts the property that is actually true and actually matters —
   * the operation name and the payload cannot be confused for one another —
   * without pretending to prove which mechanism is holding it up. The separator
   * stays as a floor for a future `canonical`; `has not changed value` above is
   * what notices if it goes.
   */
  it("cannot confuse the operation name with its payload", () => {
    expect(requestHash("ab", "c")).not.toBe(requestHash("a", "bc"));
    expect(requestHash("a", ["b"])).not.toBe(requestHash("a[", ["b"]));
  });

  it("ignores property order, so a retry is not a new intention", () => {
    // The reason `canonical` sorts at all: a payload re-serialized by a
    // different runtime would otherwise read as a different request and be
    // refused by its own retry.
    expect(requestHash("op", { a: 1, b: 2 })).toBe(requestHash("op", { b: 2, a: 1 }));
  });

  it("sorts recursively, because nested objects have the same problem", () => {
    expect(requestHash("op", { x: { a: 1, b: 2 } })).toBe(requestHash("op", { x: { b: 2, a: 1 } }));
  });

  it("distinguishes payloads that differ", () => {
    // Guards the two above: an implementation that returned a constant would
    // satisfy both order tests perfectly.
    expect(requestHash("op", { a: 1 })).not.toBe(requestHash("op", { a: 2 }));
    expect(requestHash("op_a", { a: 1 })).not.toBe(requestHash("op_b", { a: 1 }));
  });

  it("keeps array order, which is meaningful", () => {
    // Sorting keys must not become sorting everything: `lines` is ordered, and
    // two transactions with the same lines in a different order are different.
    expect(requestHash("op", { lines: [1, 2] })).not.toBe(requestHash("op", { lines: [2, 1] }));
  });
});
