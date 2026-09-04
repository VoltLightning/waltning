/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgeingBar } from "./ageing-bar";

describe("AgeingBar", () => {
  it("states the age as 'old', never 'overdue'", () => {
    render(<AgeingBar ageDays={62} bucket="61-90" />);
    expect(screen.getByText("62 days · old")).toBeDefined();
  });

  it.each([
    ["0-30", 5],
    ["31-60", 45],
    ["61-90", 75],
    ["90+", 120],
  ] as const)("renders the %s bucket", (bucket, ageDays) => {
    render(<AgeingBar ageDays={ageDays} bucket={bucket} />);
    expect(screen.getByRole("progressbar")).toBeDefined();
  });
});
