/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { toMoney } from "@waltning/core/money";
import { expect, it } from "vitest";
import { Amount } from "./atoms/amount/amount";
import { CurrencyMarksProvider } from "./currency-marks";

/**
 * **The pivot's symbol, every other currency's code** (`04` §4.1): a figure in
 * the pivot is the one a reader knows by its mark; a foreign one says which
 * currency it is, because `$` does not say which dollar.
 */
it("draws the pivot's symbol and any other currency's code", () => {
  render(
    <CurrencyMarksProvider pivot="PLN" symbol="zł">
      <Amount value={toMoney("1240.50")} currency="PLN" />
      <Amount value={toMoney("62.40")} currency="BYN" />
    </CurrencyMarksProvider>,
  );
  expect(screen.getByText(/zł/)).toBeDefined();
  expect(screen.queryByText(/PLN/)).toBeNull();
  expect(screen.getByText(/BYN/)).toBeDefined();
});

it("draws the code as given with no provider, as in a story", () => {
  render(<Amount value={toMoney("1")} currency="PLN" />);
  expect(screen.getByText(/PLN/)).toBeDefined();
});
