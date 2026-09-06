/**
 * S19's home tab — a list with one entry, *Categories*, for now.
 *
 * `(tabs)/_layout.tsx` hides the navigation header for every tab root, and
 * the screen's name is on the shell's own band above it (`TabHeader`, drawn
 * from the active tab's label) — so this card carries **no title**. One with
 * one would name the screen twice on the same phone.
 *
 * A menu list is still the one shape `design-system/05` §5.1 allows a whole
 * screen to be one card: *"a tab root's menu list is an untitled card"* — a
 * list of routes is related rows, which is what earns a card at all.
 * `tests/architecture.test.ts` derives the exemption from that sentence — a
 * tab route's screen whose card holds only `Button`s — rather than naming
 * this file, so a second entry that is not a button loses it the same day.
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
      <Card>
        <Button label={t("routes.categories")} onPress={handleOpenCategories} variant="secondary" />
        <Button label={t("routes.currencies")} onPress={handleOpenCurrencies} variant="secondary" />
        <Button label={t("routes.rates")} onPress={handleOpenRates} variant="secondary" />
      </Card>
    </GroundPanel>
  );
}
