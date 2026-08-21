/**
 * @vitest-environment jsdom
 *
 * `<FxAmount>` — P1 at run time. The compile-time half is
 * `fx-amount.type-test.ts`; this covers what the type cannot say: that the rate
 * is *shown*, that the conversion uses it, and that every non-synced variant
 * arrives with text rather than only a tint.
 */

import { render, screen } from "@testing-library/react";
import { money } from "@waltning/core";
import { describe, expect, it } from "vitest";
import { FxAmount } from "./fx-amount";

const base = { value: money.toMoney("62.40"), currency: "USD", displayCurrency: "PLN" } as const;

describe("FxAmount", () => {
  it("shows local, rate and converted — all three, always", () => {
    // The rate is not an implementation detail of the conversion; it is part of
    // the figure. A converted amount without its rate is a number the reader
    // has to trust rather than check.
    render(<FxAmount {...base} rate={money.pivotPerUnit("4.02310000")} />);
    expect(screen.getByText("62.40")).toBeDefined();
    expect(screen.getByText("4.0231")).toBeDefined();
    expect(screen.getByText("251.04")).toBeDefined();
  });

  it("converts with the rate it was given, not with today's", () => {
    // The defect P1 exists to prevent: a figure silently converted at today's
    // rate is wrong by exactly the market's movement and looks entirely
    // reasonable. Two different rates on the same amount must differ.
    const { container: atOne } = render(
      <FxAmount {...base} rate={money.pivotPerUnit("4.00000000")} />,
    );
    const { container: atTwo } = render(
      <FxAmount {...base} rate={money.pivotPerUnit("5.00000000")} />,
    );
    expect(atOne.textContent).toContain("249.60");
    expect(atTwo.textContent).toContain("312.00");
  });

  it("marks a manual override with text, not tint alone", () => {
    // P5: a colour-only marker is invisible to anyone who cannot distinguish
    // the two colours — and amber carries four meanings in this system.
    render(
      <FxAmount
        {...base}
        rate={money.pivotPerUnit("4.02310000")}
        provenance={{ kind: "override" }}
      />,
    );
    // Lowercase in the DOM: the capitals are `textTransform`, which is
    // presentation. Asserting on them would be asserting on CSS.
    expect(screen.getByText("manual")).toBeDefined();
  });

  it("marks an estimated rate", () => {
    render(
      <FxAmount
        {...base}
        rate={money.pivotPerUnit("4.02310000")}
        provenance={{ kind: "estimated" }}
      />,
    );
    expect(screen.getByText("estimated")).toBeDefined();
  });

  it("states how stale a stale rate is", () => {
    // "Stale" alone says something is wrong and nothing about whether it
    // matters. Eleven days and eleven months are the same word and different
    // decisions.
    render(
      <FxAmount
        {...base}
        rate={money.pivotPerUnit("4.02310000")}
        provenance={{ kind: "stale", ageDays: 11 }}
      />,
    );
    expect(screen.getByText("stale 11d")).toBeDefined();
  });

  it("marks a synced rate with nothing at all", () => {
    // The default must be quiet, or the marker means nothing when it appears.
    const { container } = render(<FxAmount {...base} rate={money.pivotPerUnit("4.02310000")} />);
    expect(container.textContent).not.toMatch(/manual|stale|estimated/i);
  });
});
