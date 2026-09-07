/** @vitest-environment jsdom */

import { render } from "@testing-library/react";
import { currencyCode, toMoney } from "@waltning/core/money";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n/provider";
import { ThemeProvider } from "../../../theme/provider";
import { light } from "../../../theme/roles.ts";
import { EntryRow, type LedgerEntry } from "./entry-row";

const ROW: LedgerEntry = {
  id: "t1",
  date: "2026-09-03",
  type: "expense",
  payee: "Café A · Downtown",
  categoryName: "Food",
  accountName: "Bank A",
  amount: toMoney("48.90"),
  currency: currencyCode("PLN"),
  decimals: 2,
  isBusiness: false,
  brandKey: null,
};

function draw(props: Partial<Parameters<typeof EntryRow>[0]> = {}) {
  return render(
    <ThemeProvider theme={light}>
      <I18nProvider>
        <EntryRow row={ROW} onPress={vi.fn()} {...props} />
      </I18nProvider>
    </ThemeProvider>,
  );
}

/**
 * **The content is the name.**
 *
 * The ledger used to wrap this row in a `Pressable` carrying
 * `accessibilityLabel={row.payee}`, and a label on a pressable *replaces* the
 * name composed from its content — so the main list of a money app announced
 * a payee and never the amount. `net-worth-strip` documents the same defect
 * and the same fix; nothing asserted it here, which is how it survived.
 */
it("reads the figure as part of the row's own name", () => {
  const view = draw();
  // `getByRole(name)` computes the *accessible* name — which is the whole
  // point. `textContent` would pass with the defect in place, because the
  // content is still in the DOM; an `accessibilityLabel` on the pressable
  // just stops a reader ever reaching it.
  expect(view.getByRole("button", { name: /Café A/ }), "the payee").toBeDefined();
  expect(
    view.getByRole("button", { name: /48\.90/ }),
    "the figure — the thing the row is about",
  ).toBeDefined();
  view.unmount();
});

/** The account is the ledger's business, not a counterparty history's. */
it("names the account only when asked", () => {
  const without = draw();
  expect(without.queryByRole("button", { name: /Bank A/ })).toBeNull();
  without.unmount();

  const with_ = draw({ withAccount: true });
  expect(with_.getByRole("button", { name: /Bank A/ })).toBeDefined();
  with_.unmount();
});
