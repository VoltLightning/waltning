/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/provider";
import { StartupFailed } from "./startup-failed";

it("shows the Polish title and the migrator's own message, verbatim", () => {
  render(
    <I18nProvider locale="pl">
      <StartupFailed error={new Error("placeholder failure reason")} />
    </I18nProvider>,
  );

  expect(screen.getByText("Nie udało się otworzyć księgi")).toBeDefined();
  expect(screen.getByText("placeholder failure reason")).toBeDefined();
});

/** No `onRetry` is the terminal claim — a migration refusal will refuse again. */
it("offers nothing to press when there is nothing another attempt could clear", () => {
  render(<StartupFailed error={new Error("placeholder failure reason")} />);

  expect(screen.getByText("Won't retry")).toBeDefined();
  expect(screen.queryByText("Try again")).toBeNull();
});

it("offers the attempt, and runs it, when the failure is one a retry can clear", () => {
  const onRetry = vi.fn();
  render(<StartupFailed error={new Error("placeholder failure reason")} onRetry={onRetry} />);

  expect(screen.getByText("Temporary")).toBeDefined();

  fireEvent.click(screen.getByText("Try again"));
  expect(onRetry).toHaveBeenCalledTimes(1);
});
