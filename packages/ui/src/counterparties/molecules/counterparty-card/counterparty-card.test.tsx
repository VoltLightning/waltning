/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CounterpartyCard } from "./counterparty-card";

describe("CounterpartyCard", () => {
  it("shows the monogram, the kind and the settlement currency — never the name again", () => {
    render(<CounterpartyCard name="Nina" kind="person" settlementCurrency="EUR" />);
    // The monogram, not the name: S13's header names them once, and this card
    // printed it again at the same type step directly underneath.
    expect(screen.getByText("N")).toBeDefined();
    expect(screen.queryByText("Nina")).toBeNull();
    expect(screen.getByText("person · settles in EUR")).toBeDefined();
  });

  it("renders an ageing bar for a company only when passed one", () => {
    render(
      <CounterpartyCard
        name="Acme"
        kind="company"
        settlementCurrency="PLN"
        ageing={{ ageDays: 62, bucket: "61-90" }}
      />,
    );
    expect(screen.getByRole("progressbar")).toBeDefined();
  });

  it("never renders an ageing bar for a person, even if one is passed", () => {
    render(
      <CounterpartyCard
        name="Nina"
        kind="person"
        settlementCurrency="EUR"
        ageing={{ ageDays: 62, bucket: "61-90" }}
      />,
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("omits the settlement clause when no settlement currency is set", () => {
    render(<CounterpartyCard name="Nina" kind="person" settlementCurrency={null} />);
    expect(screen.getByText("person")).toBeDefined();
  });
});
