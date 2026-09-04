/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { ReconcileSheet } from "./reconcile-sheet";

const TODAY = "2026-09-03";

function noop() {
  return undefined;
}

it("renders nothing while not visible", () => {
  render(
    <ReconcileSheet
      visible={false}
      accountName="Bank A · PLN"
      currency="PLN"
      computedBalance={money.toMoney("1240.50")}
      asOf={TODAY}
      onAsOfChange={noop}
      today={TODAY}
      onDismiss={noop}
      onSave={noop}
    />,
  );
  expect(screen.queryByText("Bank A · PLN")).toBeNull();
});

it("shows the computed balance for the given asOf and starts with Save disabled", () => {
  render(
    <ReconcileSheet
      visible
      accountName="Bank A · PLN"
      currency="PLN"
      computedBalance={money.toMoney("1240.50")}
      asOf={TODAY}
      onAsOfChange={noop}
      today={TODAY}
      onDismiss={noop}
      onSave={noop}
    />,
  );
  expect(screen.getByText("1 240.50")).toBeDefined();
  expect(screen.getByLabelText("As of")).toHaveProperty("value", TODAY);
  expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
});

it("is controlled — moving the date calls onAsOfChange rather than updating itself", () => {
  const onAsOfChange = vi.fn();
  render(
    <ReconcileSheet
      visible
      accountName="Bank A · PLN"
      currency="PLN"
      computedBalance={money.toMoney("1240.50")}
      asOf={TODAY}
      onAsOfChange={onAsOfChange}
      today={TODAY}
      onDismiss={noop}
      onSave={noop}
    />,
  );
  fireEvent.change(screen.getByLabelText("As of"), { target: { value: "2026-08-15" } });

  expect(onAsOfChange).toHaveBeenCalledWith("2026-08-15");
  // Controlled: the field still shows the prop's value, not what was typed —
  // the screen owns `asOf` and refolds `computedBalance` before handing a new one back.
  expect(screen.getByLabelText("As of")).toHaveProperty("value", TODAY);
});

/**
 * The as-of-date bug this component shipped with, made impossible to repeat:
 * `computedBalance` is now the screen's responsibility (`balanceAsOf`), and
 * this component only ever renders whatever it is handed — proven here by
 * rendering the *same* sheet twice with two different `computedBalance`
 * values for two different `asOf` props, as `account-editor-screen.tsx`'s own
 * refold would produce.
 */
it("shows a different Computed figure for a different asOf, because the screen refolded it", () => {
  const { rerender } = render(
    <ReconcileSheet
      visible
      accountName="Bank A · PLN"
      currency="PLN"
      computedBalance={money.toMoney("1240.50")}
      asOf={TODAY}
      onAsOfChange={noop}
      today={TODAY}
      onDismiss={noop}
      onSave={noop}
    />,
  );
  expect(screen.getByText("1 240.50")).toBeDefined();

  rerender(
    <ReconcileSheet
      visible
      accountName="Bank A · PLN"
      currency="PLN"
      computedBalance={money.toMoney("1000.00")}
      asOf="2026-08-15"
      onAsOfChange={noop}
      today={TODAY}
      onDismiss={noop}
      onSave={noop}
    />,
  );
  expect(screen.getByText("1 000.00")).toBeDefined();
  expect(screen.queryByText("1 240.50")).toBeNull();
});

it("computes the live difference and saves observed, asOf and note", () => {
  const onSave = vi.fn();
  render(
    <ReconcileSheet
      visible
      accountName="Bank A · PLN"
      currency="PLN"
      computedBalance={money.toMoney("1240.50")}
      asOf={TODAY}
      onAsOfChange={noop}
      today={TODAY}
      onDismiss={noop}
      onSave={onSave}
    />,
  );
  fireEvent.change(screen.getByLabelText("You observed"), { target: { value: "1198.30" } });
  expect(screen.getByText("-42.20")).toBeDefined();

  fireEvent.change(screen.getByLabelText("Note"), {
    target: { value: "cash spent, not recorded" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onSave).toHaveBeenCalledWith({
    observedBalance: "1198.30",
    asOf: TODAY,
    note: "cash spent, not recorded",
  });
});

/**
 * Zero is neither a gain nor a loss — `auto`'s own default rather than the
 * `income` green a bare sign check (`< 0 ? spend : income`) gave it. Checked
 * by comparing the difference figure's own rendered class list against the
 * "Computed" row's, which is always plain — react-native-web hands identical
 * style objects identical atomic class names, so an equal class list is an
 * equal, un-tinted ink.
 */
it("renders a zero difference in plain ink, not income green", () => {
  render(
    <ReconcileSheet
      visible
      accountName="Bank A · PLN"
      currency="PLN"
      computedBalance={money.toMoney("1240.50")}
      asOf={TODAY}
      onAsOfChange={noop}
      today={TODAY}
      onDismiss={noop}
      onSave={noop}
    />,
  );
  fireEvent.change(screen.getByLabelText("You observed"), { target: { value: "1240.50" } });

  const computedFigure = screen.getByText("1 240.50");
  const differenceFigure = screen.getByText("0.00");
  expect(differenceFigure.className).toBe(computedFigure.className);
});

it("renders a zero-difference refusal on the observed field", () => {
  render(
    <ReconcileSheet
      visible
      accountName="Bank A · PLN"
      currency="PLN"
      computedBalance={money.toMoney("1240.50")}
      asOf={TODAY}
      onAsOfChange={noop}
      today={TODAY}
      fieldErrors={{
        byField: { observedBalance: ["The ledger already shows this balance."] },
        formLevel: [],
      }}
      onDismiss={noop}
      onSave={noop}
    />,
  );
  expect(screen.getByText("The ledger already shows this balance.")).toBeDefined();
});

it("Close calls onDismiss", () => {
  const onDismiss = vi.fn();
  render(
    <ReconcileSheet
      visible
      accountName="Bank A · PLN"
      currency="PLN"
      computedBalance={money.toMoney("0")}
      asOf={TODAY}
      onAsOfChange={noop}
      today={TODAY}
      onDismiss={onDismiss}
      onSave={noop}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});
