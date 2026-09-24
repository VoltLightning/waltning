/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { VisibilitySheet } from "./visibility-sheet";

const ACCOUNTS = [
  { id: "bank-1", name: "Everyday", meta: "Bank · PLN", hidden: false, inTotal: true },
  { id: "invest-1", name: "Vault", meta: "Investment · USD", hidden: false, inTotal: false },
  { id: "card-2", name: "Card B", meta: "Card · EUR", hidden: true, inTotal: false },
];

/**
 * **`switch`, not `button`.** Each pill has a state a reader needs announced —
 * *Count, on* — and a button announces only its name, so a screen reader would
 * have no way to tell a counted account from an uncounted one.
 */
it("announces each flag's state, per account", () => {
  render(<VisibilitySheet visible accounts={ACCOUNTS} onChange={vi.fn()} onDismiss={vi.fn()} />);
  const switches = screen.getAllByRole("switch");
  // Two per account, in row order: Show then Count.
  expect(switches).toHaveLength(6);
  expect(switches[0]?.getAttribute("aria-checked")).toBe("true"); // Everyday, shown
  expect(switches[1]?.getAttribute("aria-checked")).toBe("true"); // Everyday, counted
  expect(switches[2]?.getAttribute("aria-checked")).toBe("true"); // Vault, shown
  expect(switches[3]?.getAttribute("aria-checked")).toBe("false"); // Vault, not counted
  expect(switches[4]?.getAttribute("aria-checked")).toBe("false"); // Card B, hidden
  expect(switches[5]?.getAttribute("aria-checked")).toBe("false"); // Card B, not counted
});

/**
 * **Count cannot be reached on a hidden account.** The operation refuses a
 * hidden account that claims to be counted, so the control that would build
 * that state is disabled rather than left to be pressed and bounced.
 */
it("disables counting while an account is hidden", () => {
  const onChange = vi.fn();
  render(<VisibilitySheet visible accounts={ACCOUNTS} onChange={onChange} onDismiss={vi.fn()} />);
  const cardCount = screen.getAllByRole("switch")[5] as HTMLElement;
  fireEvent.click(cardCount);
  expect(onChange).not.toHaveBeenCalled();
});

/** Showing an account again brings it back into the total with it. */
it("restores counting when an account is shown again", () => {
  const onChange = vi.fn();
  render(<VisibilitySheet visible accounts={ACCOUNTS} onChange={onChange} onDismiss={vi.fn()} />);
  fireEvent.click(screen.getAllByRole("switch")[4] as HTMLElement);
  // An account coming back into the list with its figure silently left out
  // would be the same puzzle in reverse.
  expect(onChange).toHaveBeenCalledWith("card-2", { hidden: false, inTotal: true });
});
