/**
 * S19's home tab — a list with one entry, *Categories*, for now.
 *
 * `(tabs)/_layout.tsx` hides the navigation header for every tab root (the
 * same reason `ledger-screen.tsx`'s stub carries its own title through
 * `EmptyState`), so the heading is `Card`'s own `title`, not a route option.
 */

import { useT } from "@waltning/ui/i18n/provider";
import { Button } from "@waltning/ui/primitives/button";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { router } from "expo-router";

function handleOpenCategories() {
  router.push("/settings/categories");
}

export default function Settings() {
  const t = useT();

  return (
    <GroundPanel>
      <Card title={t("routes.settings")}>
        <Button label={t("routes.categories")} onPress={handleOpenCategories} variant="secondary" />
      </Card>
    </GroundPanel>
  );
}
