/**
 * @vitest-environment jsdom
 *
 * `<SettleSheet>` — controlled, so every scenario is a set of props rather
 * than a sequence of taps. The S14 worked example (E5's own plan): owe 120
 * EUR, settle 50 EUR from `Cash · PLN` at 4.2810 → residual −70, spread
 * shown against 4.3120.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { pivotPerUnit, toMoney } from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/provider";
import { SettleSheet, type SettleSheetProps } from "./settle-sheet";

const BASE_PROPS: SettleSheetProps = {
  visible: true,
  counterpartyName: "Nina",
  balances: [{ currency: "EUR", balance: toMoney("-120"), decimals: 2 }],
  accounts: [{ id: "acc-cash-pln", name: "Cash · PLN", currency: "PLN" }],
  amountRaw: "214,05",
  dischargesCurrency: "EUR",
  onDischargesCurrencyChange: vi.fn(),
  dischargesRaw: "50",
  activeField: "amount",
  onActiveFieldChange: vi.fn(),
  accountId: "acc-cash-pln",
  onOpenAccountPicker: vi.fn(),
  referenceRate: { rate: pivotPerUnit("4.3120"), source: "nbp", date: "2026-08-10" },
  note: "",
  onNoteChange: vi.fn(),
  stale: false,
  keypad: null,
  onDismiss: vi.fn(),
  onSettle: vi.fn(),
};

function renderSheet(overrides: Partial<SettleSheetProps> = {}) {
  return render(<SettleSheet {...BASE_PROPS} {...overrides} />);
}

it("derives the rate from the two typed amounts and shows the reference beside it", () => {
  renderSheet();
  expect(screen.getByText("4.2810")).toBeDefined();
  expect(
    screen.getByText(
      (_, element) => element?.textContent === "reference 4.3120 · nbp · 2026-08-10",
    ),
  ).toBeDefined();
});

it("states the residual before commit — the S14 worked example", () => {
  renderSheet();
  expect(screen.getByText((_, element) => element?.textContent === "50.00 EUR")).toBeDefined();
  // P5 — direction in words, never by sign alone: the magnitude, not a
  // negative figure, plus which way it runs.
  expect(screen.getByText((_, element) => element?.textContent === "70.00 EUR")).toBeDefined();
  expect(screen.getByText("you owe them")).toBeDefined();
});

it("names the counterparty in the sheet's own title", () => {
  renderSheet();
  expect(screen.getByText("Settling with Nina")).toBeDefined();
});

it("renders one balance as a plain fact, not a radio group of one", () => {
  renderSheet();
  expect(screen.queryByRole("radiogroup")).toBeNull();
  expect(screen.getByText(/EUR · 120.00 · you owe them/)).toBeDefined();
});

it("offers a real choice once a second balance is open", () => {
  renderSheet({
    balances: [
      { currency: "EUR", balance: toMoney("-120"), decimals: 2 },
      { currency: "GBP", balance: toMoney("60"), decimals: 2 },
    ],
  });
  expect(screen.getByRole("radiogroup")).toBeDefined();
  expect(screen.getByRole("radio", { name: /EUR · 120.00 · you owe them/ })).toBeDefined();
  expect(screen.getByRole("radio", { name: /GBP · 60.00 · they owe you/ })).toBeDefined();
});

it("flips to over-settlement rather than clamping at zero, and says which way in words", () => {
  // Owe 120 EUR, discharge 150 — the balance flips the other way: they now
  // owe 30 EUR.
  renderSheet({
    dischargesRaw: "150",
    amountRaw: "642,15",
    balances: [{ currency: "EUR", balance: toMoney("-120"), decimals: 2 }],
  });
  expect(screen.getByText(/Becomes 30.00 EUR the other way\..*they owe you/)).toBeDefined();
});

it("marks the result an estimate and stamps it once the snapshot is older than the session", () => {
  renderSheet({ stale: true, stampedAt: new Date("2026-08-12T14:20:00Z").getTime() });
  expect(screen.getByText("remaining (estimated)")).toBeDefined();
  expect(screen.getByText(/From this device's ledger as of/)).toBeDefined();
});

it("has no reference line when nothing is held (offline, no rate)", () => {
  renderSheet({ referenceRate: undefined });
  expect(screen.queryByText(/^reference/)).toBeNull();
});

it("disables Settle until an account and a discharge currency are both picked", () => {
  renderSheet({ accountId: null });
  expect(screen.getByRole("button", { name: "Settle" })).toHaveProperty("disabled", true);
});

it("calls onSettle on the primary action", () => {
  const onSettle = vi.fn();
  renderSheet({ onSettle });
  fireEvent.click(screen.getByRole("button", { name: "Settle" }));
  expect(onSettle).toHaveBeenCalledOnce();
});

it("routes a tap on either hero amount through onActiveFieldChange", () => {
  const onActiveFieldChange = vi.fn();
  renderSheet({ onActiveFieldChange });
  fireEvent.click(screen.getByRole("button", { name: "Discharges: 50" }));
  expect(onActiveFieldChange).toHaveBeenCalledWith("discharges");
});

it("does not double the currency when the account name already carries it", () => {
  // `Cash · PLN`'s own name already ends `· PLN` (the placeholder
  // convention) — the field must show it once, not `Cash · PLN · PLN`.
  renderSheet();
  expect(screen.getByText("Cash · PLN")).toBeDefined();
  expect(screen.queryByText("Cash · PLN · PLN")).toBeNull();
});

it("still appends the currency when the account name does not carry it", () => {
  renderSheet({
    accounts: [{ id: "acc-other", name: "Household", currency: "USD" }],
    accountId: "acc-other",
  });
  expect(screen.getByText("Household · USD")).toBeDefined();
});

/**
 * `AccountPicker` (`accounts/`) is a sibling domain — `counterparties/` may
 * not import it any more than `transactions/`. This sheet only ever asks the
 * screen to open it; `account-picker.test.tsx` covers the sheet itself.
 */
it("opens the account picker through a callback rather than a select of its own", () => {
  const onOpenAccountPicker = vi.fn();
  renderSheet({ onOpenAccountPicker });
  fireEvent.click(screen.getByRole("button", { name: "From: Cash · PLN" }));
  expect(onOpenAccountPicker).toHaveBeenCalledOnce();
});

it("renders every figure through the locale's own decimal mark — Polish", () => {
  render(
    <I18nProvider locale="pl">
      <SettleSheet {...BASE_PROPS} />
    </I18nProvider>,
  );
  expect(screen.getByText(/EUR · 120,00 · /)).toBeDefined();
});
