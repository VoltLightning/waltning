/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { FigureInput } from "./figure-input";

function noop() {}

/**
 * iOS leaves a view out of hit-testing at an alpha of `0.01` or under. At `0`
 * the figure was focused once, by `autoFocus`, and never again by a finger.
 */
it("keeps the unseen input above the alpha at which iOS stops delivering touches", () => {
  render(
    <FigureInput
      label="Amount"
      value="12"
      onChangeText={noop}
      step="displayHero"
      maxLength={12}
      focused={false}
      onFocus={noop}
      onBlur={noop}
    />,
  );
  const opacity = Number(getComputedStyle(screen.getByLabelText("Amount")).opacity);
  expect(opacity).toBeGreaterThan(0.01);
  expect(opacity).toBeLessThan(0.05);
});
