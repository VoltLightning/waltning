/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { currencyCode } from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { CurrencyGrid, type CurrencyGridItem } from "./currency-grid";

const PLN: CurrencyGridItem = { code: currencyCode("PLN"), name: "Polish złoty", symbol: "zł" };
const USD: CurrencyGridItem = { code: currencyCode("USD"), name: "US dollar", symbol: "$" };
const EUR: CurrencyGridItem = { code: currencyCode("EUR"), name: "Euro", symbol: "€" };

function noop() {}

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
  const usd = screen.getByRole("radio", { name: USD.name });
  const pln = screen.getByRole("radio", { name: PLN.name });
  expect(usd.getAttribute("aria-checked")).toBe("true");
  expect(pln.getAttribute("aria-checked")).toBe("false");
});

it("a press calls onSelect with the pressed currency's code", () => {
  const onSelect = vi.fn();
  render(<CurrencyGrid currencies={[PLN, USD, EUR]} selected={null} onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("radio", { name: EUR.name }));
  expect(onSelect).toHaveBeenCalledWith(EUR.code);
});

it("disabled — a press calls nothing", () => {
  const onSelect = vi.fn();
  render(
    <CurrencyGrid currencies={[PLN, USD, EUR]} selected={PLN.code} onSelect={onSelect} disabled />,
  );
  fireEvent.click(screen.getByRole("radio", { name: USD.name }));
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
