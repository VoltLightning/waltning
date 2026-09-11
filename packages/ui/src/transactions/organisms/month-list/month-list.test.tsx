/**
 * @vitest-environment jsdom
 *
 * The token the two tracks reach for. `theme/theme.test.tsx` proves it is
 * readable; nothing but this proves it is used — and `subtleFill`, the value
 * these tracks held for their whole life, sits at 1.10:1 on the page, so a
 * silent revert is a silent return of twelve rows of nothing.
 */

import { render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { MonthList, type MonthRow } from "./month-list";

const ROW: MonthRow = {
  month: "2026-01",
  label: "January",
  inflow: money.toMoney("7850.00"),
  spend: money.toMoney("5120.40"),
  currency: "PLN",
  decimals: 2,
  net: money.toMoney("2729.60"),
  note: null,
  ahead: false,
  matches: null,
};

function noop() {}

function draw(rows: readonly MonthRow[]) {
  render(
    <MonthList
      rows={rows}
      current="2026-01"
      labels={{ inflow: "In", spend: "Out" }}
      onPickMonth={noop}
    />,
  );
}

describe("MonthList", () => {
  /**
   * **The bars were the whole defect and they are gone.** A row used to draw
   * two of its own, scaled to the busiest month — twenty-four tracks down the
   * page, and on a year holding nothing, twenty-four *full-width* tracks. The
   * chart above carries the comparison now; these carry the figures.
   */
  it("states the two figures and the net, and draws no bar", () => {
    draw([ROW]);
    expect(screen.getByText(/7 850/), "what came in").toBeTruthy();
    expect(screen.getByText(/5 120/), "what went out").toBeTruthy();
    expect(screen.getByText(/2 729/), "and what it kept").toBeTruthy();
    // Nothing in the row is a proportional fill any more.
    expect(document.querySelector("[style*='width: 1']")).toBeNull();
  });

  /**
   * A year is twelve months, so an empty one keeps its row — a list that
   * dropped them would change length as the ledger fills.
   */
  it("keeps an empty month, and says three zeroes rather than nothing", () => {
    draw([{ ...ROW, inflow: money.ZERO, spend: money.ZERO, net: money.ZERO, ahead: true }]);
    expect(screen.getByText("January")).toBeTruthy();
    expect(screen.getAllByText(/0[.,]00/).length).toBeGreaterThanOrEqual(3);
  });

  /**
   * **§7: match counts *instead of* the figures, not beside them.** The bars are
   * drawn against the busiest month of the year — under a search they would still
   * be scaled by money nobody asked about, and two answers to two questions would
   * share one row.
   */
  it("replaces a month's figures with its match count while searching", () => {
    draw([{ ...ROW, matches: { label: "5 matches", found: true } }]);
    expect(screen.getByText("5 matches")).toBeTruthy();
    expect(screen.queryByText(/7 850/), "the figures are gone, not moved").toBeNull();
  });

  it("names the count rather than the figures to a reader who cannot see it", () => {
    draw([{ ...ROW, matches: { label: "5 matches", found: true } }]);
    const row = screen.getByRole("button", { name: /5 matches/ });
    expect(row.getAttribute("aria-label")).toBe("January, 5 matches");
  });

  /**
   * The currency note qualifies the figures. Under a search there are none for it
   * to qualify, and a row saying *+ 1 other currency* under a match count would
   * be describing figures that are not on screen.
   */
  it("drops the currency note with the figures it was about", () => {
    draw([{ ...ROW, note: "+ 1 other currency", matches: { label: "0 matches", found: false } }]);
    expect(screen.queryByText("+ 1 other currency")).toBeNull();
  });
});
