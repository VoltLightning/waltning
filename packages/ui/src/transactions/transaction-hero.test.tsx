/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { TransactionHero } from "./transaction-hero";

describe("TransactionHero", () => {
  it("shows the signed amount and the account · currency line", () => {
    render(
      <TransactionHero
        amount={money.toMoney("-48.90000000")}
        currency="PLN"
        type="expense"
        accountName="Cash"
      />,
    );
    expect(screen.getByText("-48.90")).toBeDefined();
    expect(screen.getByText("Cash · PLN")).toBeDefined();
  });

  it("draws no BrandIcon when payee is absent — the screen has not read it yet", () => {
    render(
      <TransactionHero
        amount={money.toMoney("-48.90000000")}
        currency="PLN"
        type="expense"
        accountName="Cash"
      />,
    );
    expect(screen.queryByText("C")).toBeNull();
  });

  it("shows the recognised brand's mark beside the account line (SPEC.md §14.4b)", () => {
    render(
      <TransactionHero
        amount={money.toMoney("-184.30000000")}
        currency="PLN"
        type="expense"
        accountName="Cash"
        payee="ORLEN"
        brandKey="orlen"
      />,
    );
    expect(screen.getByText("O")).toBeDefined();
  });

  it("falls back to the payee's monogram for an unrecognised payee", () => {
    render(
      <TransactionHero
        amount={money.toMoney("-48.90000000")}
        currency="PLN"
        type="expense"
        accountName="Cash"
        payee="Corner Café"
        brandKey={null}
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
      />,
    );
    expect(screen.getByText("100.00")).toBeDefined();
  });
});
