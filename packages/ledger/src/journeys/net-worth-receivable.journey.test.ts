/**
 * Proves: computations.md §3 ("Net worth — mine and ours") — "Receivables
 * are excluded — lending is an expense and repayment an unearned inflow
 * (§6.6). Net worth is money you hold."
 *
 * Findings: H1 (fix round 1) — both `readAccountsForNetWorth`
 * (`@waltning/ledger`) and `packages/db/src/figures/net-worth.ts` folded
 * every account's balance into §3 regardless of `kind`, so a
 * `loan_receivable` account counted the same lent money twice: once as the
 * ordinary account it left (an expense, already lower by that amount) and
 * again as the receivable's own opening balance. `loan_payable` is a real
 * liability and stays in.
 */

import { id as brandId } from "@waltning/core/id";
import { describe, expect, it } from "vitest";
import { openJourney } from "./harness.ts";
import { ID, PIVOT, seedAccount, seedCurrency } from "./seed.ts";

const RECEIVABLE = brandId<"accounts">("44444444-4444-4444-8444-444444444444");
const PAYABLE = brandId<"accounts">("55555555-5555-4555-8555-555555555555");

function setup() {
  const j = openJourney();
  seedCurrency(j, PIVOT, { isPivot: true, decimals: 2 });
  seedAccount(j, ID.accountPln, "Wallet", PIVOT, { openingBalance: "100", kind: "cash" });
  return j;
}

describe("§3 net worth excludes loan_receivable", () => {
  it("a loan_receivable account never adds to mine or ours", () => {
    const j = setup();
    try {
      seedAccount(j, RECEIVABLE, "Loan to Nina", PIVOT, {
        openingBalance: "60",
        kind: "loan_receivable",
      });

      const [row] = j.session.listNetWorth();
      // Break it once: delete the `kind !== "loan_receivable"` filter in
      // `readAccountsForNetWorth` and this becomes `160.00`.
      expect(row).toMatchObject({ mine: "100.00000000", ours: "100.00000000" });
    } finally {
      j.close();
    }
  });

  it("a loan_payable account still counts — a debt owed is a real liability", () => {
    const j = setup();
    try {
      seedAccount(j, PAYABLE, "Loan from Marek (my)", PIVOT, {
        openingBalance: "-40",
        kind: "loan_payable",
      });

      const [row] = j.session.listNetWorth();
      expect(row).toMatchObject({ mine: "60.00000000", ours: "60.00000000" });
    } finally {
      j.close();
    }
  });
});
