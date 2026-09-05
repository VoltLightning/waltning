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
  accounts: [{ id: "acc-cash-pln", name: "Cash · PLN", currency: "PLN", capturable: true }],
  amountRaw: "214,05",
  dischargesCurrency: "EUR",
  onDischargesCurrencyChange: vi.fn(),
  dischargesRaw: "50",
  activeField: "amount",
  onActiveFieldChange: vi.fn(),
  accountId: "acc-cash-pln",
  onOpenAccountPicker: vi.fn(),
  referenceRate: {
    rate: pivotPerUnit("4.3120"),
    source: "nbp",
    date: "2026-08-10",
    carriedDays: 0,
    manual: false,
  },
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

// L9 — a rate has no unit of its own; the realized `RateField` states which
// way it reads, the account's own currency per the discharged one.
it("states the realized rate's own unit — the account's currency per the discharged one", () => {
  renderSheet();
  expect(screen.getByText("PLN per EUR")).toBeDefined();
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

/**
 * M — every balance held is dust at its own currency's scale (M1's filter,
 * empty): the Discharges section states that plainly, and Settle stays
 * disabled rather than an empty section with a hidden currency armed.
 */
it("shows nothing to settle and disables Settle when every balance is dust", () => {
  renderSheet({
    balances: [{ currency: "PLN", balance: toMoney("0.004"), decimals: 2 }],
    dischargesCurrency: null,
  });
  expect(screen.getByText("Nothing to settle.")).toBeDefined();
  expect(screen.queryByRole("radiogroup")).toBeNull();
  expect(screen.getByRole("button", { name: "Settle" })).toHaveProperty("disabled", true);
});

/**
 * L1 — `saveDisabled`'s guard must check whether the *picked* currency is
 * itself still open, not merely whether `openBalances` is non-empty: a
 * stale `dischargesCurrency` naming a since-settled (dust) balance must
 * disable Settle even while a different currency (GBP) remains genuinely
 * open — `openBalances.length === 0` alone missed exactly this case.
 */
it("disables Settle when the picked currency is dust, even with another balance still open (L1)", () => {
  renderSheet({
    balances: [
      { currency: "PLN", balance: toMoney("0.004"), decimals: 2 },
      { currency: "GBP", balance: toMoney("-45"), decimals: 2 },
    ],
    dischargesCurrency: "PLN",
  });
  expect(screen.getByRole("button", { name: "Settle" })).toHaveProperty("disabled", true);
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

/**
 * C1 — the same guard `TransferComposer`'s own `fromNeedsRate` states
 * (§14.6): the controller refuses `settle_debt` on `accountId` before the
 * write once the picked account holds no rate, so this sheet declines
 * proactively — muted caption, disabled Settle — rather than letting a tap
 * reach the controller only to bounce.
 */
it("shows the needsRate caption under the account chip and disables Settle when it can't be captured (C1)", () => {
  renderSheet({
    accounts: [{ id: "acc-cash-pln", name: "Cash · PLN", currency: "PLN", capturable: false }],
  });
  expect(
    screen.getByText("PLN needs an exchange rate before a transaction can be recorded in it."),
  ).toBeDefined();
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
    accounts: [{ id: "acc-other", name: "Household", currency: "USD", capturable: true }],
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

/**
 * H1 — `settleDebtRefusal` never returns `null`: an unrecognised message
 * still lands here, at `path: ""`, which `mapFieldErrors` routes to
 * `formLevel`. A refusal a person cannot see is a refusal that never
 * happened, so the sheet must render it — the same treatment
 * `CounterpartyForm` and `QuickAddForm` give their own `formLevel`.
 */
it("shows an unrecognised settle refusal at form level", () => {
  renderSheet({
    fieldErrors: {
      byField: {},
      formLevel: ["settle_debt: the row changed between insert and the debt-fields update"],
    },
  });
  expect(
    screen.getByText("settle_debt: the row changed between insert and the debt-fields update"),
  ).toBeDefined();
});

/**
 * H — `settle_debt`'s own H2 mirror (`create-phone-ledger.ts`) refuses
 * `discharges.amount` past the picked currency's own scale (matching
 * `assert_amount_scale`'s own `debt_amount`/`debt_currency` pair,
 * `0011_transaction_scale_and_category_kind.sql`); `SETTLE_KNOWN_PATHS`
 * already routes it into `byField`, but nothing rendered it.
 */
it("shows a discharges.amount refusal under the discharges amount field (H)", () => {
  renderSheet({
    dischargesRaw: "1,23",
    fieldErrors: {
      byField: { "discharges.amount": ["EUR holds 0 decimal places — this amount has more"] },
      formLevel: [],
    },
  });
  expect(screen.getByText("EUR holds 0 decimal places — this amount has more")).toBeDefined();
});

/**
 * L2 (#116)'s rendering, which had no test of its own until now.
 *
 * `settle_debt`'s `currency` is a real input path, so `mapFieldErrors` files
 * a refusal about it under `byField` — but this sheet has no `currency`
 * control to hang one on: the currency follows the balance being settled,
 * through `discharges.currency`. A refusal filed there and rendered nowhere
 * is a refusal that never happened, which is the same failure H1 names for
 * `formLevel`. It renders with the form-level messages, which is where a
 * refusal about the *pair* — this account, that currency — belongs anyway.
 */
it("shows a `currency` refusal with the form-level messages, having no currency control of its own", () => {
  renderSheet({
    fieldErrors: {
      byField: { currency: ["This account only holds PLN — settle in that currency."] },
      formLevel: [],
    },
  });
  expect(screen.getByText("This account only holds PLN — settle in that currency.")).toBeDefined();
});

/** And beside a form-level message rather than instead of one — both are shown. */
it("shows a `currency` refusal and a form-level one together", () => {
  renderSheet({
    fieldErrors: {
      byField: { currency: ["This account only holds PLN — settle in that currency."] },
      formLevel: ["settle_debt: the row changed between insert and the debt-fields update"],
    },
  });
  expect(screen.getByText("This account only holds PLN — settle in that currency.")).toBeDefined();
  expect(
    screen.getByText("settle_debt: the row changed between insert and the debt-fields update"),
  ).toBeDefined();
});

it("shows a counterpartyId refusal under the header", () => {
  renderSheet({
    fieldErrors: {
      byField: { counterpartyId: ["No counterparty found"] },
      formLevel: [],
    },
  });
  expect(screen.getByText("No counterparty found")).toBeDefined();
});

/**
 * M1 — `debtDirection` decides at the currency's own scale, not the raw 8dp
 * value: a `+0.004 PLN` balance is `settled` at `decimals: 2`, so it is
 * hidden from the Discharges picker entirely (it cannot be settled again —
 * the executor itself refuses "nothing to settle").
 */
it("hides a balance that is settled at the currency's own scale from the Discharges picker", () => {
  renderSheet({
    balances: [
      { currency: "EUR", balance: toMoney("-120"), decimals: 2 },
      { currency: "PLN", balance: toMoney("0.004"), decimals: 2 },
    ],
    dischargesCurrency: "EUR",
  });
  // Only EUR is open — one balance reads as a plain fact, never a
  // radio group, and PLN never appears at all.
  expect(screen.queryByRole("radiogroup")).toBeNull();
  expect(screen.getByText(/EUR · 120.00 · you owe them/)).toBeDefined();
  // A balance row reads "{currency} · {amount} · {direction}" — the dust
  // PLN row never renders as one, whether the picker offers a real choice
  // or (as here) reads as a single plain fact.
  expect(screen.queryByText(/PLN · /)).toBeNull();
});

it("computes the residual's direction at the currency's own scale, not raw 8dp precision", () => {
  // The sole balance is dust at PLN's own scale (2dp) — discharging
  // anything against it must read as settled, never as a real direction.
  renderSheet({
    balances: [{ currency: "PLN", balance: toMoney("0.004"), decimals: 2 }],
    dischargesCurrency: "PLN",
    dischargesRaw: "5",
    amountRaw: "5",
  });
  expect(screen.getAllByText((_, element) => element?.textContent === "0.00 PLN")).not.toHaveLength(
    0,
  );
  expect(screen.queryByText("they owe you")).toBeNull();
  expect(screen.queryByText("you owe them")).toBeNull();
});

it("renders every figure through the locale's own decimal mark — Polish", () => {
  render(
    <I18nProvider locale="pl">
      <SettleSheet {...BASE_PROPS} />
    </I18nProvider>,
  );
  expect(screen.getByText(/EUR · 120,00 · /)).toBeDefined();
});
