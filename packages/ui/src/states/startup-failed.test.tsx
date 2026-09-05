/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
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
