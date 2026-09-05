/**
 * S19's home tab — a list with one entry, *Categories*, for now.
 *
 * `(tabs)/_layout.tsx` hides the navigation header for every tab root (the
 * same reason `ledger-screen.tsx`'s stub carries its own title through
 * `EmptyState`), so the heading is `Card`'s own `title`, not a route option.
 *
 * That is the one shape `design-system/05` §5.1 allows a whole screen to be
 * one card: *"a tab root without a navigation header may carry its menu list
 * in a titled card"*. `tests/architecture.test.ts` derives the exemption from
 * that sentence — a tab route's screen whose card holds only `Button`s —
 * rather than naming this file, so a second entry that is not a button, or a
 * route that grows a header, loses it the same day.
 */

import { useT } from "@waltning/ui/i18n/provider";
import { Button } from "@waltning/ui/primitives/button";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { router } from "expo-router";

function handleOpenCategories() {
  router.push("/settings/categories");
}

function handleOpenCurrencies() {
  router.push("/settings/currencies");
}

function handleOpenRates() {
  router.push("/settings/rates");
}

export default function Settings() {
  const t = useT();

  return (
    <GroundPanel>
      <Card title={t("routes.settings")}>
        <Button label={t("routes.categories")} onPress={handleOpenCategories} variant="secondary" />
        <Button label={t("routes.currencies")} onPress={handleOpenCurrencies} variant="secondary" />
        <Button label={t("routes.rates")} onPress={handleOpenRates} variant="secondary" />
      </Card>
    </GroundPanel>
  );
}
