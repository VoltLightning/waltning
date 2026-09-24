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
    // Either leg counts: a savings account nothing spends from still sees
    // money, and it arrives as a transfer's destination.
    const moved = new Set(
      DEMO_PATTERNS.flatMap((pattern) =>
        pattern.toAccount === undefined ? [pattern.account] : [pattern.account, pattern.toAccount],
      ),
    );
    const idle = DEMO_ACCOUNTS.filter(
      (account) => account.kind !== "clearing" && !moved.has(account.ref),
    ).map((account) => account.ref);
    expect(idle, "accounts with a balance and no transactions").toEqual([]);
  });

  /**
   * **A flag nothing sets is a tag nobody sees.** `BalanceRow` has drawn a
   * `BIZ` tag since S16 §4 and no demo account was ever business, so the
   * branch rendered in a story and never on a screen.
   */
  it("mark one account business, so the BIZ tag is drawn at all", () => {
    expect(DEMO_ACCOUNTS.some((account) => account.isBusiness === true)).toBe(true);
  });

  it("only spend through categories the demo actually creates", () => {
    const known = new Set(DEMO_CATEGORIES.map((category) => category.name));
    const unknown = DEMO_PATTERNS.filter((p) => p.toAccount === undefined)
      .map((p) => p.category)
      .filter((name) => !known.has(name));
    expect([...new Set(unknown)], "patterns naming a category nothing seeds").toEqual([]);
  });

  /**
   * **A transfer carries no category, and §7.5 is why**: it moves money
   * between two of your own accounts, so categorising it would double count
   * it against the same spend total.
   */
  it("give transfers a destination and no category", () => {
    for (const pattern of DEMO_PATTERNS.filter((p) => p.toAccount !== undefined)) {
      expect(pattern.category, `${pattern.enteredName} is a transfer`).toBe("");
      expect(pattern.toAccount, `${pattern.enteredName}'s destination`).not.toBe(pattern.account);
    }
  });

  /**
   * **The demo has to circulate, not accumulate.** Before the transfers
   * existed money arrived in the banks every month and left the wallet every
   * month with nothing carrying it back: 26 months in the current account
   * held 248 000 zł and cash was 3 585 zł *negative*. Nobody can judge a
   * screen against figures nobody could hold.
   *
   * So: every account somebody spends from is topped up or paid off by a
   * transfer. Stated as a property rather than a number, because the numbers
   * are meant to be tuned and the rule is not.
   */
  it("top up or pay off every account that is spent from", () => {
    const spendsFrom = new Set(
      DEMO_PATTERNS.filter((p) => p.toAccount === undefined && p.type === "expense").map(
        (p) => p.account,
      ),
    );
    const fed = new Set([
      ...DEMO_PATTERNS.filter((p) => p.toAccount !== undefined).map((p) => p.toAccount),
      ...DEMO_PATTERNS.filter((p) => p.toAccount === undefined && p.type === "income").map(
        (p) => p.account,
      ),
    ]);
    const drains = [...spendsFrom].filter((account) => !fed.has(account));
    expect(drains, "accounts that only ever lose money").toEqual([]);
  });
});
