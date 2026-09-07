/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { toMoney } from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { StatTile } from "./stat-tile";

/** `money.forDisplay`'s group separator is U+00A0 — normalised for readable assertions. */
function textOf(container: HTMLElement): string {
  return (container.textContent ?? "").replace(/ /g, " ");
}

describe("StatTile", () => {
  /**
   * §12: `spent` is `periodSpend`'s positive `spend` magnitude — the real
   * caller (`today-screen.tsx`) hands this a positive value and `kind="spend"`,
   * never a signed delta, so the digits carry no `−` (the ink stays shell,
   * per `<Amount>`'s own comment on why a shell-safe spend tint is not this).
   */
  it("renders spent as a positive magnitude, never a minus sign", () => {
    const { container } = render(
      <StatTile
        label="spent"
        value={toMoney("3210.40")}
        currency="PLN"
        decimals={2}
        kind="spend"
      />,
    );
    expect(screen.getByText("spent")).toBeDefined();
    expect(textOf(container)).toContain("3 210.40");
    expect(textOf(container)).not.toContain("-3 210.40");
    expect(textOf(container)).toContain("PLN");
  });

  it("prints net as a positive figure without a forced plus sign", () => {
    const { container } = render(
      <StatTile label="net" value={toMoney("840.20")} currency="PLN" decimals={2} />,
    );
    expect(textOf(container)).toContain("840.20");
    expect(textOf(container)).not.toContain("+840.20");
  });

  /** `net` can still land negative — a real month, unlike `spent`, is signed. */
  it("prints a negative net with its sign", () => {
    const { container } = render(
      <StatTile label="net" value={toMoney("-120.00")} currency="PLN" decimals={2} />,
    );
    expect(textOf(container)).toContain("-120.00");
  });
});
