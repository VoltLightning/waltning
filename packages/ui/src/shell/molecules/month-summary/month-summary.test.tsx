/**
 * @vitest-environment jsdom
 *
 * **The card's three figures are the lead currency's, and it must say so.**
 * S04: *"empty means nothing happened, not nothing in the lead currency."* A
 * period whose spending is all foreign drew *went out 0.00* over a register
 * listing that spending — true of the currency, false of the period.
 */

import { render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../../../i18n/provider";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles";
import { MonthSummary } from "./month-summary";

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
});
