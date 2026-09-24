/**
 * **The demo ledger is the thing a reader opens to see what the app is**, so a
 * kind missing from it is a kind nobody has ever looked at.
 *
 * Five of the nine were missing: both loan kinds, `investment` and `other`
 * appeared in no account list at all, and the register's `accountKindRamp`
 * gave each of them a permanent colour that nothing rendered. The screens were
 * exhaustive — `kind-tint.ts` refuses to compile without an entry per kind —
 * while the data they drew was not, which is the gap that let a register
 * redesign look finished against a list of four single-row sections.
 *
 * These assert against `ACCOUNT_KIND` rather than a written-down list of nine,
 * so a tenth kind fails here until the demo carries one.
 */

import { ACCOUNT_KIND } from "@waltning/core/registry/inputs";
import { describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS, DEMO_CATEGORIES, DEMO_PATTERNS } from "./demo-plan.ts";

describe("the demo ledger's accounts", () => {
  it("cover every kind", () => {
    const present = new Set(DEMO_ACCOUNTS.map((account) => account.kind));
    const missing = ACCOUNT_KIND.filter((kind) => !present.has(kind));
    expect(missing, "kinds the demo never draws").toEqual([]);
  });

  /**
   * A section of one proves no section. The register groups by kind and draws
   * a subtotal, an inset rule between rows and a collapse control per group,
   * and a one-row group shows none of them.
   */
  it("hold several of the kinds people hold several of", () => {
    for (const kind of ["bank", "card"] as const) {
      const held = DEMO_ACCOUNTS.filter((account) => account.kind === kind);
      expect(held.length, `${kind} accounts`).toBeGreaterThan(1);
    }
  });

  /**
   * §6.6's two directions, and the register's money colours need both signs
   * to be rendered at all: money owed to you reads positive, money you owe
   * reads negative.
   */
  it("open a payable loan negative and a receivable one positive", () => {
    const payable = DEMO_ACCOUNTS.find((a) => a.kind === "loan_payable");
    const receivable = DEMO_ACCOUNTS.find((a) => a.kind === "loan_receivable");
    expect(payable?.openingBalance.startsWith("-"), "money you owe").toBe(true);
    expect(receivable?.openingBalance.startsWith("-"), "money owed to you").toBe(false);
  });

  /**
   * **Every account moves, except the one whose whole point is that it does
   * not open with money in it.** `clearing` is funded by a transfer rather
   * than an opening balance — a pot with an opening balance is a pot nobody
   * laid out, which is not the state J08 is about — so it is named here
   * rather than silently exempted by a weaker assertion.
   */
  it("all see activity, the clearing pot excepted", () => {
    const moved = new Set(DEMO_PATTERNS.map((pattern) => pattern.account));
    const idle = DEMO_ACCOUNTS.filter(
      (account) => account.kind !== "clearing" && !moved.has(account.ref),
    ).map((account) => account.ref);
    expect(idle, "accounts with a balance and no transactions").toEqual([]);
  });

  it("only spend through categories the demo actually creates", () => {
    const known = new Set(DEMO_CATEGORIES.map((category) => category.name));
    const unknown = DEMO_PATTERNS.map((p) => p.category).filter((name) => !known.has(name));
    expect([...new Set(unknown)], "patterns naming a category nothing seeds").toEqual([]);
  });
});
