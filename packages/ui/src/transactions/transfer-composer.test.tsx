/**
 * @vitest-environment jsdom
 *
 * `<TransferComposer>` — controlled, so every scenario is a set of props.
 * The S31 §9 worked example lives in `apps/mobile/src/transfer-screen.test.
 * tsx`, driven through the keypad; this file covers the states that do not
 * need a screen around them.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { pivotPerUnit } from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { TransferComposer, type TransferComposerProps } from "./transfer-composer";

const BASE_PROPS: TransferComposerProps = {
  accounts: [
    { id: "acc-usd", name: "Household · USD", currency: "USD", decimals: 2 },
    { id: "acc-pln", name: "Cash · PLN", currency: "PLN", decimals: 2 },
  ],
  fromAccountId: "acc-usd",
  onFromAccountChange: vi.fn(),
  toAccountId: "acc-pln",
  onToAccountChange: vi.fn(),
  onSwap: vi.fn(),
  amountRaw: "150",
  toAmountRaw: "565,20",
  activeField: "amount",
  onActiveFieldChange: vi.fn(),
  referenceRate: { rate: pivotPerUnit("3.8100"), source: "nbp", date: "2026-08-12" },
  fee: "",
  onFeeChange: vi.fn(),
  date: "2026-08-12",
  onDateChange: vi.fn(),
  today: "2026-08-12",
  note: "",
  onNoteChange: vi.fn(),
  onCancel: vi.fn(),
};

function renderComposer(overrides: Partial<TransferComposerProps> = {}) {
  return render(<TransferComposer {...BASE_PROPS} {...overrides} />);
}

it("shows the rate panel and margin for a cross-currency pair", () => {
  renderComposer();
  expect(screen.getByText("3.7680")).toBeDefined();
  expect(
    screen.getByText(
      (_, element) => element?.textContent === "reference 3.8100 · nbp · 2026-08-12",
    ),
  ).toBeDefined();
  expect(screen.getAllByText((_, element) => element?.textContent === "6.30 PLN")).toHaveLength(2);
});

it("adds the stated fee into the total, distinct from the margin", () => {
  renderComposer({ fee: "5,00" });
  expect(screen.getByText((_, element) => element?.textContent === "6.30 PLN")).toBeDefined();
  expect(screen.getByText((_, element) => element?.textContent === "11.30 PLN")).toBeDefined();
});

it("collapses to one amount for a same-currency transfer — no rate panel, no spread", () => {
  renderComposer({
    toAccountId: "acc-pln-2",
    accounts: [
      ...BASE_PROPS.accounts,
      { id: "acc-pln-2", name: "Savings · PLN", currency: "PLN", decimals: 2 },
    ],
    fromAccountId: "acc-pln",
    amountRaw: "150",
    toAmountRaw: "150",
    referenceRate: undefined,
  });
  expect(screen.queryByRole("button", { name: /^Destination amount/ })).toBeNull();
  expect(screen.queryByText(/^Margin/)).toBeNull();
});

it("refuses the same account both sides, inline, before Save", () => {
  renderComposer({ toAccountId: "acc-usd", toAmountRaw: "150", referenceRate: undefined });
  expect(screen.getByText("A transfer needs two different accounts.")).toBeDefined();
});

it("has no destination amount and no reference offline with nothing held", () => {
  renderComposer({ toAmountRaw: "", referenceRate: undefined });
  expect(screen.getByRole("button", { name: "Destination amount: 0" })).toBeDefined();
  expect(screen.queryByText(/^reference/)).toBeNull();
});

it("routes a tap on either hero amount through onActiveFieldChange", () => {
  const onActiveFieldChange = vi.fn();
  renderComposer({ onActiveFieldChange });
  fireEvent.click(screen.getByRole("button", { name: "Destination amount: 565.20" }));
  expect(onActiveFieldChange).toHaveBeenCalledWith("toAmount");
});

it("swaps the two accounts with one control", () => {
  const onSwap = vi.fn();
  renderComposer({ onSwap });
  fireEvent.click(screen.getByRole("button", { name: "Swap direction" }));
  expect(onSwap).toHaveBeenCalledOnce();
});

it("cancels through the header ✕", () => {
  const onCancel = vi.fn();
  renderComposer({ onCancel });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalledOnce();
});
