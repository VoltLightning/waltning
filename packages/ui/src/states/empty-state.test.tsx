/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/provider";
import { EmptyState } from "./empty-state";

function withI18n(node: React.ReactNode) {
  return render(<I18nProvider>{node}</I18nProvider>);
}

it("offers only Create account in the checkpoint first-run state", () => {
  render(
    <EmptyState
      variant="first-run"
      title="No accounts yet"
      body="Create one account to start your phone ledger."
      primaryAction={{ label: "Create account", onPress: vi.fn() }}
    />,
  );
  expect(screen.getByText("No accounts yet")).toBeDefined();
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Create account" })).toBeDefined();
  expect(screen.queryByText(/Import/)).toBeNull();
});

it("names the excluding filter's hidden count as a fixed, non-declining line", () => {
  withI18n(
    <EmptyState
      variant="filtered"
      title="No transactions match"
      body="The Needs attention filter is excluding rows."
      count={214}
      primaryAction={{ label: "Clear filter", onPress: vi.fn() }}
    />,
  );
  expect(screen.getByText("Hidden by filters: 214")).toBeDefined();
});

it("renders no count line for a variant that carries none", () => {
  withI18n(
    <EmptyState
      variant="range"
      title="Nothing in August"
      body="The nearest period with activity is June 2026."
      primaryAction={{ label: "Go to June", onPress: vi.fn() }}
    />,
  );
  expect(screen.queryByText(/Hidden by filters/)).toBeNull();
});
