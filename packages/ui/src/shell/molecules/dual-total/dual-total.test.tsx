/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import * as money from "@waltning/core/money";
import { describe, expect, it } from "vitest";
import { DualTotal } from "./dual-total";

const MINE = money.toMoney("12480.20");
const OURS = money.toMoney("18940.60");

function textOf(container: HTMLElement): string {
  return (container.textContent ?? "").replace(/ /g, " ");
}

describe("DualTotal", () => {
  it("shows mine dominant and ours secondary", () => {
    const { container } = render(<DualTotal mine={MINE} ours={OURS} currency="PLN" />);
    expect(screen.getByText("mine")).toBeDefined();
    expect(screen.getByText("ours")).toBeDefined();
    expect(textOf(container)).toContain("12 480.20 PLN");
    expect(textOf(container)).toContain("18 940.60 PLN");
  });

  it("degrades to a single figure when there is no shared account", () => {
    render(<DualTotal mine={MINE} ours={null} currency="PLN" />);
    expect(screen.getByText("mine")).toBeDefined();
    expect(screen.queryByText("ours")).toBeNull();
  });

  it("renders both figures whether it leads a stack or follows it", () => {
    const { container: leadContainer } = render(
      <DualTotal mine={MINE} ours={OURS} currency="PLN" lead={true} />,
    );
    const { container: restContainer } = render(
      <DualTotal mine={MINE} ours={OURS} currency="BYN" lead={false} />,
    );
    expect(textOf(leadContainer)).toContain("12 480.20 PLN");
    expect(textOf(restContainer)).toContain("12 480.20 BYN");
  });
});
