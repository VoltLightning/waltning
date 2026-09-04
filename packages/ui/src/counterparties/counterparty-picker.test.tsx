/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CounterpartyPicker } from "./counterparty-picker";

const COUNTERPARTIES = [
  { id: "nina", name: "Nina", kind: "person" as const },
  { id: "marek", name: "Marek", kind: "person" as const },
  { id: "acme", name: "Acme Sp. z o.o.", kind: "company" as const },
];

describe("CounterpartyPicker", () => {
  it("lists every counterparty, and 'Recent' only when ids are given", () => {
    render(
      <CounterpartyPicker
        visible
        counterparties={COUNTERPARTIES}
        onPick={vi.fn()}
        onCreateNew={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("Nina")).toBeDefined();
    expect(screen.getByText("Marek")).toBeDefined();
    expect(screen.getByText("Acme Sp. z o.o.")).toBeDefined();
    expect(screen.queryByText("Recent")).toBeNull();
  });

  it("shows a 'Recent' section for the given ids", () => {
    render(
      <CounterpartyPicker
        visible
        counterparties={COUNTERPARTIES}
        recentIds={["marek"]}
        onPick={vi.fn()}
        onCreateNew={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText("Recent")).toBeDefined();
  });

  it("filters the list by folded, diacritic-insensitive name", () => {
    render(
      <CounterpartyPicker
        visible
        counterparties={COUNTERPARTIES}
        onPick={vi.fn()}
        onCreateNew={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "acme" } });
    expect(screen.getByText("Acme Sp. z o.o.")).toBeDefined();
    expect(screen.queryByText("Nina")).toBeNull();
  });

  it("fires onPick with the tapped id", () => {
    const onPick = vi.fn();
    render(
      <CounterpartyPicker
        visible
        counterparties={COUNTERPARTIES}
        onPick={onPick}
        onCreateNew={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Nina" }));
    expect(onPick).toHaveBeenCalledWith("nina");
  });

  it("fires onCreateNew from the + New footer button", () => {
    const onCreateNew = vi.fn();
    render(
      <CounterpartyPicker
        visible
        counterparties={COUNTERPARTIES}
        onPick={vi.fn()}
        onCreateNew={onCreateNew}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "+ New" }));
    expect(onCreateNew).toHaveBeenCalledOnce();
  });

  it("renders nothing while not visible", () => {
    render(
      <CounterpartyPicker
        visible={false}
        counterparties={COUNTERPARTIES}
        onPick={vi.fn()}
        onCreateNew={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.queryByText("Nina")).toBeNull();
  });
});
