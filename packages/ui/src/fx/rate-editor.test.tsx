/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RateEditor } from "./rate-editor";

function noop() {}

const BASE_PROPS = {
  base: "USD",
  quote: "RUB",
  from: "2026-08-01",
  to: "2026-08-05",
  rate: "0.0104",
  onRateChange: noop,
  onCancel: noop,
};

it("counts the range and states nothing needs a second confirmation with no manual rows", () => {
  const onSubmit = vi.fn();
  render(<RateEditor {...BASE_PROPS} existingRows={[]} onSubmit={onSubmit} />);
  expect(screen.getByText("5 days")).toBeDefined();
  expect(screen.getByText("5 currently absent")).toBeDefined();
  expect(screen.getByText("0 currently manual")).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Set rate" }));
  expect(onSubmit).toHaveBeenCalledWith(false);
});

it("a manual row in range asks for a second, explicit confirmation before writing", () => {
  const onSubmit = vi.fn();
  render(
    <RateEditor
      {...BASE_PROPS}
      existingRows={[{ date: "2026-08-02", source: "manual" }]}
      onSubmit={onSubmit}
    />,
  );
  expect(screen.getByText("1 currently manual")).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Set rate" }));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText(/This replaces 1 manual rate/)).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Overwrite and set" }));
  expect(onSubmit).toHaveBeenCalledWith(true);
});

it("carried-forward rows count separately from manual and absent", () => {
  render(
    <RateEditor
      {...BASE_PROPS}
      existingRows={[
        { date: "2026-08-01", source: "carried_forward" },
        { date: "2026-08-02", source: "carried_forward" },
      ]}
      onSubmit={noop}
    />,
  );
  expect(screen.getByText("2 currently carried forward")).toBeDefined();
  expect(screen.getByText("3 currently absent")).toBeDefined();
});

it("refuses to submit with no rate typed", () => {
  render(<RateEditor {...BASE_PROPS} rate="" existingRows={[]} onSubmit={noop} />);
  expect(screen.getByRole("button", { name: "Set rate" })).toHaveProperty("disabled", true);
});

it("cancel calls back without submitting", () => {
  const onCancel = vi.fn();
  render(<RateEditor {...BASE_PROPS} existingRows={[]} onSubmit={noop} onCancel={onCancel} />);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalledTimes(1);
});
