/**
 * Shared fixture steps for tier 2's five journey specs — never a spec on its
 * own (no `.spec.ts` suffix, so `playwright.config.ts`'s `testDir` scan skips
 * it).
 *
 * Arc-phone ships no seeded accounts or counterparties (§14.1 — the replica
 * bootstraps currencies alone, `apps/mobile/src/phone-ledger.web.ts`'s own
 * `bootstrapCurrencies`), so every journey below `first-run` needs at least
 * one account before its own scenario can start. Rather than repeat S16's
 * create-account steps in five files, this names them once — the same reason
 * `apps/mobile/src/journeys/journey-harness.tsx` exists for tier 1's own
 * fixtures, one layer down from a real browser instead of over one.
 */

import type { Page } from "@playwright/test";

/**
 * Every helper below navigates with a relative `page.goto`, which resolves
 * against `playwright.config.ts`'s `baseURL` — itself `E2E_WEB_URL`, with no
 * fallback of its own. Checked here, at module load, so a missing
 * `E2E_WEB_URL` fails by name before some journey's first `goto` hits
 * Playwright's own much less specific "no baseURL" error. `setup/global.ts`
 * sets it before any spec runs.
 */
function requireEnv(name: string): void {
  if (!process.env[name]) {
    throw new Error(`${name} is not set — setup/global.ts sets this before any spec runs.`);
  }
}

requireEnv("E2E_WEB_URL");

export type CurrencyChoice = { code: string; symbol: string };

/** `packages/core/src/currencies.ts`'s own reference set — the three this suite ever picks. */
export const USD: CurrencyChoice = { code: "USD", symbol: "$" };
export const PLN: CurrencyChoice = { code: "PLN", symbol: "zł" };
export const EUR: CurrencyChoice = { code: "EUR", symbol: "€" };

/**
 * S16's minimal path — name and currency, nothing under *More details*
 * (`packages/ui/src/accounts/create-account-form.tsx`).
 */
export async function createAccount(
  page: Page,
  options: { name: string; currency: CurrencyChoice },
): Promise<void> {
  await page.goto("/account/new");
  await page.getByRole("textbox", { name: "Name" }).fill(options.name);
  await page
    .getByRole("radio", {
      name: `Currency: ${options.currency.code} ${options.currency.symbol}`,
    })
    .click();
  await page.getByRole("button", { name: "Save" }).click();
}

/**
 * S15's minimal path — a name is the only field `create_counterparty`
 * requires. Reached through S12 Debt's own empty-state `+ Add`
 * (`debt-screen.tsx`'s `handleAdd`), not a direct `page.goto("/counterparty/
 * new")`: a create-mode Save calls `router.back()`
 * (`counterparty-editor-screen.tsx`'s own `finish()`), which needs a real
 * history entry to return to — one this screen's own push leaves behind and
 * a bare `goto` does not, only for the first counterparty this suite ever
 * creates.
 */
export async function createCounterparty(page: Page, name: string): Promise<void> {
  await page.goto("/debt");
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill(name);
  await page.getByRole("button", { name: "Save" }).click();
}

/**
 * `Keypad`'s own glyphs, tapped in order — the same helper shape
 * `quick-add-screen.test.tsx`'s own `tapKeys` and `transfer-screen.test.tsx`'s
 * own `tapKeys` give tier 1, restated for a real page instead of a rendered
 * tree.
 */
export async function tapAmount(page: Page, digits: readonly string[]): Promise<void> {
  for (const digit of digits) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
}
