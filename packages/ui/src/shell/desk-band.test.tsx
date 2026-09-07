/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme/provider";
import { light } from "../theme/roles.ts";
import { CurrencyChip, DeskBand, DeskNavItem } from "./desk-band";

function Marker({ children }: { children: string }) {
  return <Text>{children}</Text>;
}

const SLOTS = {
  brand: <Marker>Brand</Marker>,
  nav: <Marker>Nav</Marker>,
  commandBar: <Marker>CommandBar</Marker>,
  currency: <Marker>Currency</Marker>,
  scope: <Marker>Scope</Marker>,
  hero: <Marker>Hero</Marker>,
};

describe("DeskBand", () => {
  it("expanded renders every slot", () => {
    render(<DeskBand {...SLOTS} />);

    expect(screen.getByText("Brand")).toBeDefined();
    expect(screen.getByText("Nav")).toBeDefined();
    expect(screen.getByText("CommandBar")).toBeDefined();
    expect(screen.getByText("Currency")).toBeDefined();
    expect(screen.getByText("Scope")).toBeDefined();
    expect(screen.getByText("Hero")).toBeDefined();
  });

  it("collapsed drops only the currency chip", () => {
    render(<DeskBand {...SLOTS} collapsed />);

    expect(screen.getByText("Brand")).toBeDefined();
    expect(screen.getByText("Nav")).toBeDefined();
    expect(screen.getByText("Hero")).toBeDefined();
    expect(screen.getByText("CommandBar")).toBeDefined();
    expect(screen.getByText("Scope")).toBeDefined();
    expect(screen.queryByText("Currency")).toBeNull();
  });
});

describe("DeskNavItem", () => {
  it("announces the active route as selected and dispatches a press", () => {
    const onPress = vi.fn();
    render(<DeskNavItem label="Ledger" active onPress={onPress} />);

    const tab = screen.getByRole("tab", { name: "Ledger" });
    expect(tab.getAttribute("aria-selected")).toBe("true");

    fireEvent.click(tab);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("CurrencyChip", () => {
  it("renders nothing before the ledger has a currency", () => {
    const { container } = render(<CurrencyChip currency={null} />);
    expect(container.textContent).toBe("");
  });

  it("shows the code otherwise", () => {
    render(<CurrencyChip currency="PLN" />);
    expect(screen.getByText("PLN")).toBeDefined();
  });
});

/**
 * **The ring on the band, asserted where it renders.** `theme.test.tsx` proves
 * `shellFocusRing` clears 3:1 on `shell` — a property of two hex strings, which
 * cannot notice this control going back to the green one. The whole ring fix
 * was deletable with the suite green, the same shape as the `tone` prop that
 * shipped unasserted a round earlier. The nav has no tone to choose: it is only
 * ever on the band.
 */
it("focuses a nav item with the band's ring", () => {
  const view = render(
    <ThemeProvider theme={light}>
      <DeskNavItem label="Ledger" active onPress={vi.fn()} />
    </ThemeProvider>,
  );
  const item = view.getByRole("tab");
  fireEvent.focusIn(item);
  expect(getComputedStyle(item).outlineColor).toBe("rgb(242, 240, 231)");
  view.unmount();
});
