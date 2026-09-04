/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CurrencyChip } from "./currency-chip";

function noop() {}

it("renders nothing before the first pinned currency", () => {
  const { container } = render(<CurrencyChip pinned={[]} active="PLN" onChange={noop} />);
  expect(container.firstChild).toBeNull();
});

it("a tap cycles to the next pinned currency, wrapping past the last", () => {
  const onChange = vi.fn();
  render(
    <CurrencyChip
      pinned={[{ code: "PLN" }, { code: "USD" }, { code: "EUR" }]}
      active="EUR"
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole("button"));
  expect(onChange).toHaveBeenCalledWith("PLN");
});

it("past three pinned, a tap calls onExpand instead of cycling", () => {
  const onChange = vi.fn();
  const onExpand = vi.fn();
  render(
    <CurrencyChip
      pinned={[{ code: "PLN" }, { code: "USD" }, { code: "EUR" }, { code: "GBP" }]}
      active="PLN"
      onChange={onChange}
      onExpand={onExpand}
    />,
  );
  fireEvent.click(screen.getByRole("button"));
  expect(onExpand).toHaveBeenCalledTimes(1);
  expect(onChange).not.toHaveBeenCalled();
});

it("marks every pinned currency, with the active one distinct", () => {
  render(<CurrencyChip pinned={[{ code: "PLN" }, { code: "USD" }]} active="USD" onChange={noop} />);
  expect(screen.getByText("PLN")).toBeDefined();
  expect(screen.getByText("USD")).toBeDefined();
});

// M6 — the active currency (the live pivot, say) can be outside the pinned
// set entirely. It still has to render, marked, rather than vanish.
it("M6 — an active currency outside the pinned set is appended and marked", () => {
  render(<CurrencyChip pinned={[{ code: "PLN" }, { code: "EUR" }]} active="USD" onChange={noop} />);
  expect(screen.getByText("PLN")).toBeDefined();
  expect(screen.getByText("EUR")).toBeDefined();
  const active = screen.getByText("USD");
  expect(active).toBeDefined();
  expect(getComputedStyle(active).borderBottomColor).not.toBe("rgba(0, 0, 0, 0)");
});

it("marks the active currency with its own 2px accent bar, not weight alone", () => {
  render(<CurrencyChip pinned={[{ code: "PLN" }, { code: "USD" }]} active="USD" onChange={noop} />);
  const active = screen.getByText("USD");
  const inactive = screen.getByText("PLN");
  // Both reserve the same 2px so the active row never shifts layout — only
  // the colour distinguishes which one is drawn (P5: never weight alone).
  expect(getComputedStyle(active).borderBottomWidth).toBe("2px");
  expect(getComputedStyle(inactive).borderBottomColor).toBe("rgba(0, 0, 0, 0)");
  expect(getComputedStyle(active).borderBottomColor).not.toBe("rgba(0, 0, 0, 0)");
});
