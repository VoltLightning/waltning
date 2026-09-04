/**
 * Proves: architecture/08 H13 ("twice is once"). Findings: none.
 *
 * `recoverOnLaunch` (`../recover.ts`) replays every outbox entry above the
 * replica's `applied_seq` watermark by re-invoking its executor. Every local
 * executor `create_transaction`'s own upsert (`transactions/create-transaction.executor.ts`,
 * `insertTransaction`) — `onConflictDoUpdate` keyed on the id the entry
 * already carries, setting the same field values it would on a fresh insert
 * and never touching `version`. Replaying the same entry twice with the
 * watermark reset to zero between each pass should therefore be a no-op on
 * both row counts and every row's own `version` — "twice is once", stated
 * for the replica rather than the outbox queue.
 */

import { accountingDate } from "@waltning/core/date";
import { id as brandId } from "@waltning/core/id";
import * as money from "@waltning/core/money";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { appliedSeq, openJourney, outboxEntries, transactionRows } from "../journeys/harness.ts";
import { ID, PIVOT, seedAccount, seedCurrency } from "../journeys/seed.ts";
import { recoverOnLaunch } from "../recover.ts";
import { ledgerRegistry } from "../registry.ts";
import { ledgerSchema } from "../schema-map.ts";

describe("outbox replay — architecture/08 H13, twice is once", () => {
  it("replaying the same three entries twice leaves row counts and versions unchanged", () => {
    const j = openJourney();
    try {
      seedCurrency(j, PIVOT, { isPivot: true });
      seedAccount(j, ID.accountPln, "Bank A · PLN", PIVOT);

      const thirdId = brandId<"transactions">("77777777-7777-4777-8777-777777777777");
      const ids = [ID.txn1, ID.txn2, thirdId];

      for (const [index, id] of ids.entries()) {
        j.session.createTransaction(
          {
            id,
            date: accountingDate("2026-03-01"),
            type: "expense",
            accountId: ID.accountPln,
            amountOriginal: money.toMoney(`${10 + index}.00`),
            currency: PIVOT,
            payee: "",
            note: "",
            isBusiness: false,
            isCapital: false,
            source: "manual",
          },
          j.capture,
        );
      }

      expect(outboxEntries(j)).toHaveLength(3);
      const watermark = appliedSeq(j);
      expect(watermark).toBeGreaterThanOrEqual(3);

      const snapshot = () => {
        const rows = transactionRows(j);
        return {
          count: rows.length,
          versions: [...rows]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((r) => [r.id, r.version]),
        };
      };

      const before = snapshot();

      const resetWatermark = (): void => {
        j.raw()
          .replica.db.update(ledgerSchema.localMeta)
          .set({ appliedSeq: 0 })
          .where(eq(ledgerSchema.localMeta.id, 1))
          .run();
      };

      resetWatermark();
      const first = recoverOnLaunch(j.raw(), ledgerRegistry);
      expect(first.halted, `first replay halted: ${JSON.stringify(first.halted)}`).toBeNull();
      expect(first.replayed).toHaveLength(3);
      expect(appliedSeq(j)).toBe(watermark);
      expect(snapshot()).toEqual(before);

      resetWatermark();
      const second = recoverOnLaunch(j.raw(), ledgerRegistry);
      expect(second.halted, `second replay halted: ${JSON.stringify(second.halted)}`).toBeNull();
      expect(second.replayed).toHaveLength(3);
      expect(appliedSeq(j)).toBe(watermark);
      expect(snapshot()).toEqual(before);
    } finally {
      j.close();
    }
  });
});
