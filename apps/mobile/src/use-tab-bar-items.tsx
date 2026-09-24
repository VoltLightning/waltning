/**
 * `useTabBarItems` — the router-facing half of `(tabs)/_layout.tsx`, in its
 * own file per `architecture/11`'s "every hook has its own file" and "a route
 * composes and does not define hooks": a hook in a route file is invisible to
 * the test runner (`app/` is a sibling of `src/`, not a child) and cannot be
 * pointed at a stub.
 *
 * **Still in `apps/mobile/src/`, not `packages/client`.** It calls
 * `useTabTrigger` from `expo-router/ui`, and the plan's own constraint is
 * `expo-router` names a route tree only `apps/mobile/app/` may define — this
 * file defines none; it reads back triggers a route file already registered.
 * `today-screen.tsx` sets the same precedent for `expo-router`'s imperative
 * half (`router`, `useLocalSearchParams`) living in `src/`.
 *
 * `useTabTrigger`, called once per tab — a fixed set known at compile time,
 * never a loop, so the hook count never varies between renders.
 *
 * **Four on the phone — Home · Accounts · Debt · Settings — and five at the
 * desk** (`05-composites`, `TabBar`). The Ledger is S04 on the phone: a tab
 * for it led to the screen you were already on. Its route stays registered,
 * because the desk's band carries S10 between Accounts and Debt and because
 * an unsettled banner still opens it filtered to one account; `items` is the
 * bar's four, `deskItems` the band's five, and a phone that arrives on the
 * Ledger by a link still finds its name in `deskItems` for the header.
 *
 * **There is no Calendar.** S11 is not built, and the route
 * that stood in for it answered *"this screen isn't built yet"* — a tab that
 * is one fifth of the app's whole navigation and leads to a placeholder
 * teaches the bar's other four to be ignored too. The route is gone with it
 * (`(tabs)/_layout.tsx`), because a registered route no tab points at has no
 * header and no selected tab either. S11 adds the screen, the trigger and an
 * entry here in one change.
 */

import { useT } from "@waltning/ui/i18n/provider";
import type { TabBarItem } from "@waltning/ui/shell/tab-bar";
import {
  AccountsTabIcon,
  DebtTabIcon,
  LedgerTabIcon,
  SettingsTabIcon,
  TodayTabIcon,
} from "@waltning/ui/shell/tab-icons";
import { useTabTrigger } from "expo-router/ui";
import { useCallback } from "react";

type TabName = "today" | "accounts" | "ledger" | "counterparties" | "settings";

export function useTabBarItems(): {
  /** The phone's bar: Home · Accounts · Debt · Settings. */
  items: readonly TabBarItem[];
  /** The desk band's nav: the same four, and the Ledger after Accounts. */
  deskItems: readonly TabBarItem[];
  onSelect: (name: string) => void;
} {
  const t = useT();
  const today = useTabTrigger({ name: "today" });
  const accounts = useTabTrigger({ name: "accounts" });
  const ledger = useTabTrigger({ name: "ledger" });
  const counterparties = useTabTrigger({ name: "counterparties" });
  const settings = useTabTrigger({ name: "settings" });

  const todayActive = today.trigger?.isFocused ?? false;
  const accountsActive = accounts.trigger?.isFocused ?? false;
  const ledgerActive = ledger.trigger?.isFocused ?? false;
  const counterpartiesActive = counterparties.trigger?.isFocused ?? false;
  const settingsActive = settings.trigger?.isFocused ?? false;

  const home: TabBarItem = {
    name: "today",
    label: t("shell.home"),
    icon: <TodayTabIcon active={todayActive} />,
    active: todayActive,
  };
  const accountsItem: TabBarItem = {
    name: "accounts",
    label: t("routes.accounts"),
    icon: <AccountsTabIcon active={accountsActive} />,
    active: accountsActive,
  };
  const ledgerItem: TabBarItem = {
    name: "ledger",
    label: t("routes.ledger"),
    icon: <LedgerTabIcon active={ledgerActive} />,
    active: ledgerActive,
  };
  const counterpartiesItem: TabBarItem = {
    name: "counterparties",
    label: t("routes.counterparties"),
    icon: <DebtTabIcon active={counterpartiesActive} />,
    active: counterpartiesActive,
  };
  const settingsItem: TabBarItem = {
    name: "settings",
    label: t("routes.settings"),
    icon: <SettingsTabIcon active={settingsActive} />,
    active: settingsActive,
  };

  const items: readonly TabBarItem[] = [home, accountsItem, counterpartiesItem, settingsItem];
  const deskItems: readonly TabBarItem[] = [
    home,
    accountsItem,
    ledgerItem,
    counterpartiesItem,
    settingsItem,
  ];

  const onSelect = useCallback(
    (name: string) => {
      const triggers: Record<TabName, (typeof today)["switchTab"]> = {
        today: today.switchTab,
        accounts: accounts.switchTab,
        ledger: ledger.switchTab,
        counterparties: counterparties.switchTab,
        settings: settings.switchTab,
      };
      triggers[name as TabName]?.(name, {});
    },
    [today, accounts, ledger, counterparties, settings],
  );

  return { items, deskItems, onSelect };
}
