/**
 * @vitest-environment jsdom
 *
 * `FlowBar` — what came in against what went out, each its share of the two.
 * It used to draw spend as a share of income, and a month that took in 3 000
 * and spent 2 000 read as two thirds red.
 */

import { render } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { light } from "../../../theme/roles.ts";
import { FlowBar, flowShare } from "./flow-bar";

/**
 * `getComputedStyle`, not `.style`: `makeStyles` colours land in a generated
 * class, and only a value computed per render (a segment's flex) is inline. It
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
  /** The bug, stated as a number: 3 000 in and 2 000 out is 60% green. */
  it("gives came-in its share of the two, so a month that kept money reads mostly green", () => {
    expect(flowShare(money.toMoney("3000"), money.toMoney("2000"))).toBe(0.6);
  });

  it("draws came-in green on the left and went-out red on the right", () => {
    render(<FlowBar inflow={money.toMoney("3000.00")} spend={money.toMoney("2000.00")} />);
    const [first, second] = Array.from(track().children) as HTMLElement[];
    expect(getComputedStyle(first as HTMLElement).backgroundColor).toBe(rgb(light.income));
    expect(getComputedStyle(second as HTMLElement).backgroundColor).toBe(rgb(light.spend));
    expect((first as HTMLElement).style.flex).toMatch(/^0\.6/);
  });

  it("draws a neutral track and nothing on it when nothing arrived and nothing left", () => {
    render(<FlowBar inflow={money.ZERO} spend={money.ZERO} />);
    const bar = track();
    // Half green and half red would claim a split of zero and zero.
    expect(getComputedStyle(bar).backgroundColor).toBe(rgb(light.trackFill));
    expect(bar.firstElementChild).toBeNull();
  });

  it("is all red for a month that only spent, and all green for one that only earned", () => {
    expect(flowShare(money.ZERO, money.toMoney("250.00"))).toBe(0);
    expect(flowShare(money.toMoney("250.00"), money.ZERO)).toBe(1);
  });
});
