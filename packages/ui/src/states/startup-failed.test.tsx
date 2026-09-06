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
  expect(
    screen.getByText("Another tab still has the ledger open. Close it and try again."),
  ).toBeDefined();

  fireEvent.click(screen.getByText("Try again"));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

/**
 * The recoverable branch has one producer, and what it wrote is a paragraph of
 * English about `createSyncAccessHandle`. It belongs in the development log,
 * not centred on a screen in place of an action.
 */
it("keeps the browser's own sentence off the recoverable screen", () => {
  const refusal = new Error(
    "Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle': Access Handles cannot be created…",
  );

  render(
    <I18nProvider locale="pl">
      <StartupFailed error={refusal} onRetry={noop} />
    </I18nProvider>,
  );

  expect(screen.queryByText(refusal.message)).toBeNull();
  expect(
    screen.getByText("Księga jest wciąż otwarta w innej karcie. Zamknij ją i spróbuj ponownie."),
  ).toBeDefined();
});

function noop() {}
