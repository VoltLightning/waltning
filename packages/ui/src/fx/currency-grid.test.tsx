/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { currencyCode } from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { CurrencyGrid, type CurrencyGridItem } from "./currency-grid";

const PLN: CurrencyGridItem = { code: currencyCode("PLN"), name: "Polish złoty", symbol: "zł" };
const USD: CurrencyGridItem = { code: currencyCode("USD"), name: "US dollar", symbol: "$" };
const EUR: CurrencyGridItem = { code: currencyCode("EUR"), name: "Euro", symbol: "€" };

function noop() {}

/** `CurrencyTile`'s own accessible name: code first, same as every figure the account will carry. */
function accessibleName(item: CurrencyGridItem): string {
  return `${item.code} — ${item.name}`;
}

it("renders nothing when the currency set is empty", () => {
  const { container } = render(<CurrencyGrid currencies={[]} selected={null} onSelect={noop} />);
  expect(container.firstChild).toBeNull();
});

it("renders one radio per currency, inside a radiogroup", () => {
  render(<CurrencyGrid currencies={[PLN, USD, EUR]} selected={PLN.code} onSelect={noop} />);
  expect(screen.getByRole("radiogroup")).toBeDefined();
  expect(screen.getAllByRole("radio")).toHaveLength(3);
});

it("marks the selected currency checked, and no other", () => {
  render(<CurrencyGrid currencies={[PLN, USD, EUR]} selected={USD.code} onSelect={noop} />);
  const usd = screen.getByRole("radio", { name: accessibleName(USD) });
  const pln = screen.getByRole("radio", { name: accessibleName(PLN) });
  expect(usd.getAttribute("aria-checked")).toBe("true");
  expect(pln.getAttribute("aria-checked")).toBe("false");
});

it("a press calls onSelect with the pressed currency's code", () => {
  const onSelect = vi.fn();
  render(<CurrencyGrid currencies={[PLN, USD, EUR]} selected={null} onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("radio", { name: accessibleName(EUR) }));
  expect(onSelect).toHaveBeenCalledWith(EUR.code);
});

it("disabled — a press calls nothing", () => {
  const onSelect = vi.fn();
  render(
    <CurrencyGrid currencies={[PLN, USD, EUR]} selected={PLN.code} onSelect={onSelect} disabled />,
  );
  fireEvent.click(screen.getByRole("radio", { name: accessibleName(USD) }));
  expect(onSelect).not.toHaveBeenCalled();
});

it("every tile shows its code, symbol and name", () => {
  render(<CurrencyGrid currencies={[PLN]} selected={null} onSelect={noop} />);
  expect(screen.getByText("PLN")).toBeDefined();
  expect(screen.getByText("zł")).toBeDefined();
  expect(screen.getByText("Polish złoty")).toBeDefined();
});

it("carries the caller's label on the radiogroup", () => {
  render(<CurrencyGrid currencies={[PLN]} selected={null} onSelect={noop} label="Currency" />);
  expect(screen.getByRole("radiogroup", { name: "Currency" })).toBeDefined();
});

/**
 * The desk branch — driven the same way `use-breakpoint.test.tsx` drives it:
 * a real jsdom resize, not a mock of the hook. Last in the file and reset
 * afterwards, since `useWindowDimensions`' own cache is process-wide and
 * would otherwise leak the desk width into every test declared after this
 * one.
 */
function resizeTo(width: number) {
  Object.defineProperty(document.documentElement, "clientWidth", {
    value: width,
    configurable: true,
  });
  window.dispatchEvent(new Event("resize"));
}

it("four cells per row at the desk breakpoint", () => {
  resizeTo(1024);
  render(<CurrencyGrid currencies={[PLN, USD, EUR]} selected={null} onSelect={noop} />);
  for (const radio of screen.getAllByRole("radio")) {
    expect(getComputedStyle(radio.parentElement as Element).flexBasis).toBe("23%");
  }
  resizeTo(390);
});
