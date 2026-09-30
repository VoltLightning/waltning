/**
 * @vitest-environment jsdom
 *
 * `Allocate` (S36) — the field a person edits a share in is seeded the way a
 * person writes a figure: the currency's decimals, the locale's mark. The
 * pot's own balance is `numeric(20,8)`, which is storage and not a thing to
 * put in a text field.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createPhoneLedger } from "@waltning/client/ledger/create-phone-ledger";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { basePort } from "@waltning/client/ledger/test-port";
import { accountingDate } from "@waltning/core/date";
import { id } from "@waltning/core/id";
import { currencyCode, toMoney } from "@waltning/core/money";
import type { Locale } from "@waltning/ui/i18n/locales";
import { I18nProvider } from "@waltning/ui/i18n/provider";
import { afterEach, describe, expect, it, vi } from "vitest";

const POT = id<"accounts">("44444444-4444-4444-8444-444444444444");

const router = { push: vi.fn(), back: vi.fn(), canGoBack: () => true, dismissTo: vi.fn() };

vi.mock("expo-router", () => ({
  get router() {
    return router;
  },
  useLocalSearchParams: () => ({ account: POT }),
}));

import Allocate from "./allocate-screen";

function controller() {
  const port = basePort({
    listAccounts: () => [
      {
        id: POT,
        name: "Shared clearing",
        kind: "clearing",
        currency: currencyCode("PLN"),
        decimals: 2,
        balance: toMoney("400"),
        groupId: null,
        ownership: "own",
        isBusiness: false,
        archived: false,
        hidden: false,
        inTotal: true,
        color: null,
        expectedBalance: null,
        openingBalance: toMoney("0"),
        openingDate: null,
        memo: "",
        version: 1,
        capturable: true,
      },
    ],
  });
  return createPhoneLedger(port, {
    capture: () => ({
      date: accountingDate("2026-08-06"),
      timeZone: "Europe/Warsaw",
      offsetMinutes: 120,
      at: new Date("2026-08-06T10:00:00Z"),
    }),
    id: () => id("33333333-3333-4333-8333-333333333333"),
  });
}

afterEach(cleanup);

describe("Allocate — the custom field's seed", () => {
  const cases: readonly (readonly [Locale, string])[] = [
    ["en", "400.00"],
    ["de", "400,00"],
    ["pl", "400,00"],
    ["ru", "400,00"],
    ["be", "400,00"],
  ];

  it.each(cases)("shows the pot at two decimals with the %s mark, never eight", (locale, shown) => {
    render(
      <I18nProvider locale={locale}>
        <LedgerProvider controller={controller()}>
          <Allocate />
        </LedgerProvider>
      </I18nProvider>,
    );

    // Editing a share is what makes the split custom; the field is then seeded.
    const edit = screen.getAllByRole("button").find((node) => {
      const label = node.getAttribute("aria-label") ?? "";
      return label !== "" && node.textContent?.includes("400") === true;
    });
    expect(edit, "the row's figure is the button that starts editing").toBeDefined();
    fireEvent.click(edit as HTMLElement);

    const field = screen.getByRole("textbox") as HTMLInputElement;
    expect(field.value).toBe(shown);
  });
});
