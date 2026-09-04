/**
 * Proves: flows/J02-daily-capture.md §2 ("must work offline"), architecture/14 §14.6
 * ("intent commits first"),
 * architecture/08-offline-and-concurrency.md H15 (a blocked outbox is a
 * state, never a silent drop).
 * Findings: R2 H6, R2 H1-r3 (deferral marked refused), R2 C2-r4 (deferred entry below the watermark),
 * R2 H1-r4 (a capture replayed successfully after an earlier halt is not left blocked, and the
 * update queued behind it lands).
 */
import { accountingDate } from "@waltning/core/date";
import type { Id } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { appliedSeq, openJourney, outboxEntries, transactionRows } from "./harness.ts";
import { ID, PIVOT, seedAccount, seedCurrency, seedRate } from "./seed.ts";

const CHF = money.currencyCode("CHF");

const capture = (j: ReturnType<typeof openJourney>, id: Id<"transactions">, amount = "10.00") => {
  try {
    j.session.createTransaction(
      {
        id,
        date: accountingDate("2026-03-12"),
        type: "expense",
        accountId: ID.accountEur,
        amountOriginal: money.toMoney(amount),
        currency: CHF,
        payee: "",
        note: "",
        isBusiness: false,
        isCapital: false,
        source: "manual",
      },
      j.capture,
    );
  } catch {
    // main throws out of apply after the outbox entry committed — the entry is the assertion
  }
};

function setup() {
  const j = openJourney();
  seedCurrency(j, PIVOT, { isPivot: true });
  seedCurrency(j, CHF);
  seedAccount(j, ID.accountPln, "Bank A · PLN", PIVOT);
  seedAccount(j, ID.accountEur, "Bank C · CHF", CHF);
  return j;
}

describe("J02 — a capture in a currency with no rate row", () => {
  it("commits the intent and not the row, and the entry stays pending", () => {
    const j = setup();
    try {
      capture(j, ID.txn1);
      expect(transactionRows(j)).toHaveLength(0);
      const [entry] = outboxEntries(j);
      expect(entry?.state).toBe("pending");
    } finally {
      j.close();
    }
  });

  it.fails("R2 C2-r4 — lands on the launch after a rate row arrives, even when a later entry applied in between", () => {
    const j = setup();
    try {
      capture(j, ID.txn1);
      j.session.createTransaction(
        {
          id: ID.txn2,
          date: accountingDate("2026-03-12"),
          type: "expense",
          accountId: ID.accountPln,
          amountOriginal: money.toMoney("5.00"),
          currency: PIVOT,
          payee: "",
          note: "",
          isBusiness: false,
          isCapital: false,
          source: "manual",
        },
        j.capture,
      );
      expect(appliedSeq(j)).toBe(2);
      j.relaunch();
      seedRate(j, PIVOT, CHF, "2026-03-10", "0.2300", "nbp");
      j.relaunch();
      expect(
        transactionRows(j)
          .map((r) => r.id)
          .sort(),
      ).toEqual([ID.txn1, ID.txn2].sort());
      expect(outboxEntries(j).every((e) => e.state === "pending" && e.blockedKind === null)).toBe(
        true,
      );
    } finally {
      j.close();
    }
  });

  it.fails("R2 H1-r4 — a capture replayed successfully after an earlier halt is not left blocked, and the update queued behind it lands", () => {
    const j = setup();
    try {
      capture(j, ID.txn1);
      try {
        j.session.updateTransaction(
          { id: ID.txn1, version: 1, patch: { note: "later" } },
          j.capture,
        );
      } catch {
        // same reason as `capture` — the outbox entry is the assertion
      }
      j.relaunch();
      seedRate(j, PIVOT, CHF, "2026-03-10", "0.2300", "nbp");
      j.relaunch();
      const rows = transactionRows(j);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.note).toBe("later");
      expect(outboxEntries(j).map((e) => e.state)).toEqual(["pending", "pending"]);
    } finally {
      j.close();
    }
  });
});
