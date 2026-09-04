/**
 * @vitest-environment jsdom
 *
 * `TransferRow` — S10 §8: "a transfer is one row."
 */

import { render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { TransferRow } from "./transfer-row";

describe("TransferRow", () => {
  it("renders both accounts, once, with an arrow between them", () => {
    render(
      <TransferRow
        date="2026-08-20"
        fromAccountName="Cash"
        toAccountName="Bank A"
        amount={money.toMoney("-500.00000000")}
        currency="PLN"
        toAmount={money.toMoney("500.00000000")}
        toCurrency="PLN"
      />,
    );
    expect(screen.getByText("Cash → Bank A")).toBeDefined();
  });

  it("renders both legs' own amount, each in its own currency", () => {
    render(
      <TransferRow
        date="2026-08-20"
        fromAccountName="Bank A · PLN"
        toAccountName="Wallet · USD"
        amount={money.toMoney("-125.00000000")}
        currency="PLN"
        toAmount={money.toMoney("31.25000000")}
        toCurrency="USD"
      />,
    );
    expect(screen.getByText("-125.00")).toBeDefined();
    expect(screen.getByText("31.25")).toBeDefined();
  });

  it("shows the bare accounting date, never through a Date", () => {
    render(
      <TransferRow
        date="2026-01-05"
        fromAccountName="A"
        toAccountName="B"
        amount={money.toMoney("-1.00000000")}
        currency="PLN"
        toAmount={money.toMoney("1.00000000")}
        toCurrency="PLN"
      />,
    );
    expect(screen.getByText("01-05")).toBeDefined();
  });
});
