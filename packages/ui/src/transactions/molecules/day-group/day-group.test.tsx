/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { Text, View } from "react-native";
import { expect, it } from "vitest";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles";
import { DayGroup } from "./day-group";

function draw(children: React.ReactNode) {
  render(
    <ThemeProvider theme={light}>
      <DayGroup label="September 9, 2026">{children}</DayGroup>
    </ThemeProvider>,
  );
}

/**
 * The element around a row: the bordered surface itself for a first row, which
 * is not wrapped, and the divider `View` for every row after it.
 */
function wrapperOf(text: string) {
  return screen.getByText(text).parentElement as HTMLElement;
}

/** A row after the first sits in a divider wrapper; its parent is the surface. */
function surfaceOf(text: string) {
  return wrapperOf(text).parentElement as HTMLElement;
}

it("draws a hairline between rows and none above the first", () => {
  draw([<Text key="a">Row A</Text>, <Text key="b">Row B</Text>]);
  expect(wrapperOf("Row A"), "the first row sits directly on the surface").toBe(surfaceOf("Row B"));
  expect(getComputedStyle(wrapperOf("Row B")).borderTopWidth).toBe("1px");
});

/**
 * **`Children.map` counted the children that were not there.** A row behind a
 * failed condition is `false`, and `false` took index 0 — so the first row a
 * reader could see wore the divider that belongs *between* rows. `DayGroup` is
 * the one anatomy a day has on three pages, and every one of them has rows
 * that come and go.
 */
it("does not count a child that rendered nothing", () => {
  const hidden = false;
  draw([
    hidden ? <Text key="z">Hidden</Text> : null,
    <Text key="a">Row A</Text>,
    <Text key="b">Row B</Text>,
  ]);
  expect(wrapperOf("Row A"), "the first visible row is the first row").toBe(surfaceOf("Row B"));
  expect(getComputedStyle(wrapperOf("Row B")).borderTopWidth).toBe("1px");
});

it("draws no divider over a gap in the middle", () => {
  draw([<Text key="a">Row A</Text>, null, <Text key="b">Row B</Text>]);
  // Two rows, one divider: the wrapper around B is the only bordered box.
  const surface = wrapperOf("Row B").parentElement as HTMLElement;
  const bordered = Array.from(surface.children).filter(
    (child) => getComputedStyle(child).borderTopWidth === "1px",
  );
  expect(bordered.length).toBe(1);
  expect(surface.children.length).toBe(2);
});

it("flattens a nested array of rows", () => {
  draw([
    [<Text key="a">Row A</Text>, <Text key="b">Row B</Text>],
    <View key="c">
      <Text>Row C</Text>
    </View>,
  ]);
  expect(getComputedStyle(wrapperOf("Row B")).borderTopWidth).toBe("1px");
});
