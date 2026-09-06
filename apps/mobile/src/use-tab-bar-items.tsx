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
 * **Four, not five: Calendar is registered and unlisted.** S11 is not built,
 * and the route it would occupy answers *"this screen isn't built yet"* — a
 * tab that is one fifth of the app's whole navigation and leads to a
 * placeholder teaches the bar's other four to be ignored too. The
 * `<TabTrigger>` stays in `(tabs)/_layout.tsx`, so `/calendar` is still a
 * real route reachable by URL and nothing about the router changes when S11
 * arrives — only this list grows an entry back.
 */

import { useT } from "@waltning/ui/i18n/provider";
import type { TabBarItem } from "@waltning/ui/shell/tab-bar";
import {
  DebtTabIcon,
  LedgerTabIcon,
  SettingsTabIcon,
  TodayTabIcon,
} from "@waltning/ui/shell/tab-icons";
import { useTabTrigger } from "expo-router/ui";
import { useCallback } from "react";

type TabName = "today" | "ledger" | "debt" | "settings";

export function useTabBarItems(): {
  items: readonly TabBarItem[];
  onSelect: (name: string) => void;
} {
  const t = useT();
  const today = useTabTrigger({ name: "today" });
  const ledger = useTabTrigger({ name: "ledger" });
  const debt = useTabTrigger({ name: "debt" });
  const settings = useTabTrigger({ name: "settings" });

  const todayActive = today.trigger?.isFocused ?? false;
  const ledgerActive = ledger.trigger?.isFocused ?? false;
  const debtActive = debt.trigger?.isFocused ?? false;
  const settingsActive = settings.trigger?.isFocused ?? false;

  const items: readonly TabBarItem[] = [
    {
      name: "today",
      label: t("shell.today"),
      icon: <TodayTabIcon active={todayActive} />,
      active: todayActive,
    },
    {
      name: "ledger",
      label: t("routes.ledger"),
      icon: <LedgerTabIcon active={ledgerActive} />,
      active: ledgerActive,
    },
    {
      name: "debt",
      label: t("routes.debt"),
      icon: <DebtTabIcon active={debtActive} />,
      active: debtActive,
    },
    {
      name: "settings",
      label: t("routes.settings"),
      icon: <SettingsTabIcon active={settingsActive} />,
      active: settingsActive,
    },
  ];

  const onSelect = useCallback(
    (name: string) => {
      const triggers: Record<TabName, (typeof today)["switchTab"]> = {
        today: today.switchTab,
        ledger: ledger.switchTab,
        debt: debt.switchTab,
        settings: settings.switchTab,
      };
      triggers[name as TabName]?.(name, {});
    },
    [today, ledger, debt, settings],
  );

  return { items, onSelect };
}
