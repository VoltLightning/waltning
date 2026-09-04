/**
 * Proves: architecture/14 §14.6 — the watermark and every row survive a relaunch.
 * Findings: `CreateTransactionInput` is the branded `z.output`, not the raw
 * request shape `executors.test.ts` feeds `writeLocally` — every defaulted
 * field (`payee`, `note`, `isBusiness`, `isCapital`, `source`) has to be
 * spelled out here, and every id/amount/date/currency has to be pre-branded,
 * because a session call is typed as the *parsed* input, unlike the raw JSON
 * an executor re-parses.
 */
import { accountingDate } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { appliedSeq, openJourney, outboxEntries, transactionRows } from "./harness.ts";
import { ID, PIVOT, seedAccount, seedCurrency } from "./seed.ts";

describe("journey harness", () => {
  it("keeps rows and the watermark across a relaunch", () => {
    const j = openJourney();
    try {
      seedCurrency(j, PIVOT, { isPivot: true });
      seedAccount(j, ID.accountPln, "Bank A · PLN", PIVOT);
      j.session.createTransaction(
        {
          id: ID.txn1,
          date: accountingDate("2026-03-12"),
          type: "expense",
          accountId: ID.accountPln,
          amountOriginal: money.toMoney("18.00"),
          currency: PIVOT,
          payee: "",
          note: "",
          isBusiness: false,
          isCapital: false,
          source: "manual",
        },
        j.capture,
      );
      const before = appliedSeq(j);
      expect(before).toBe(1);
      j.relaunch();
      expect(transactionRows(j)).toHaveLength(1);
      expect(appliedSeq(j)).toBe(before);
      expect(outboxEntries(j).map((e) => e.state)).toEqual(["pending"]);
    } finally {
      j.close();
    }
  });
});
