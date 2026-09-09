/**
 * @vitest-environment jsdom
 *
 * **A ratio between two hex strings cannot see a component stop using the
 * token.** `theme/theme.test.tsx` proves `incomeFill` and `trackFill` are
 * readable; only this proves the bar reaches for them. The pair matters here
 * more than usual, because the defect these tokens fix — `spend` drawn on
 * `income` at 1.0045:1 — was invisible to every ratio in that file *and* to a
 * screenshot, which recorded the uniform rectangle as the expected picture.
 */

import { render } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { light } from "../../../theme/roles.ts";
import { FlowBar, flowShare } from "./flow-bar";

/**
 * `getComputedStyle`, not `.style`: `makeStyles` colours land in a generated
 * class, and only a value computed per render (a bar's width) is inline. It
 * reports a hex as `rgb(r, g, b)`.
 */
function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

function track(): HTMLElement {
  const found = document.querySelector("[aria-hidden='true']");
  if (!(found instanceof HTMLElement)) throw new Error("no track rendered");
  return found;
}

describe("FlowBar", () => {
  it("draws the fill on income as a field, never on income as ink", () => {
    render(<FlowBar inflow={money.toMoney("7850.00")} spend={money.toMoney("4320.18")} />);
    const bar = track();
    expect(getComputedStyle(bar).backgroundColor).toBe(rgb(light.incomeFill));
    // The two money colours are the same lightness: `spend` on `income` is
    // 1.0045:1, so this assertion is the difference between a bar and a block.
    expect(getComputedStyle(bar).backgroundColor).not.toBe(rgb(light.income));

    const fill = bar.firstElementChild;
    if (!(fill instanceof HTMLElement)) throw new Error("no fill rendered");
    expect(getComputedStyle(fill).backgroundColor).toBe(rgb(light.spend));
  });

  it("draws a neutral track and no fill when nothing arrived and nothing left", () => {
    render(<FlowBar inflow={money.ZERO} spend={money.ZERO} />);
    const bar = track();
    // Not `incomeFill`: a green track on an empty month says "you kept all of
    // it" about a month in which nothing happened.
    expect(getComputedStyle(bar).backgroundColor).toBe(rgb(light.trackFill));
    expect(bar.firstElementChild).toBeNull();
  });

  it("fills the track and stops when the month spent more than it took", () => {
    expect(flowShare(money.toMoney("100.00"), money.toMoney("250.00"))).toBe(1);
  });
});
