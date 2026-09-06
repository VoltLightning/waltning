/**
 * S19's home tab — the list of everything Settings leads to.
 *
 * **Accounts is first**, because S16 §2 names Settings as its entry ("From
 * Settings · Accounts") and, until it was listed here, the register was
 * reachable only by typing a URL or by finishing an account creation that
 * started somewhere else.
 *
 * **No title, and no card built here.** `(tabs)/_layout.tsx` hides the
 * navigation header for every tab root and the tab shell draws the screen's
 * name above the ground, so a heading in this file would be the same word
 * twice. The card of rows is `SettingsMenu`'s (`packages/ui/src/settings`) —
 * a screen composes, it does not render.
 */

import { useT } from "@waltning/ui/i18n/provider";
import { SettingsMenu, type SettingsMenuItem } from "@waltning/ui/settings/settings-menu";
import { GroundPanel } from "@waltning/ui/shell/card";
import { router } from "expo-router";
import { useCallback, useMemo } from "react";

/**
 * Every destination, keyed by its own `routes.*` label — so the menu's order
 * and its wording are one declaration, and neither can drift from the other.
 * The routes stay literal because expo-router types them: a `string` here
 * would not compile, which is the check catching a typo.
 */
const ROUTES = {
  accounts: "/accounts",
  categories: "/settings/categories",
  currencies: "/settings/currencies",
  rates: "/settings/rates",
} as const;

type Destination = keyof typeof ROUTES;

/** The order they are offered in — the register first, the reference data after. */
const ORDER: readonly Destination[] = ["accounts", "categories", "currencies", "rates"];

function isDestination(id: string): id is Destination {
  return id in ROUTES;
}

export default function Settings() {
  const t = useT();

  const items = useMemo(
    (): readonly SettingsMenuItem[] =>
      ORDER.map((destination) => ({ id: destination, label: t(`routes.${destination}`) })),
    [t],
  );

  const handleSelect = useCallback((id: string) => {
    if (isDestination(id)) router.push(ROUTES[id]);
  }, []);

  return (
    <GroundPanel>
      <SettingsMenu items={items} onSelect={handleSelect} />
    </GroundPanel>
  );
}
