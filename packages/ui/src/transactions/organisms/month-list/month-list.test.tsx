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
};

function noop() {}

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
});
