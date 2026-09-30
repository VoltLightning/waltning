/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n/provider";
import { RenderBoundary } from "./render-boundary";

let broken = true;

function Screen() {
  if (broken) throw new Error("placeholder render failure");
  return <div>screen drawn</div>;
}

beforeEach(() => {
  broken = true;
  // React logs every caught render error; the test expects one.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("shows a recoverable screen instead of a blank one when a child throws on render", () => {
  render(
    <I18nProvider locale="en">
      <RenderBoundary>
        <Screen />
      </RenderBoundary>
    </I18nProvider>,
  );

  expect(screen.getByText("This screen stopped working")).toBeDefined();
  expect(screen.getByText("Try again")).toBeDefined();
  // The error is a developer's sentence: it goes to Diagnostics, not the screen.
  expect(screen.queryByText("placeholder render failure")).toBeNull();
});

it("reports the error once, with the component stack", () => {
  const onError = vi.fn();
  render(
    <I18nProvider locale="en">
      <RenderBoundary onError={onError}>
        <Screen />
      </RenderBoundary>
    </I18nProvider>,
  );

  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError.mock.calls[0]?.[0]).toHaveProperty("message", "placeholder render failure");
  expect(typeof onError.mock.calls[0]?.[1]).toBe("string");
});

it("mounts the children afresh on Try again", () => {
  render(
    <I18nProvider locale="en">
      <RenderBoundary>
        <Screen />
      </RenderBoundary>
    </I18nProvider>,
  );

  broken = false;
  fireEvent.click(screen.getByText("Try again"));

  expect(screen.getByText("screen drawn")).toBeDefined();
  expect(screen.queryByText("This screen stopped working")).toBeNull();
});

it("says it in German on a German phone", () => {
  render(
    <I18nProvider locale="de">
      <RenderBoundary>
        <Screen />
      </RenderBoundary>
    </I18nProvider>,
  );

  expect(screen.getByText("Dieser Bildschirm funktioniert nicht mehr")).toBeDefined();
});
