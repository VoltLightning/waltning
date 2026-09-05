/**
 * The gate task's own performance claim, its automated half: "1,000 rows
 * sort ... without a visible stall." `sortLedgerRows` is the whole
 * client-side cost a header click pays — the filter itself runs in SQLite,
 * behind `searchTransactions` (`search-transactions.ts`'s own doc), so it is
 * not this file's to benchmark; this is `apps/mobile/src/ledger-screen.tsx`'s
 * "first honest data point... not its answer" made concrete and repeatable,
 * for the one piece that is pure JS regardless of platform.
 *
 * **The budget is generous on purpose.** This runs on whatever machine `pnpm
 * vitest` runs on, CI included, which is not "a laptop" in the gate task's
 * own sense — the assertion exists to catch an accidental O(n²) or a
 * per-row `JSON.parse`, not to certify real-device latency.
 */

import { toMoney } from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { type SortableLedgerRow, sortLedgerRows } from "./ledger-table-sort.ts";

const PAYEES = ["Corner Bakery", "Rewe", "Cash withdrawal", "Bank A · PLN", "Electric co-op"];

function generateRows(count: number): SortableLedgerRow[] {
  const rows: SortableLedgerRow[] = [];
  for (let i = 0; i < count; i++) {
    const day = String((i % 28) + 1).padStart(2, "0");
    rows.push({
      id: `row-${i}`,
      date: `2026-08-${day}`,
      payee: PAYEES[i % PAYEES.length] ?? "",
      category: `Category ${i % 12}`,
      account: `Account ${i % 4}`,
      scope: i % 3 === 0 ? "Business" : i % 3 === 1 ? "Shared" : "Mine",
      amountValue: toMoney(((i * 37) % 9500) / 100 - 47.5),
    });
  }
  return rows;
}

const ROWS = generateRows(1000);
const BUDGET_MS = 100;

describe("sortLedgerRows — 1,000 rows", () => {
  it.each(["date", "payee", "category", "account", "scope", "amount"] as const)(
    "sorts by %s under budget",
    (column) => {
      const start = performance.now();
      const sorted = sortLedgerRows(ROWS, { column, direction: "asc" });
      const elapsed = performance.now() - start;

      expect(sorted).toHaveLength(1000);
      expect(elapsed).toBeLessThan(BUDGET_MS);
    },
  );

  it("re-sorting repeatedly (every header click) stays fast", () => {
    const start = performance.now();
    for (let i = 0; i < 20; i++) {
      sortLedgerRows(ROWS, { column: "amount", direction: i % 2 === 0 ? "asc" : "desc" });
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(BUDGET_MS * 5);
  });
});
