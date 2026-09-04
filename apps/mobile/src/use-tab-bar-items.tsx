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
 */

import { useT } from "@waltning/ui/i18n/provider";
import type { TabBarItem } from "@waltning/ui/shell/tab-bar";
import {
  CalendarTabIcon,
  DebtTabIcon,
  LedgerTabIcon,
  TodayTabIcon,
} from "@waltning/ui/shell/tab-icons";
import { useTabTrigger } from "expo-router/ui";
import { useCallback } from "react";

type TabName = "today" | "ledger" | "calendar" | "debt";

export function useTabBarItems(): {
  items: readonly TabBarItem[];
  onSelect: (name: string) => void;
} {
  const t = useT();
  const today = useTabTrigger({ name: "today" });
  const ledger = useTabTrigger({ name: "ledger" });
  const calendar = useTabTrigger({ name: "calendar" });
  const debt = useTabTrigger({ name: "debt" });

  const todayActive = today.trigger?.isFocused ?? false;
  const ledgerActive = ledger.trigger?.isFocused ?? false;
  const calendarActive = calendar.trigger?.isFocused ?? false;
  const debtActive = debt.trigger?.isFocused ?? false;

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
      name: "calendar",
      label: t("routes.calendar"),
      icon: <CalendarTabIcon active={calendarActive} />,
      active: calendarActive,
    },
    {
      name: "debt",
      label: t("routes.debt"),
      icon: <DebtTabIcon active={debtActive} />,
      active: debtActive,
    },
  ];

  const onSelect = useCallback(
    (name: string) => {
      const triggers: Record<TabName, (typeof today)["switchTab"]> = {
        today: today.switchTab,
        ledger: ledger.switchTab,
        calendar: calendar.switchTab,
        debt: debt.switchTab,
      };
      triggers[name as TabName]?.(name, {});
    },
    [today, ledger, calendar, debt],
  );

  return { items, onSelect };
}
