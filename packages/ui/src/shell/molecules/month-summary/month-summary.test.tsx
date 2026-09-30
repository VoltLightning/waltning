/**
 * @vitest-environment jsdom
 *
 * **The card's three figures are the lead currency's, and it must say so.**
 * S04: *"empty means nothing happened, not nothing in the lead currency."* A
 * period whose spending is all foreign drew *went out 0.00* over a register
 * listing that spending — true of the currency, false of the period.
 */

import { act, render, screen, within } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../../../i18n/provider";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles";
import { MonthSummary } from "./month-summary";

/** Fires the `onLayout` RNW would, from a ResizeObserver jsdom does not have. */
function layOut(node: Element | null | undefined, width: number) {
  const handler: unknown =
    node === null || node === undefined ? undefined : Reflect.get(node, "__reactLayoutHandler");
  if (typeof handler !== "function") throw new Error("no layout handler on that node");
  act(() => {
    handler({ nativeEvent: { layout: { x: 0, y: 0, width, height: 20 } } });
  });
}

function draw(overrides: Partial<React.ComponentProps<typeof MonthSummary>> = {}) {
  render(
    <ThemeProvider theme={light}>
      <I18nProvider>
        <MonthSummary
          spend={money.ZERO}
          inflow={money.toMoney("1200.00")}
          net={money.toMoney("1200.00")}
          currency="EUR"
          {...overrides}
        />
      </I18nProvider>
    </ThemeProvider>,
  );
}

describe("MonthSummary", () => {
  it("says what the figures leave out when the period holds another currency", () => {
    draw({ otherCurrencies: 2 });
    expect(screen.getByText("+ 2 other currencies")).toBeDefined();
  });

  it("counts one in the singular", () => {
    draw({ otherCurrencies: 1 });
    expect(screen.getByText("+ 1 other currency")).toBeDefined();
  });

  /** A period that is entirely the lead currency states the whole; a note there would be about nothing. */
  it("draws no note when every row is the lead currency", () => {
    draw();
    expect(screen.queryByText(/other currenc/)).toBeNull();
  });

  /**
   * A twelve-digit figure under a larger OS text size wraps between digits at
   * any width a line of no-break characters cannot fit. Every figure on the card
   * is one line that shrinks, so it never does.
   */
  it("draws every figure on one line, however wide", () => {
    draw({
      inflow: money.toMoney("999999999999.99"),
      spend: money.toMoney("999999999999.99"),
      net: money.toMoney("-999999999999.99"),
    });
    for (const figure of screen.getAllByText(/999/)) {
      expect(getComputedStyle(figure).whiteSpace, figure.textContent ?? "").toBe("nowrap");
    }
  });

  /**
   * A long label (German at a large text size, any label at an accessibility
   * size) would leave a figure beside it no room: the figure goes under it, on
   * its own line, and is drawn.
   */
  it("puts the compact figure under a label that takes more than half the row", () => {
    draw({
      layout: "compact",
      labels: { net: "A very long label for the month", inflow: "In", spend: "Out" },
    });
    const label = screen.getByText("A very long label for the month");
    const row = label.parentElement;
    const figure = label.nextElementSibling;
    expect(getComputedStyle(row as Element).flexDirection).toBe("row");
    layOut(row, 300);
    layOut(label, 200);
    expect(getComputedStyle(row as Element).flexDirection).toBe("column");
    layOut(figure, 300);
    const shown = within(figure as HTMLElement).getByText(/1.200/);
    expect(getComputedStyle(shown).opacity).not.toBe("0");
  });

  it("keeps the compact figure beside a short label", () => {
    draw({ layout: "compact" });
    const label = screen.getByText("Kept so far");
    const row = label.parentElement;
    layOut(row, 300);
    layOut(label, 90);
    expect(getComputedStyle(row as Element).flexDirection).toBe("row");
  });
});
