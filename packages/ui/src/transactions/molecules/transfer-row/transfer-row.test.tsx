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
    expect(screen.getByText("Transfer · Cash → Bank A")).toBeDefined();
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

/**
 * **The destination survives a narrow row.** S10's drawing gives a transfer the
 * two-line identity every other row has; one line holding both names under
 * `numberOfLines={1}` tail-truncated to *Bank A · P…* on a 390pt phone, cutting
 * away the half of a transfer that says where the money went.
 */
/** A same-currency transfer states one figure; the second is the same number again. */
it("states one amount when both legs share a currency, and two when they do not", () => {
  const { unmount } = render(
    <TransferRow
      date="2026-09-16"
      fromAccountName="Cash"
      toAccountName="Bank A"
      amount={money.toMoney("-150.00000000")}
      currency="PLN"
      toAmount={money.toMoney("150.00000000")}
      toCurrency="PLN"
    />,
  );
  expect(screen.getByText("-150.00")).toBeDefined();
  expect(screen.queryByText("150.00")).toBeNull();
  unmount();

  render(
    <TransferRow
      date="2026-09-16"
      fromAccountName="Cash"
      toAccountName="Bank A"
      amount={money.toMoney("-200.00000000")}
      currency="PLN"
      toAmount={money.toMoney("46.50000000")}
      toCurrency="EUR"
    />,
  );
  expect(screen.getByText("-200.00")).toBeDefined();
  expect(screen.getByText("46.50")).toBeDefined();
});

it("leads with the destination, and names the pair beneath it", () => {
  render(
    <TransferRow
      date="2026-09-16"
      fromAccountName="Bank A · PLN"
      toAccountName="Bank B · EUR"
      amount={money.toMoney("-200.00000000")}
      currency="PLN"
      toAmount={money.toMoney("46.50000000")}
      toCurrency="EUR"
    />,
  );
  expect(screen.getByText("To Bank B · EUR")).toBeDefined();
  expect(screen.getByText("Transfer · Bank A · PLN → Bank B · EUR")).toBeDefined();
});
