import { describe, expect, it } from "vitest";
import { activeFilterDimensions } from "./use-filter-exclusion-counts.ts";
import { EMPTY_LEDGER_FILTER } from "./use-ledger-filters.ts";

/**
 * The hook's own wiring — a count per active control, subtracted from the
 * count on screen — is proven end to end against a real controller in
 * `apps/mobile/src/ledger-screen.desk.test.tsx` ("an active filter says how
 * many rows it excludes"), because what matters there is that the number
 * reaches the rail. What is worth stating here is the decision that governs
 * *how many queries run at all*: an inactive control excludes nothing by
 * definition and must cost nothing, and each of these queries reads and
 * folds every structurally-matching row.
 */
describe("activeFilterDimensions", () => {
  it("an empty filter is no queries at all", () => {
    expect(activeFilterDimensions(EMPTY_LEDGER_FILTER)).toEqual([]);
  });

  it("whitespace is not a text filter", () => {
    expect(activeFilterDimensions({ ...EMPTY_LEDGER_FILTER, text: "   " })).toEqual([]);
    expect(activeFilterDimensions({ ...EMPTY_LEDGER_FILTER, text: "bakery" })).toEqual(["text"]);
  });

  it("names every dimension §4 lists, once each", () => {
    expect(
      activeFilterDimensions({
        text: "bakery",
        accountIds: ["acc-1"],
        categoryIds: ["cat-1"],
        scope: "business",
        currency: "PLN",
        counterpartyId: "cp-1",
        from: "2026-09-01",
        to: "2026-09-30",
      }),
    ).toEqual([
      "text",
      "accountIds",
      "categoryIds",
      "scope",
      "currency",
      "counterpartyId",
      "dateRange",
    ]);
  });

  /** `from` and `to` are one control on both surfaces, so they are one query. */
  it("half a date range is still one dimension", () => {
    expect(activeFilterDimensions({ ...EMPTY_LEDGER_FILTER, from: "2026-09-01" })).toEqual([
      "dateRange",
    ]);
    expect(activeFilterDimensions({ ...EMPTY_LEDGER_FILTER, to: "2026-09-30" })).toEqual([
      "dateRange",
    ]);
  });
});
