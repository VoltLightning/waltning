/**
 * @vitest-environment jsdom
 *
 * The strip replaced a plain-text hero with a button, and a button is where an
 * accessible name goes wrong.
 */

import { render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { NetWorthStrip } from "./net-worth-strip";

/**
 * **The figure is the name.** An `accessibilityLabel` on the `Pressable`
 * replaces the name computed from its content, so the first version announced
 * "Open your accounts, button" and never read the total — the headline number
 * of the screen, which the `DualTotal` it replaced read out fine. Asserted
 * here because axe will not flag it: an `aria-label` is legal, just wrong.
 */
it("reads its figures out, rather than only where it goes", () => {
  render(
    <NetWorthStrip
      mine={money.toMoney("48620.84")}
      ours={money.toMoney("61200.00")}
      currency="PLN"
      onPress={vi.fn()}
    />,
  );
  // The *accessible name*, not `textContent`: an `aria-label` leaves the DOM
  // text untouched and replaces only the computed name, so reading the text
  // back would pass while a screen reader heard none of it.
  expect(screen.getByRole("button", { name: /48\s?620\.84/ })).toBeDefined();
  expect(screen.getByRole("button", { name: /61\s?200\.00/ })).toBeDefined();
});

/** A partial total says it is partial — the same reason `ours` is never a toggle. */
it("says how many currencies it is not showing", () => {
  render(
    <NetWorthStrip
      mine={money.toMoney("48620.84")}
      ours={null}
      currency="PLN"
      otherCurrencies={2}
      onPress={vi.fn()}
    />,
  );
  expect(screen.getByText("Also held in 2 other currencies")).toBeDefined();
});

/** One currency, no shared account: nothing beneath the figure to explain away. */
it("says nothing about currencies when there is only one", () => {
  render(
    <NetWorthStrip mine={money.toMoney("48620.84")} ours={null} currency="PLN" onPress={vi.fn()} />,
  );
  expect(screen.queryByText(/Also held/)).toBeNull();
});
