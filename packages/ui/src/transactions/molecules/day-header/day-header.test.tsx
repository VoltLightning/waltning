/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { expect, it } from "vitest";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { DayHeader } from "./day-header";

function draw(node: React.ReactNode) {
  return render(<ThemeProvider theme={light}>{node}</ThemeProvider>);
}

it("draws the date alone where there is no total to draw", () => {
  // S10 groups by day and states its total once at the top, not per day.
  draw(<DayHeader label="Thursday 14 August" />);
  expect(screen.getByText("Thursday 14 August")).toBeTruthy();
});

it("takes the total as a node, because what belongs there depends on the day", () => {
  // An Amount on an ordinary day, an approximate one where a currency was
  // converted, a dash where a leg could not be priced — this component cannot
  // see the rows and must not decide which.
  draw(<DayHeader label="Thursday 4 June" total={<Text>—</Text>} />);
  expect(screen.getByText("—")).toBeTruthy();
});
