/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { touchTarget } from "../../../tokens.ts";
import { AmountField } from "./amount-field";

/**
 * The input is one display line tall by `useInputHeight`. An Android
 * `EditText` keeps its own vertical padding inside a box that short and clips
 * the glyphs out of view while typing still works — the field looked empty. So
 * the input carries a floor of the field's inside and gives up its padding.
 */
it("the input is never shorter than the field's inside, and carries no vertical padding", () => {
  render(<AmountField label="Amount" currency="PLN" />);
  const input = screen.getByLabelText("Amount");
  const style = getComputedStyle(input);

  expect(Number.parseFloat(style.minHeight)).toBeGreaterThanOrEqual(touchTarget.min - 2);
  expect(Number.parseFloat(style.paddingTop)).toBe(0);
  expect(Number.parseFloat(style.paddingBottom)).toBe(0);
});
