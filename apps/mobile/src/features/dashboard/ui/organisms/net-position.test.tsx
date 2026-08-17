/**
 * @vitest-environment jsdom
 *
 * The claim under test is §4.1's: the phone and the server compute money with
 * the same code. `money.test.ts` proves the arithmetic; this proves it survives
 * to a rendered figure on the client, which is the half that was never checked.
 *
 * A JS number holding an amount is a bug in this system, and float error does
 * not announce itself — it produces a figure that is very nearly right, on the
 * screen a person reads to decide something.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NetPosition } from "./net-position";

describe("NetPosition", () => {
  it("sums decimal strings without float error", () => {
    // `0.1 + 0.2` in floats is `0.30000000000000004`. Rendered to two places
    // that still reads `0.30`, so a float bug would hide here — the third row
    // makes the drift visible at the displayed precision.
    render(<NetPosition amounts={["0.10000000", "0.20000000", "0.00000001", "0.69999999"]} />);
    expect(screen.getByText("1.00")).toBeDefined();
  });

  it("nets a negative against a positive", () => {
    render(<NetPosition amounts={["1200.50000000", "-349.99000000", "0.49000000"]} />);
    expect(screen.getByText("851.00")).toBeDefined();
  });

  it("shows a zero rather than nothing when the amounts cancel", () => {
    // A cleared position is a real answer and must render as one. Blank would
    // read as "no data", which is the opposite of what it means.
    render(<NetPosition amounts={["10.00000000", "-10.00000000"]} />);
    expect(screen.getByText("0.00")).toBeDefined();
  });

  it("renders a zero for an empty set, not NaN", () => {
    render(<NetPosition amounts={[]} />);
    expect(screen.getByText("0.00")).toBeDefined();
  });
});
