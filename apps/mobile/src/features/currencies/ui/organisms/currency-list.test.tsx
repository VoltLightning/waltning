/**
 * @vitest-environment jsdom
 *
 * The first render test in this repository.
 *
 * Until now no component anywhere had been rendered by anything except a
 * browser I opened by hand. `pnpm verify` typechecked the props and ran none of
 * the code: a component could return the wrong figure, drop a row, or render
 * nothing at all, and the gate stayed green.
 *
 * `react-native` resolves to `react-native-web` here (`vitest.config.ts`), so
 * this exercises the code the browser actually runs rather than a mock of it.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Currency } from "../../api/use-currencies.ts";
import { CurrencyList } from "./currency-list";

/**
 * Placeholders, as everything in this repository is — the ledger is private and
 * the repo is public. The shape is the server's declared `CurrencySummary`.
 */
const currency = (over: Partial<Currency> & Pick<Currency, "code">): Currency => ({
  name: "Placeholder Currency",
  symbol: "¤",
  decimals: 2,
  isPivot: false,
  pinned: false,
  archived: false,
  ...over,
});

describe("CurrencyList", () => {
  it("renders one row per currency", () => {
    render(
      <CurrencyList
        currencies={[
          currency({ code: "AAA", name: "Currency A" }),
          currency({ code: "BBB", name: "Currency B" }),
        ]}
      />,
    );

    expect(screen.getByText("AAA")).toBeDefined();
    expect(screen.getByText("BBB")).toBeDefined();
    expect(screen.getByText("Currency A")).toBeDefined();
  });

  it("marks the pivot currency, and only that one", () => {
    // The pivot is what every stored rate is quoted against (§7.0). Showing it
    // on the wrong row, or on none, misreads the whole FX table.
    render(
      <CurrencyList
        currencies={[
          currency({ code: "AAA" }),
          currency({ code: "BBB", isPivot: true }),
          currency({ code: "CCC" }),
        ]}
      />,
    );

    expect(screen.getAllByText("pivot")).toHaveLength(1);
  });

  it("says so when there are none, rather than rendering nothing", () => {
    // An empty list and a list that failed to load look identical when the
    // component renders nothing — §8's rule. A blank area is not an answer.
    render(<CurrencyList currencies={[]} />);
    expect(screen.getByText(/no currencies/i)).toBeDefined();
  });
});
