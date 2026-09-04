/**
 * J2 — daily capture (`docs/specification/flows/J02-daily-capture.md`), the
 * same script `apps/mobile/src/journeys/j02-daily-capture.test.tsx` runs
 * inside jsdom, replayed here against the real Expo web build: a warm
 * account chip needs no `Account` tap at all (S05 §9.2's four-hour window),
 * which is the one thing a real browser proves that a stub port cannot —
 * `last-capture.ts`'s device-clock write actually round-tripping through
 * whatever storage the browser gives it.
 */

import { expect, test } from "@playwright/test";
import { createAccount, tapAmount, USD } from "./support.ts";

test("a warm account chip needs no tap the second time", async ({ page }) => {
  await page.goto("/");
  // USD — the pivot (§7.0), so nothing here needs a manual rate seeded
  // first; this journey is about the account chip, not §14.6.
  await createAccount(page, { name: "Cash · USD", currency: USD });
  await expect(page).toHaveURL("/");

  // First capture of the day: cold. `last-capture.ts` holds nothing yet, so
  // the account chip opens empty and needs an explicit pick — the same
  // `pickCashAccount()` shape `quick-add-screen.test.tsx`'s own cold test
  // uses.
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await tapAmount(page, ["1", "2", ".", "0", "0"]);
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("radio", { name: "Cash · USD" }).click();
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText("12.00 USD", { exact: true })).toBeVisible();

  // Second capture, straight after the first: warm. The account chip
  // already carries `Cash · USD` — S05 §9.2's own four-hour window — so
  // Save is reachable from the keypad alone, zero taps on the chip.
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: /Cash · USD/ })).toBeVisible();
  await tapAmount(page, ["4", "8", ".", "9", "0"]);
  await page.getByRole("button", { name: "Save" }).click();

  // Both captures, each its own Recent row (`TransactionList`'s own signed
  // amount) — the period's aggregate spent/net stat tiles now read 60.90,
  // so this asserts the two individual rows rather than that sum.
  await expect(page).toHaveURL("/");
  await expect(page.getByText("-48.90 USD", { exact: true })).toBeVisible();
  await expect(page.getByText("-12.00 USD", { exact: true })).toBeVisible();
});
