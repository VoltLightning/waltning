/**
 * J10 — currency and rates (`docs/specification/flows/J10-currency-and-
 * rates.md`): a manual rate for a currency pair with no existing manual
 * rows, set once and never confirmed twice — the same "submits on the first
 * press" case `settings-rates-screen.test.tsx` names.
 */

import { expect, test } from "@playwright/test";

test("setting a manual rate for a pair with no manual history needs no confirmation", async ({
  page,
}) => {
  // S18, preselected on `?quote=` (`settings-rates-screen.tsx`'s own
  // `useLocalSearchParams`) — USD is the pivot (§7.0), so this is the
  // USD → EUR pair.
  await page.goto("/settings/rates?quote=EUR");
  await expect(page.getByText("EUR · Euro")).toBeVisible();

  await page.getByText("Set a range").click();
  // The reference USD → EUR rate this repository's own fixtures already use
  // (`transfer-screen.test.tsx`'s `pivotPerUnit("0.9200")`).
  await page.getByLabel("Rate · EUR per USD").fill("0.9200");
  await page.getByRole("button", { name: "Set rate" }).click();

  // No manual row existed for this pair before — the write lands without a
  // second, "Overwrite and set" confirmation.
  await expect(page.getByRole("button", { name: "Overwrite and set" })).toBeHidden();
  await expect(page.getByText("100%")).toBeVisible();
});
