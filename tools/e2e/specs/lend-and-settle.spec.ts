/**
 * J7 — lend and settle (`docs/specification/flows/J07-lend-and-settle.md`):
 * a capture with a counterparty and the `debt` role (`transactions.role.debt`
 * — "Debt — expected back", `packages/ui/src/i18n/en.ts`) shows up on S12
 * Debt, and S13's own `Settle` closes it — the same sheet
 * `counterparty-screens.test.tsx`'s "settles through the sheet" test drives.
 */

import { expect, test } from "@playwright/test";
import { createAccount, createCounterparty, tapAmount, USD } from "./support.ts";

test("lending to a counterparty, then settling in full, clears the debt", async ({ page }) => {
  await page.goto("/");
  await createAccount(page, { name: "Cash · USD", currency: USD });
  await createCounterparty(page, "Nina");

  // Quick add: an expense against Cash · USD, naming Nina as the
  // counterparty and `Debt — expected back` as her role (SPEC.md §6.6 —
  // never defaulted, so the role is picked explicitly, the same as
  // `quick-add-screen.test.tsx`'s own counterparty tests).
  // `exact`, deliberately: Debt's own empty states use `+ Add`
  // (`counterparties.add`) — a substring match on `Add` alone resolves to
  // both that button and the floating one.
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await tapAmount(page, ["5", "0"]);
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("radio", { name: "Cash · USD" }).click();

  await page.getByRole("button", { name: "+ Person" }).click();
  // `exact`: the sheet's own scrim carries a "Dismiss Counterparty" label.
  await page.getByRole("button", { name: "Counterparty", exact: true }).click();
  await page.getByRole("radio", { name: "Nina" }).click();
  await page.getByRole("radio", { name: "Debt — expected back" }).click();
  // The picker stays open for review after a pick — J02's own `+ Payee`
  // flow closes the same way (`journeys/j02-daily-capture.test.tsx`).
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL("/");

  // S12 · Debt: Nina owes 50.00 USD back.
  await page.goto("/debt");
  await expect(page.getByText("Nina")).toBeVisible();
  await expect(page.getByText("owes you")).toBeVisible();

  await page.getByText("Nina").click();

  // S13 · Counterparty detail — Settle in full, into the same account.
  // Scoped to the sheet from here on: it carries its own "Settle" submit
  // button, distinct from the row action that opened it
  // (`counterparty-screens.test.tsx`'s own `sheet` variable, restated).
  await page.getByRole("button", { name: "Settle" }).click();
  const sheet = page.getByLabel("Settling with Nina", { exact: true });
  await expect(sheet).toBeVisible();

  await sheet.getByRole("button", { name: "Into" }).click();
  await page.getByRole("radio", { name: "Cash · USD" }).click();
  await sheet.getByRole("button", { name: "Amount: 0" }).click();
  await tapAmount(page, ["5", "0"]);
  await sheet.getByRole("button", { name: "Discharges: 0" }).click();
  await tapAmount(page, ["5", "0"]);

  await sheet.getByRole("button", { name: "Settle" }).click();

  await expect(page.getByText(/Settled\./)).toBeVisible();
});
