/**
 * @vitest-environment jsdom
 *
 * The selection and text controls — §3.7 and §3.8, checked on behaviour.
 * How they look is the visual suite's job; what they *promise* is this one's:
 * a radio group cannot lose its answer, a multi-select cannot close on a pick,
 * an error replaces a hint rather than stacking under it.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./checkbox";
import { RadioGroup } from "./radio";
import { MultiSelect, Select } from "./select";
import { TextField } from "./text-field";
import { Toggle } from "./toggle";

const KINDS = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "cash", label: "Cash", disabled: true },
] as const;

const CURRENCIES = [
  { value: "PLN", label: "Polish Złoty" },
  { value: "BYN", label: "Belarusian Ruble" },
] as const;

describe("Toggle", () => {
  it("is a switch, and flips to the opposite of what it shows", () => {
    const onChange = vi.fn();
    render(<Toggle label="Business account" value={false} onChange={onChange} />);

    const control = screen.getByRole("switch", { name: "Business account" });
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does nothing while disabled", () => {
    const onChange = vi.fn();
    render(<Toggle label="Business account" value={false} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Checkbox", () => {
  it("checks and unchecks through the same handler", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Checkbox label="Include archived" checked={false} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Include archived" }));
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(<Checkbox label="Include archived" checked onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });
});

describe("RadioGroup", () => {
  it("announces the group and selects exactly one", () => {
    const onChange = vi.fn();
    render(<RadioGroup label="Account kind" options={KINDS} value={null} onChange={onChange} />);

    expect(screen.getByRole("radiogroup", { name: "Account kind" })).toBeDefined();
    fireEvent.click(screen.getByRole("radio", { name: "Savings" }));
    expect(onChange).toHaveBeenCalledWith("savings");
  });

  /** Re-picking the answer is a no-op — a group never loses one. */
  it("does not re-fire for the already-selected option", () => {
    const onChange = vi.fn();
    render(<RadioGroup label="Account kind" options={KINDS} value="savings" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Savings" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuses a disabled option", () => {
    const onChange = vi.fn();
    render(<RadioGroup label="Account kind" options={KINDS} value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Cash" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("TextField", () => {
  it("is reachable by its label and enforces the length cap", () => {
    render(<TextField label="Name" value="Bank A" onChangeText={vi.fn()} maxLength={120} />);
    expect(screen.getByLabelText("Name").getAttribute("maxlength")).toBe("120");
  });

  /** The error answers the hint's question at a later moment — never both. */
  it("replaces the hint with the error, and restores it after", () => {
    const { rerender } = render(
      <TextField label="Name" value=" " onChangeText={vi.fn()} hint="Any name works." />,
    );
    expect(screen.getByText("Any name works.")).toBeDefined();

    rerender(
      <TextField
        label="Name"
        value=" "
        onChangeText={vi.fn()}
        hint="Any name works."
        error="A name needs a visible character."
      />,
    );
    expect(screen.getByText("A name needs a visible character.")).toBeDefined();
    expect(screen.queryByText("Any name works.")).toBeNull();
  });

  it("counts up against the cap, only when a cap exists", () => {
    const { rerender } = render(
      <TextField label="Name" value="Bank" onChangeText={vi.fn()} maxLength={120} counter />,
    );
    expect(screen.getByText("4/120")).toBeDefined();

    // A counter with no limit is not information — it does not render.
    rerender(<TextField label="Name" value="Bank" onChangeText={vi.fn()} counter />);
    expect(screen.queryByText(/\/\d/)).toBeNull();
  });
});

describe("Select", () => {
  it("keeps the options folded until asked", () => {
    render(
      <Select
        label="Currency"
        placeholder="Choose"
        options={CURRENCIES}
        value={null}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole("radio")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Currency" }));
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  /** Picking is answering: the pick lands and the panel folds. */
  it("closes on a pick and restates the answer in the field", () => {
    const onChange = vi.fn();
    render(
      <Select
        label="Currency"
        placeholder="Choose"
        options={CURRENCIES}
        value={null}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Currency" }));
    fireEvent.click(screen.getByRole("radio", { name: "Polish Złoty" }));

    expect(onChange).toHaveBeenCalledWith("PLN");
    expect(screen.queryByRole("radio")).toBeNull();
  });
});

describe("MultiSelect", () => {
  /** Picking is collecting: the panel stays open across picks. */
  it("stays open, grows the collection, and can shrink it", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MultiSelect
        label="Currencies"
        placeholder="Choose"
        options={CURRENCIES}
        values={[]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Currencies" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Polish Złoty" }));
    expect(onChange).toHaveBeenCalledWith(["PLN"]);

    rerender(
      <MultiSelect
        label="Currencies"
        placeholder="Choose"
        options={CURRENCIES}
        values={["PLN"]}
        onChange={onChange}
      />,
    );
    // Still open — and unpicking filters rather than appending.
    fireEvent.click(screen.getByRole("checkbox", { name: "Polish Złoty" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  /** The field restates the labels themselves — never an invented count. */
  it("joins the chosen labels in the field", () => {
    render(
      <MultiSelect
        label="Currencies"
        placeholder="Choose"
        options={CURRENCIES}
        values={["PLN", "BYN"]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Polish Złoty · Belarusian Ruble")).toBeDefined();
  });
});
