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
