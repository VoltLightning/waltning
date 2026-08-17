/**
 * @vitest-environment jsdom
 *
 * `<TransferAmount>` — the component that makes FX cost visible, checked on the
 * worked example in `design-system/04` §4.3.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TransferAmount } from "./transfer-amount.tsx";

const example = {
  from: { account: "Household", currency: "USD", amount: "150.00000000" },
  to: { account: "Cash", currency: "PLN", amount: "565.20000000" },
  referenceRate: "3.81000000",
} as const;

describe("TransferAmount", () => {
  it("reproduces the specification's worked example", () => {
    // 150,00 $ → 565,20 zł · realized 3,7680 · reference 3,8100 · spread 6,30.
    // Recomputed rather than copied: three worked examples in this
    // specification did not compute, one by a factor of ten.
    render(<TransferAmount {...example} />);
    expect(screen.getByText(/3\.7680/)).toBeDefined();
    expect(screen.getByText(/3\.8100/)).toBeDefined();
    expect(screen.getByText(/6\.30/)).toBeDefined();
  });

  it("shows both amounts, because a transfer has two", () => {
    // §7.2: a transfer contributes different figures to each account. A
    // component showing one cannot express that, and summing `amount_original`
    // on the destination is the specific mistake §1 names.
    render(<TransferAmount {...example} />);
    expect(screen.getByText("150.00")).toBeDefined();
    expect(screen.getByText("565.20")).toBeDefined();
  });

  it("says nothing about spread when there is none", () => {
    // A spread of 0,00 on every row trains people to stop reading the line, and
    // then the one that is not zero reads the same as the ones that were.
    const { container } = render(
      <TransferAmount
        from={{ account: "A", currency: "USD", amount: "100.00000000" }}
        to={{ account: "B", currency: "PLN", amount: "400.00000000" }}
        referenceRate="4.00000000"
      />,
    );
    expect(container.textContent).not.toContain("spread");
  });

  it("does not divide by zero on a transfer of nothing", () => {
    // A transfer of zero has no realized rate. Saying so beats `Infinity`.
    const { container } = render(
      <TransferAmount
        from={{ account: "A", currency: "USD", amount: "0.00000000" }}
        to={{ account: "B", currency: "PLN", amount: "0.00000000" }}
        referenceRate="4.00000000"
      />,
    );
    expect(container.textContent).toContain("realized —");
    expect(container.textContent).not.toContain("Infinity");
  });
});
