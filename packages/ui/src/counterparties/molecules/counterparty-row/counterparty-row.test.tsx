/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { pivotPerUnit, toMoney } from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import { CounterpartyRow } from "./counterparty-row";

describe("CounterpartyRow", () => {
  it("shows the name, direction and settlement figure — no display line without a rate", () => {
    render(
      <CounterpartyRow
        name="Nina"
        kind="person"
        settlement={{ value: toMoney("74.44000000"), currency: "EUR" }}
        onPress={vi.fn()}
      />,
    );
    expect(screen.getByText("Nina")).toBeDefined();
    expect(screen.getByText("owes you")).toBeDefined();
    expect(screen.getByText("74.44")).toBeDefined();
    expect(screen.queryByText("PLN", { exact: false })).toBeNull();
  });

  it("adds the display-currency equivalent once a rate is on hand (P1)", () => {
    render(
      <CounterpartyRow
        name="Nina"
        kind="person"
        settlement={{ value: toMoney("74.44000000"), currency: "EUR" }}
        display={{ currency: "PLN", rate: pivotPerUnit("4.32") }}
        onPress={vi.fn()}
      />,
    );
    expect(screen.getByText("PLN", { exact: false })).toBeDefined();
  });

  it("shows AgeingBar only for a company with a resolved age (O15)", () => {
    render(
      <CounterpartyRow
        name="Acme Sp. z o.o."
        kind="company"
        settlement={{ value: toMoney("4200.00000000"), currency: "PLN" }}
        ageDays={62}
        ageBucket="61-90"
        onPress={vi.fn()}
      />,
    );
    expect(screen.getByRole("progressbar")).toBeDefined();
  });

  it("never shows AgeingBar for a person, even with an age passed by mistake", () => {
    render(
      <CounterpartyRow
        name="Marek"
        kind="person"
        settlement={{ value: toMoney("-120.00000000"), currency: "PLN" }}
        ageDays={62}
        ageBucket="61-90"
        onPress={vi.fn()}
      />,
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("shows the per-currency balances stacked, each with its own direction, when there is no net (P1)", () => {
    render(
      <CounterpartyRow
        name="Nina"
        kind="person"
        settlement={{ value: null, currency: "EUR" }}
        balances={[
          { currency: "PLN", balance: toMoney("840.00000000") },
          { currency: "EUR", balance: toMoney("-120.00000000") },
        ]}
        onPress={vi.fn()}
      />,
    );
    expect(screen.getByText("840.00", { exact: false })).toBeDefined();
    expect(screen.getByText("120.00", { exact: false })).toBeDefined();
    expect(screen.getAllByText("owes you")).toHaveLength(1);
    expect(screen.getAllByText("you owe")).toHaveLength(1);
    // Never a single net line standing in for the un-folded position.
    expect(screen.queryByText("74.44", { exact: false })).toBeNull();
  });

  it("fires onPress", () => {
    const onPress = vi.fn();
    render(
      <CounterpartyRow
        name="Nina"
        kind="person"
        settlement={{ value: toMoney("74.44000000"), currency: "EUR" }}
        onPress={onPress}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Nina" }));
    expect(onPress).toHaveBeenCalledOnce();
  });
});

/**
 * The name is the row's subject and it rendered as `M…` on a 390pt phone:
 * the identity column is `flex: 1` over a zero basis, so an inline figure and
 * its conversion took the width first. Stacked, the figure is one column
 * wide (S12 draws one figure per row).
 */
it("stacks a converted figure, so the name keeps its width", () => {
  render(
    <CounterpartyRow
      name="Marta Kowalczyk-Nowakowska"
      kind="person"
      settlement={{ currency: "PLN", value: toMoney("656.88"), decimals: 2 }}
      balances={[]}
      display={{ currency: "USD", rate: pivotPerUnit("0.2469"), decimals: 2 }}
      onPress={vi.fn()}
    />,
  );
  // Both figures are there, and each is on its own line rather than one row.
  expect(screen.getByText("656.88")).toBeDefined();
  expect(screen.getByText("162.18"), "the converted figure, on its own line").toBeDefined();
  expect(screen.getByRole("button", { name: "Marta Kowalczyk-Nowakowska" })).toBeDefined();
});
