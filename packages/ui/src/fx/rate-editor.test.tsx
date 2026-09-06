/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/provider";
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

// The sentence naming the pair and the range belongs to the host's heading
// (S18's own `BottomSheet` title), so this component states the direction on
// the one label it owns — never a `→` arrow, which reads backwards for a
// figure that is units of the quote per one pivot.
it("states which way the rate reads — quote per base, never a conversion arrow", () => {
  render(<RateEditor {...BASE_PROPS} existingRows={[]} onSubmit={noop} />);
  expect(screen.getByLabelText("Rate · RUB per USD")).toBeDefined();
  expect(screen.queryByText(/Set RUB per USD/)).toBeNull();
});

it("states the host's own refusal in the sheet, where a toast behind a modal would not be seen", () => {
  render(
    <RateEditor
      {...BASE_PROPS}
      existingRows={[]}
      onSubmit={noop}
      error="A rate cannot be set for a future date."
    />,
  );
  expect(screen.getByText("A rate cannot be set for a future date.")).toBeDefined();
});

it("the second confirmation restates the typed value with its unit", () => {
  render(
    <RateEditor
      {...BASE_PROPS}
      existingRows={[{ date: "2026-08-02", source: "manual" }]}
      onSubmit={noop}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Set rate" }));
  expect(
    screen.getByText("This sets 0.0104 RUB per USD, replacing 1 manual rate set by hand."),
  ).toBeDefined();
});

it("counts the range and states nothing needs a second confirmation with no manual rows", () => {
  const onSubmit = vi.fn();
  render(<RateEditor {...BASE_PROPS} existingRows={[]} onSubmit={onSubmit} />);
  expect(screen.getByText("5 days")).toBeDefined();
  expect(screen.getByText("5 days currently absent")).toBeDefined();
  expect(screen.getByText("0 days currently manual")).toBeDefined();

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
  expect(screen.getByText("1 day currently manual")).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Set rate" }));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText(/This sets 0\.0104 RUB per USD, replacing 1 manual rate/)).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Overwrite and set" }));
  expect(onSubmit).toHaveBeenCalledWith(true);
});

// L10 — the confirm-overwrite message's own `{{rate}}` follows the reader's
// decimal mark, like every other rendered rate.
it("L10 — the second confirmation's rate follows the locale's own decimal mark", () => {
  render(
    <I18nProvider locale="pl">
      <RateEditor
        {...BASE_PROPS}
        existingRows={[{ date: "2026-08-02", source: "manual" }]}
        onSubmit={noop}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Ustaw kurs" }));
  expect(screen.getByText(/0,0104 RUB za USD/)).toBeDefined();
});

// L11 — `setManualRateInput`'s own 366-day cap, restated here so the range
// is refused before a submit round trip.
it("L11 — a range past 366 days states the cap and refuses to submit", () => {
  render(
    <RateEditor
      {...BASE_PROPS}
      from="2025-01-01"
      to="2026-01-02" // 367 days inclusive.
      existingRows={[]}
      onSubmit={noop}
    />,
  );
  expect(screen.getByText("A manual rate range cannot exceed 366 days.")).toBeDefined();
  expect(screen.getByRole("button", { name: "Set rate" })).toHaveProperty("disabled", true);
});

it("L11 — a range of exactly 366 days is allowed", () => {
  const onSubmit = vi.fn();
  render(
    <RateEditor
      {...BASE_PROPS}
      from="2025-01-01"
      to="2026-01-01" // 366 days inclusive.
      existingRows={[]}
      onSubmit={onSubmit}
    />,
  );
  expect(screen.queryByText(/cannot exceed/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Set rate" }));
  expect(onSubmit).toHaveBeenCalledWith(false);
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
  expect(screen.getByText("2 days currently carried forward")).toBeDefined();
  expect(screen.getByText("3 days currently absent")).toBeDefined();
});

it("refuses to submit with no rate typed", () => {
  render(<RateEditor {...BASE_PROPS} rate="" existingRows={[]} onSubmit={noop} />);
  expect(screen.getByRole("button", { name: "Set rate" })).toHaveProperty("disabled", true);
});

it("refuses to submit a rate of 0, even set outside RateField's own guard", () => {
  render(<RateEditor {...BASE_PROPS} rate="0" existingRows={[]} onSubmit={noop} />);
  expect(screen.getByRole("button", { name: "Set rate" })).toHaveProperty("disabled", true);
});

it("cancel calls back without submitting", () => {
  const onCancel = vi.fn();
  render(<RateEditor {...BASE_PROPS} existingRows={[]} onSubmit={noop} onCancel={onCancel} />);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalledTimes(1);
});

/**
 * The defect the `_one`/`_other` forms exist for: a one-day range read
 * "1 days". Broken once by collapsing the four keys back to a single
 * `rateEditorTotalDays` — every line below reverts to the plural noun.
 */
it('a one-day range declines every count line, never "1 days"', () => {
  render(
    <RateEditor
      {...BASE_PROPS}
      from="2026-08-01"
      to="2026-08-01"
      existingRows={[{ date: "2026-08-01", source: "carried_forward" }]}
      onSubmit={noop}
    />,
  );
  expect(screen.getByText("1 day")).toBeDefined();
  expect(screen.getByText("0 days currently absent")).toBeDefined();
  expect(screen.getByText("1 day currently carried forward")).toBeDefined();
  expect(screen.queryByText("1 days")).toBeNull();
});
