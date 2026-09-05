/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LedgerFilterRail, type LedgerFilterRailProps } from "./ledger-filter-rail";

const SCOPES = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
  { value: "shared", label: "Shared" },
  { value: "business", label: "Business" },
] as const;

function railProps(overrides: Partial<LedgerFilterRailProps> = {}): LedgerFilterRailProps {
  return {
    value: {
      text: "",
      accountIds: [],
      categoryIds: [],
      scope: "all",
      currency: "",
      counterpartyId: "",
      from: "",
      to: "",
    },
    options: {
      accounts: [{ value: "acc-1", label: "Bank A · PLN" }],
      categories: [{ value: "cat-1", label: "Groceries" }],
      currencies: [
        { value: "", label: "Every currency" },
        { value: "PLN", label: "PLN" },
      ],
      counterparties: [
        { value: "", label: "Every counterparty" },
        { value: "cp-1", label: "Corner Bakery" },
      ],
      scopes: SCOPES,
    },
    period: {
      label: "September 2026",
      isCurrent: true,
      onPrevious: vi.fn(),
      onNext: vi.fn(),
      onToday: vi.fn(),
    },
    today: "2026-09-05",
    onChangeText: vi.fn(),
    onChangeAccountIds: vi.fn(),
    onChangeCategoryIds: vi.fn(),
    onChangeScope: vi.fn(),
    onChangeCurrency: vi.fn(),
    onChangeCounterpartyId: vi.fn(),
    onChangeFrom: vi.fn(),
    onChangeTo: vi.fn(),
    ...overrides,
  };
}

describe("LedgerFilterRail", () => {
  /** S10 §4 — "account · category · scope · currency · date range · counterparty", plus search and the period. */
  it("draws every dimension §4 names, in one scroller of its own", () => {
    render(<LedgerFilterRail {...railProps()} />);

    expect(screen.getByPlaceholderText("Search payee, note, amount")).toBeDefined();
    expect(screen.getByText("September 2026")).toBeDefined();
    expect(screen.getAllByText("Account").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Category").length).toBeGreaterThan(0);
    expect(screen.getByText("Business")).toBeDefined();
    expect(screen.getAllByText("Currency").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Person or company").length).toBeGreaterThan(0);
    expect(screen.getAllByText("From").length).toBeGreaterThan(0);
    expect(screen.getAllByText("To").length).toBeGreaterThan(0);
    // The scroller is the rail's own, not the panel's — `GroundPanel` is
    // passed `scroll="own"` by the screen, and the architecture rule that
    // keeps `ScrollView` out of `apps/mobile/src` is why this component
    // exists at all.
    expect(screen.getByTestId("ledger-desk-rail")).toBeDefined();
  });

  /** S10 §4 — "each filter reports the count it excludes." */
  it("an active control says what it excludes, and an inactive one says nothing", () => {
    render(
      <LedgerFilterRail
        {...railProps({
          value: {
            text: "",
            accountIds: ["acc-1"],
            categoryIds: [],
            scope: "all",
            currency: "",
            counterpartyId: "",
            from: "",
            to: "",
          },
          exclusions: { accountIds: 96 },
        })}
      />,
    );

    expect(screen.getByText("Excludes 96 rows")).toBeDefined();
    // One note, not seven: the other six dimensions are inactive and exclude
    // nothing, so "Excludes 0" beside each would be noise.
    expect(screen.getAllByText(/^Excludes /)).toHaveLength(1);
  });

  it("a count of one is singular", () => {
    render(<LedgerFilterRail {...railProps({ exclusions: { scope: 1 } })} />);
    expect(screen.getByText("Excludes 1 row")).toBeDefined();
  });

  it("a zero count draws no note at all", () => {
    render(<LedgerFilterRail {...railProps({ exclusions: { scope: 0 } })} />);
    expect(screen.queryByText(/^Excludes /)).toBeNull();
  });

  /** Nothing active, nothing to clear — so no control for it. */
  it("Clear all appears only when the caller supplies it, and calls back", () => {
    const { unmount } = render(<LedgerFilterRail {...railProps()} />);
    expect(screen.queryByText("Clear all")).toBeNull();
    unmount();

    const onClearAll = vi.fn();
    render(<LedgerFilterRail {...railProps({ onClearAll })} />);
    fireEvent.click(screen.getByText("Clear all"));
    expect(onClearAll).toHaveBeenCalled();
  });

  it("typing in the search field reaches the caller", () => {
    const onChangeText = vi.fn();
    render(<LedgerFilterRail {...railProps({ onChangeText })} />);

    fireEvent.change(screen.getByPlaceholderText("Search payee, note, amount"), {
      target: { value: "bakery" },
    });
    expect(onChangeText).toHaveBeenCalledWith("bakery");
  });

  it("the period stepper's arrows reach the caller", () => {
    const onNext = vi.fn();
    const props = railProps();
    render(<LedgerFilterRail {...props} period={{ ...props.period, isCurrent: false, onNext }} />);

    fireEvent.click(screen.getByRole("button", { name: "Next period" }));
    expect(onNext).toHaveBeenCalled();
  });
});
