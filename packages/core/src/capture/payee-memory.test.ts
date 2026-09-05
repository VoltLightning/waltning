import { describe, expect, it } from "vitest";
import { accountingDate } from "../date.ts";
import { type PayeeHistoryRow, proposeCategory } from "./payee-memory.ts";

const row = (payee: string, categoryId: string, date: string): PayeeHistoryRow => ({
  payee,
  categoryId,
  date: accountingDate(date),
});

describe("proposeCategory", () => {
  it("returns the exact fold match's most recent category at confidence 1", () => {
    const history = [
      row("Coffee House", "dining", "2026-01-01"),
      row("Coffee House", "groceries", "2026-02-01"),
    ];

    const result = proposeCategory("COFFEE HOUSE", history);

    expect(result).toEqual({
      categoryId: "groceries",
      confidence: 1,
      basis: "exact",
      neighbours: [],
    });
  });

  it("scores a typo by neighbour-agreement confidence", () => {
    const history = [
      row("Coffee House", "groceries", "2026-01-01"),
      row("Coffee Corner", "groceries", "2026-01-02"),
      row("Coffee Bar", "groceries", "2026-01-03"),
      row("Coffee Shop", "groceries", "2026-01-04"),
      row("Coffee Stop", "groceries", "2026-01-05"),
      row("Coffee Nook", "dining", "2026-01-06"),
      row("Coffee Deck", "dining", "2026-01-07"),
      row("Taxi Service", "transport", "2026-01-08"),
    ];

    const result = proposeCategory("Coffe House", history);

    expect(result?.basis).toBe("neighbours");
    expect(result?.categoryId).toBe("groceries");
    expect(result?.confidence).toBeCloseTo(5 / 7, 5);
    expect(result?.neighbours).toHaveLength(7);
    expect(result?.neighbours.some((n) => n.payee === "Taxi Service")).toBe(false);
  });

  it("breaks a similarity tie by the more recent date", () => {
    const history = [
      row("Zeta Mart Deluxe", "dining", "2026-01-01"),
      row("Zeta Mart Deluxe", "groceries", "2026-06-01"),
    ];

    const result = proposeCategory("Zeta Mart", history, 1);

    expect(result).toEqual({
      categoryId: "groceries",
      confidence: 1,
      basis: "neighbours",
      neighbours: [
        { payee: "Zeta Mart Deluxe", similarity: expect.any(Number), categoryId: "groceries" },
      ],
    });
  });

  /**
   * M — the reviewer's own case: a caption naming "where the pick came
   * from" must name a neighbour that actually sits in the *winning*
   * category. The closest neighbour by similarity alone ("Coffee Hous",
   * missing one letter) sits in the *losing* `groceries` category — `dining`
   * wins the plurality (2 votes to 1) even though its own closest neighbour
   * ranks second and third overall. `neighbours` now carries each entry's
   * own `categoryId`, so a caller can find the closest neighbour *of the
   * winning category* rather than defaulting to `neighbours[0]`.
   */
  it("carries each neighbour's own categoryId, so a caller can skip past a losing rank-0 (M)", () => {
    const history = [
      row("Coffee Hous", "groceries", "2026-01-01"),
      row("Coffee Shop", "dining", "2026-01-02"),
      row("Coffee Stop", "dining", "2026-01-03"),
    ];

    const result = proposeCategory("Coffee House", history, 3);

    expect(result?.categoryId).toBe("dining");
    // The closest neighbour overall is the *groceries* row — the caption
    // must not name it for a `dining` pick.
    expect(result?.neighbours[0]).toMatchObject({ payee: "Coffee Hous", categoryId: "groceries" });
    const winningNeighbour = result?.neighbours.find((n) => n.categoryId === result.categoryId);
    expect(winningNeighbour?.payee).not.toBe("Coffee Hous");
  });

  it("returns null when no prior payee clears the similarity floor", () => {
    const history = [
      row("Grocery Store", "groceries", "2026-01-01"),
      row("Bank A", "transfer", "2026-01-02"),
      row("Taxi Ride", "transport", "2026-01-03"),
    ];

    expect(proposeCategory("Umbrella Corp", history)).toBeNull();
  });

  it("returns null on empty history", () => {
    expect(proposeCategory("Coffee House", [])).toBeNull();
  });

  it("returns null for a blank payee rather than matching another blank one", () => {
    const history = [row("   ", "groceries", "2026-01-01")];

    expect(proposeCategory("", history)).toBeNull();
    expect(proposeCategory("   ", history)).toBeNull();
  });

  it("rejects a non-positive k", () => {
    const history = [row("Coffee House", "groceries", "2026-01-01")];

    expect(() => proposeCategory("Coffee House", history, 0)).toThrow();
    expect(() => proposeCategory("Coffee House", history, -1)).toThrow();
  });
});
