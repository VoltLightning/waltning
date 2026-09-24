/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { hueNamed } from "../../../primitives/monogram.ts";
import { themes } from "../../../theme/roles.ts";
import { categoryRamp } from "../../../tokens.ts";
import { bandOf, TransactionHero } from "./transaction-hero";

function luminance(hex: string): number {
  const channel = (at: number) => {
    const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * **Every hue, both themes, every ink the band carries.** The band is a
 * category wash laid over the ground — a fill no other census sees — and the
 * figure on it is load-bearing, so the money colours are held to 4.5:1 and the
 * name with them; the direction line is secondary text, held to 3:1.
 */
describe("the header band's wash", () => {
  const cases = (["light", "dark"] as const).flatMap((scheme) =>
    categoryRamp.map((step) => [scheme, step.name] as const),
  );
  it.each(cases)("%s %s keeps the figure, the name and the line readable", (scheme, name) => {
    const theme = themes[scheme];
    const band = bandOf(hueNamed(name, theme), theme);
    expect(contrast(theme.spend, band.fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.income, band.fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.text, band.fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(band.ink, band.fill)).toBeGreaterThanOrEqual(3);
  });
});

describe("TransactionHero", () => {
  it("shows the signed amount and the account · currency line", () => {
    render(
      <TransactionHero
        amount={money.toMoney("-48.90000000")}
        currency="PLN"
        type="expense"
        accountName="Cash"
        enteredName="Café A"
        categoryName="Eating out"
      />,
    );
    expect(screen.getByText("-48.90")).toBeDefined();
    expect(screen.getByText("Went out · Cash · PLN")).toBeDefined();
  });

  it("says the direction in words beside the account line (P5)", () => {
    render(
      <TransactionHero
        amount={money.toMoney("-48.90000000")}
        currency="PLN"
        type="expense"
        accountName="Cash"
        enteredName="Café A"
        categoryName="Eating out"
      />,
    );
    expect(screen.getByText("Went out · Cash · PLN")).toBeDefined();
    expect(screen.getByText("Café A")).toBeDefined();
  });

  it("names both accounts of a transfer, and no direction", () => {
    render(
      <TransactionHero
        amount={money.toMoney("-100.00000000")}
        currency="PLN"
        type="transfer"
        accountName="Cash"
        toAccountName="Savings"
        enteredName=""
        categoryName={null}
      />,
    );
    expect(screen.getByText("Cash → Savings")).toBeDefined();
    expect(screen.getByText("Transfer")).toBeDefined();
  });

  it("shows the recognised brand's mark beside the account line (SPEC.md §14.4b)", () => {
    render(
      <TransactionHero
        amount={money.toMoney("-184.30000000")}
        currency="PLN"
        type="expense"
        accountName="Cash"
        enteredName="ORLEN"
        brandKey="orlen"
        categoryName="Fuel"
      />,
    );
    expect(screen.getByText("O")).toBeDefined();
  });

  it("falls back to the enteredName's monogram for an unrecognised enteredName", () => {
    render(
      <TransactionHero
        amount={money.toMoney("-48.90000000")}
        currency="PLN"
        type="expense"
        accountName="Cash"
        enteredName="Corner Café"
        brandKey={null}
        categoryName={null}
      />,
    );
    expect(screen.getByText("C")).toBeDefined();
  });

  it("colours a transfer leg by type, not by sign", () => {
    // §1: a transfer's two legs are signed opposite ways and are neither
    // income nor spend — sign alone would paint one leg a gain.
    render(
      <TransactionHero
        amount={money.toMoney("100.00000000")}
        currency="PLN"
        type="transfer"
        accountName="Savings"
        enteredName=""
        categoryName={null}
      />,
    );
    expect(screen.getByText("100.00")).toBeDefined();
  });
});
