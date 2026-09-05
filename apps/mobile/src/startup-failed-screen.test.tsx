/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@waltning/ui/i18n/provider";
import { expect, it } from "vitest";
import { StartupFailedScreen } from "./startup-failed-screen";

it("shows the Polish title and the migrator's own message, verbatim", () => {
  render(
    <I18nProvider locale="pl">
      <StartupFailedScreen error={new Error("placeholder failure reason")} />
    </I18nProvider>,
  );

  expect(screen.getByText("Nie udało się otworzyć księgi")).toBeDefined();
  expect(screen.getByText("placeholder failure reason")).toBeDefined();
});
