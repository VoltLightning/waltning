/**
 * @vitest-environment jsdom
 *
 * `SwatchPicker` — the kind's own first, then the ramp's nine, and nothing else.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SwatchPicker } from "./swatch-picker";

it("offers its kind's colour and the ramp's nine, and no free colour", () => {
  render(<SwatchPicker kind="bank" value={null} onChange={vi.fn()} />);
  expect(screen.getAllByRole("radio")).toHaveLength(10);
  expect(screen.getByRole("radio", { name: "Its kind's" }).getAttribute("aria-checked")).toBe(
    "true",
  );
});

it("hands back the key picked, and null for the kind's own", () => {
  const onChange = vi.fn();
  render(<SwatchPicker kind="bank" value="teal" onChange={onChange} />);
  fireEvent.click(screen.getByRole("radio", { name: "Violet" }));
  fireEvent.click(screen.getByRole("radio", { name: "Its kind's" }));
  expect(onChange.mock.calls).toEqual([["violet"], [null]]);
});
