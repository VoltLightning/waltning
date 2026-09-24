/**
 * **A kind with no fixture row is a kind whose screens are unproven**, and
 * four of the nine were in exactly that state.
 *
 * `tokens.ts`'s `accountKindRamp` gives every `ACCOUNT_KIND` a permanent
 * colour and `kind-tint.ts` refuses to compile without one, so the *code* has
 * been exhaustive since the register redesign. The data never was: both loan
 * kinds, `investment` and `other` appeared in no fixture and no demo, so their
 * colours were rendered by nothing, the register's own sections had no loans
 * to sort last, and a contrast defect in two of the nine ramp entries could
 * ship without a single test noticing.
 *
 * This is the census that closes it. It asserts against the enum rather than a
 * written-down list of nine, so the day a tenth kind is added this fails until
 * the fixture carries one — the same shape as `kindTint`'s `mustHave()`, one
 * layer down.
 *
 * Deliberately a pure-data test with no database: what is under test is the
 * *list*, and making it wait on Postgres would be a slower way to ask the same
 * question.
 */

import { ACCOUNT_KIND } from "@waltning/schema/enums";
import { describe, expect, it } from "vitest";
import { ACCOUNTS, MOVES, OBLIGATIONS, PATTERNS } from "./fixture.ts";

describe("the seeded fixture", () => {
  it("carries at least one account of every kind", () => {
    const present = new Set(ACCOUNTS.map((account) => account.kind));
    const missing = ACCOUNT_KIND.filter((kind) => !present.has(kind));
    expect(missing, "kinds with no fixture account — their screens render nothing").toEqual([]);
  });

  it("names every account distinctly, so a register row is identifiable", () => {
    const names = ACCOUNTS.map((account) => account.name);
    expect(new Set(names).size, "duplicate account names").toBe(names.length);
    const refs = ACCOUNTS.map((account) => account.ref);
    expect(new Set(refs).size, "duplicate refs — the external_id upsert keys on these").toBe(
      refs.length,
    );
  });

  /**
   * **More than one of the kinds a person really does hold several of.** A
   * fixture with one bank and one card renders a register whose sections are
   * all single rows, which is the state that made the first register redesign
   * look finished when it was not: nothing showed what a section of four reads
   * like, so the subtotal, the inset rules and the collapse control were all
   * being judged against a list that never exercised them.
   */
  it("holds several accounts of the kinds people hold several of", () => {
    for (const kind of ["bank", "card"] as const) {
      const held = ACCOUNTS.filter((account) => account.kind === kind);
      expect(held.length, `${kind} accounts — a section of one proves no section`).toBeGreaterThan(
        1,
      );
    }
  });

  /**
   * **An account with a balance and no history proves nothing.** A section
   * draws from the opening balance alone, so the four late kinds looked
   * present the moment they were added — while a loan that never moves cannot
   * show that its figure, its colour and its sign survive a month of use.
   */
  it("gives every account some activity", () => {
    // Either leg of a `MOVES` transfer counts: a loan is repaid rather than
    // spent from, and that arrives as a transfer's destination.
    const used = new Set([
      ...PATTERNS.map((pattern) => pattern.account),
      ...MOVES.flatMap((move) => [move.from, move.to]),
    ]);
    const idle = ACCOUNTS.filter((account) => !used.has(account.ref)).map((a) => a.ref);
    expect(idle, "accounts with an opening balance and no transactions").toEqual([]);
  });

  /**
   * §6.6's two directions, as two kinds rather than one signed balance — and
   * the fixture has to show both signs or the register's money colours are
   * only half rendered.
   */
  it("opens a payable loan negative and a receivable one positive", () => {
    const payable = ACCOUNTS.find((account) => account.kind === "loan_payable");
    const receivable = ACCOUNTS.find((account) => account.kind === "loan_receivable");
    expect(payable?.openingBalance.startsWith("-"), "money you owe reads negative").toBe(true);
    expect(receivable?.openingBalance.startsWith("-"), "money owed to you reads positive").toBe(
      false,
    );
  });

  /**
   * **S12 was an empty state on a seeded database.** The fixture wrote eleven
   * accounts and two years of rows and not one counterparty, so the whole
   * Counterparties tab — both segments, the People/Companies grouping, the
   * direction totals — had nothing to render on a database that was otherwise
   * full, and could not be looked at while it was being built.
   *
   * Both directions, because the two are different money colours and a
   * fixture with only one proves half the screen.
   */
  it("gives the directory somebody in each direction", () => {
    const owedToYou = OBLIGATIONS.filter((o) => o.role === "debt" && o.type === "expense");
    const youOwe = OBLIGATIONS.filter((o) => o.role === "debt" && o.type === "income");
    expect(owedToYou.length, "somebody who owes you").toBeGreaterThan(0);
    expect(youOwe.length, "somebody you owe").toBeGreaterThan(0);
  });

  /**
   * **Saved and square is the state the two segments exist to tell apart.**
   * *Open* filters on having something outstanding, so a directory where
   * everyone is open makes the filter look like it works while filtering
   * nothing — both a settled obligation and a `contribution`, which is the
   * role that deliberately moves no balance (§6.6), are here for that.
   */
  it("keeps somebody in the directory with nothing outstanding", () => {
    expect(
      OBLIGATIONS.some((o) => o.settle === true),
      "a debt settled in full",
    ).toBe(true);
    expect(
      OBLIGATIONS.some((o) => o.role === "contribution"),
      "a row whose role moves no balance",
    ).toBe(true);
  });

  /**
   * **An income row under an expense leaf is refused outright** by the
   * category-kind rule (H1) — silently, row by row, which is how the loan
   * repayments sat at their opening figure for a whole fixture before anyone
   * noticed. Both directions of an obligation have to name a leaf of their own
   * kind, and this is the cheap half of that check: the leaf names are
   * verified against the real taxonomy by the fixture run itself.
   */
  it("never files an obligation against a leaf of the wrong kind", () => {
    const EXPENSE_ONLY = ["Eating out", "Taxi", "Repayment made"];
    const wrong = OBLIGATIONS.filter(
      (o) => o.type === "income" && EXPENSE_ONLY.includes(o.category),
    );
    expect(
      wrong.map((o) => o.enteredName),
      "income rows on expense leaves",
    ).toEqual([]);
  });
});
