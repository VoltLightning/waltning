/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { toMoney } from "@waltning/core/money";
import { describe, expect, it, vi } from "vitest";
import { CounterpartyForm, type CounterpartyFormValues } from "./counterparty-form";

const INITIAL: CounterpartyFormValues = {
  name: "",
  kind: "person",
  settlementCurrency: null,
  contact: "",
  note: "",
};

const CURRENCIES = [
  { code: "PLN", name: "Polish Złoty" },
  { code: "EUR", name: "Euro" },
];

describe("CounterpartyForm", () => {
  it("fires onNameBlur on blur of the name field — never on every keystroke", () => {
    const onNameBlur = vi.fn();
    render(
      <CounterpartyForm
        initial={INITIAL}
        currencies={CURRENCIES}
        matches={[]}
        onNameBlur={onNameBlur}
        onSame={vi.fn()}
        onDifferent={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    const nameField = screen.getByLabelText("Name");
    fireEvent.change(nameField, { target: { value: "Ania" } });
    expect(onNameBlur).not.toHaveBeenCalled();
    fireEvent.blur(nameField);
    expect(onNameBlur).toHaveBeenCalledWith("Ania");
  });

  it("shows one MatchWarning per candidate, each with its own actions", () => {
    render(
      <CounterpartyForm
        initial={INITIAL}
        currencies={CURRENCIES}
        matches={[
          {
            id: "nina",
            name: "Nina",
            balance: toMoney("840"),
            currency: "PLN",
            transactionCount: 23,
          },
          {
            id: "ninon",
            name: "Ninon",
            balance: toMoney("0"),
            currency: "PLN",
            transactionCount: 1,
          },
        ]}
        onNameBlur={vi.fn()}
        onSame={vi.fn()}
        onDifferent={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText("Nina")).toBeDefined();
    expect(screen.getByText("Ninon")).toBeDefined();
    expect(screen.getAllByText("This is the same one")).toHaveLength(2);
  });

  it("reports which candidate 'same' or 'different' was pressed for", () => {
    const onSame = vi.fn();
    const onDifferent = vi.fn();
    render(
      <CounterpartyForm
        initial={INITIAL}
        currencies={CURRENCIES}
        matches={[
          {
            id: "nina",
            name: "Nina",
            balance: toMoney("840"),
            currency: "PLN",
            transactionCount: 23,
          },
        ]}
        onNameBlur={vi.fn()}
        onSame={onSame}
        onDifferent={onDifferent}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("These are different"));
    expect(onDifferent).toHaveBeenCalledWith("nina");
    expect(onSame).not.toHaveBeenCalled();
  });

  it("disables Save until a name is typed", () => {
    render(
      <CounterpartyForm
        initial={INITIAL}
        currencies={CURRENCIES}
        matches={[]}
        onNameBlur={vi.fn()}
        onSame={vi.fn()}
        onDifferent={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
  });

  it("saves the trimmed name and every field", () => {
    const onSave = vi.fn();
    render(
      <CounterpartyForm
        initial={INITIAL}
        currencies={CURRENCIES}
        matches={[]}
        onNameBlur={vi.fn()}
        onSame={vi.fn()}
        onDifferent={vi.fn()}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Nina  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      name: "Nina",
      kind: "person",
      settlementCurrency: null,
      contact: "",
      note: "",
    });
  });

  it("offers Archive only in edit mode (onArchive present)", () => {
    const { rerender } = render(
      <CounterpartyForm
        initial={{ ...INITIAL, name: "Nina" }}
        currencies={CURRENCIES}
        matches={[]}
        onNameBlur={vi.fn()}
        onSame={vi.fn()}
        onDifferent={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();

    rerender(
      <CounterpartyForm
        initial={{ ...INITIAL, name: "Nina" }}
        currencies={CURRENCIES}
        matches={[]}
        onNameBlur={vi.fn()}
        onSame={vi.fn()}
        onDifferent={vi.fn()}
        onArchive={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Archive" })).toBeDefined();
  });
});
