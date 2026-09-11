/**
 * S31 — transfer (`docs/specification/screens/S31-transfer.md`), the
 * same-currency path `transfer-screen.test.tsx`'s own "collapses to one
 * amount for a same-currency transfer" test names: two USD accounts, one
 * amount, no reference rate to prefill or margin to render. USD — the pivot
 * (§7.0) — also means neither leg needs a manual rate seeded first (§14.6).
 */

import { expect, test } from "@playwright/test";
import { createAccount, USD } from "./support.ts";

test("a same-currency transfer moves money between two accounts", async ({ page }) => {
  await page.goto("/");
  await createAccount(page, { name: "Cash · USD", currency: USD });
  await createAccount(page, { name: "Savings · USD", currency: USD });

  await page.goto("/transfer");

  // `AccountPicker` tiles (`transfer-screen.test.tsx`'s own `pickFrom`/
  // `pickTo`) — a tile's accessible name is the account's own name.
  await page.getByRole("button", { name: /^From/ }).click();
  await page.getByRole("radio", { name: "Cash · USD" }).click();
  await page.getByRole("button", { name: /^To/ }).click();
  await page.getByRole("radio", { name: "Savings · USD" }).click();

  // Same currency both sides: one card, no `Destination amount` field at
  // all (the test this mirrors asserts exactly that absence).
  await expect(page.getByRole("textbox", { name: "Destination amount" })).toBeHidden();
  await page.getByRole("textbox", { name: "Amount" }).fill("50");

  await page.getByRole("button", { name: "Move money" }).click();
  await expect(page).toHaveURL("/");

  // Both legs of the transfer, visible on the ledger (`(tabs)/ledger.tsx`).
  await page.goto("/ledger");
  await expect(page.getByText("Cash · USD")).toBeVisible();
  await expect(page.getByText("Savings · USD")).toBeVisible();
  await expect(page.getByText("50.00 USD", { exact: true }).first()).toBeVisible();
});
