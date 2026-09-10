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
import { light } from "../../../theme/roles.ts";
import { MonthList, type MonthRow } from "./month-list";

function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

const ROW: MonthRow = {
  month: "2026-01",
  label: "January",
  inflow: money.toMoney("7850.00"),
  spend: money.toMoney("5120.40"),
  currency: "PLN",
  decimals: 2,
  inflowShare: 1,
  spendShare: 0.65,
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
  it("draws both tracks in the bar-track fill, and each bar in its own money colour", () => {
    render(
      <MonthList
        rows={[ROW]}
        current="2026-01"
        labels={{ inflow: "In", spend: "Out" }}
        onPickMonth={noop}
      />,
    );
    const bars = document.querySelector("[aria-hidden='true']");
    if (!(bars instanceof HTMLElement)) throw new Error("no bars rendered");
    const tracks = Array.from(bars.children).filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    );
    expect(tracks).toHaveLength(2);
    for (const one of tracks)
      expect(getComputedStyle(one).backgroundColor).toBe(rgb(light.trackFill));

    const fills = tracks.map((one) => one.firstElementChild);
    expect(fills[0] instanceof HTMLElement && getComputedStyle(fills[0]).backgroundColor).toBe(
      rgb(light.income),
    );
    expect(fills[1] instanceof HTMLElement && getComputedStyle(fills[1]).backgroundColor).toBe(
      rgb(light.spend),
    );
  });

  /**
   * The row still exists at zero — a year is twelve months — so the track is
   * the whole of what a reader sees, and it is the only thing saying the row
   * has a scale at all.
   */
  it("keeps an empty month's tracks", () => {
    render(
      <MonthList
        rows={[
          {
            ...ROW,
            inflow: money.ZERO,
            spend: money.ZERO,
            inflowShare: 0,
            spendShare: 0,
            ahead: true,
          },
        ]}
        current=""
        labels={{ inflow: "In", spend: "Out" }}
        onPickMonth={noop}
      />,
    );
    const bars = document.querySelector("[aria-hidden='true']");
    if (!(bars instanceof HTMLElement)) throw new Error("no bars rendered");
    expect(bars.children).toHaveLength(2);
    for (const one of Array.from(bars.children)) {
      if (!(one instanceof HTMLElement)) throw new Error("not an element");
      expect(getComputedStyle(one).backgroundColor).toBe(rgb(light.trackFill));
    }
    expect(screen.getByText("January")).toBeTruthy();
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
