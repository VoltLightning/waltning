/**
 * @vitest-environment jsdom
 *
 * The demo, loaded into a real ledger — the same calls the Developer screen
 * makes, against the replica's own executors and triggers.
 *
 * **Why this exists.** `load-demo.test.ts` drives the loader through a fake
 * target that accepts everything, so it could not see the day the ledger
 * started refusing a repayment written as an ordinary row (§6.6: a repayment
 * is written by `settle_debt`, and nothing else). Five rows were refused,
 * the Developer screen stopped restarting after a load, and every unit test
 * stayed green. Only the real engine knows what it refuses.
 */

import { loadDemo } from "@waltning/client/ledger/demo/load-demo";
import { describe, expect, it, vi } from "vitest";

// The harness mounts screens, so it imports the router; nothing here navigates.
vi.mock("expo-router", () => ({}));
vi.mock("expo-router/ui", () => ({}));

const { createJourneyLedger } = await import("./journey-harness");

const TODAY = "2026-10-20";
const LOCALES = ["en", "pl", "de", "ru", "be"] as const;

describe("the demo, in a real ledger", () => {
  it.each(LOCALES)("loads in %s with nothing refused", async (locale) => {
    const { controller, close } = createJourneyLedger();
    try {
      const snapshot = controller.getSnapshot();
      const outcome = await loadDemo(
        {
          createAccount: controller.createAccount,
          createCategory: controller.createCategory,
          createTransaction: controller.createTransaction,
          convertCategory: controller.convertCategory,
          createCounterparty: controller.createCounterparty,
          settleDebt: controller.settleDebt,
          setManualRate: controller.setManualRate,
          existingCategories: snapshot.categoryTree,
          pivot: snapshot.currencies.find((currency) => currency.isPivot)?.code ?? "",
          batch: controller.batch,
        },
        TODAY,
        3,
        undefined,
        locale,
      );
      expect(outcome.refused, "a refusal stops the Developer screen restarting").toBe(0);
      expect(outcome.transactions).toBeGreaterThan(0);
    } finally {
      close();
    }
  });
});
