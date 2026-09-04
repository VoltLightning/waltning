/**
 * J1 — first run (`docs/specification/flows/J01-first-run.md`), the slice of
 * it this arc has actually built: the app opens on nothing, one account gets
 * created, and the first capture lands on Today. S29's wizard (display
 * currency, pin/archive, the migration import, tax scheme) is not built yet
 * — this journey starts exactly where the real app does today, which is
 * `Today`'s own `EmptyState` (`variant="first-run"`), not a wizard screen.
 *
 * Every interaction below is a `getByRole`/`getByText` call carried over
 * from the tier-1 screens it drives: `today-screen.tsx`'s own strings,
 * `create-account-form.tsx`'s fields (`apps/mobile/src/quick-add-screen.
 * test.tsx`'s own `tapKeys`/chip conventions for the capture that follows).
 */

import { expect, test } from "@playwright/test";
import { tapAmount, USD } from "./support.ts";

test("a first account, then a first capture, land on Today", async ({ page }) => {
  await page.goto("/");

  // S04 §3's own empty state — `shell.noAccounts` / `shell.noAccountsBody`
  // (`packages/ui/src/i18n/en.ts`), nothing else on the ledger reachable yet.
  await expect(page.getByText("No accounts yet")).toBeVisible();
  await expect(page.getByText("Create one account to start your ledger.")).toBeVisible();

  await page.getByRole("button", { name: "Create account" }).click();

  // S16's minimal path: name and currency. `Cash · USD` — a placeholder, as
  // every account name in this repository is (`CLAUDE.md`'s own rule). USD
  // is the pivot (§7.0) and needs no manual rate to capture into — a fresh
  // ledger holds none, and a first capture is not this journey's place to
  // exercise §14.6's refusal.
  await expect(page).toHaveURL(/\/account\/new/);
  await page.getByRole("textbox", { name: "Name" }).fill("Cash · USD");
  await page.getByRole("radio", { name: `Currency: ${USD.code} ${USD.symbol}` }).click();
  await page.getByRole("button", { name: "Save" }).click();

  // Back on Today — an account exists, so the empty state is gone and the
  // floating `+` is reachable (`tabs-shell.tsx`'s own `handleAdd`).
  await expect(page).toHaveURL("/");
  await expect(page.getByText("No accounts yet")).toBeHidden();

  await page.getByRole("button", { name: "Add", exact: true }).click();
  await tapAmount(page, ["4", "8", ".", "9", "0"]);

  // No `lastCapture` yet on a brand-new session (S05 §9.2) — the account
  // chip opens cold, same as `quick-add-screen.test.tsx`'s own cold case.
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("radio", { name: "Cash · USD" }).click();

  // No category exists yet — arc-phone ships no seeded taxonomy
  // (`categories-screen.tsx`'s own doc) and offers no way to create one from
  // the composer, so this capture leaves it unset, exactly as a genuinely
  // first capture would on the real app today.
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL("/");
  // Exact and currency-qualified: `-48.90 USD` (the period's own spend
  // stat, signed) is a distinct, equally-visible figure on the same screen.
  await expect(page.getByText("48.90 USD", { exact: true })).toBeVisible();
});
