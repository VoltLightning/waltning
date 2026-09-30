import { decideBack, type TabName } from "@waltning/client/ledger/tab-back/back-decision";
import { useNavigation } from "expo-router";
import { useEffect, useRef } from "react";
import { subscribeHardwareBack } from "./platform";
import { showStartOverview, useStartPage } from "./use-start-page.ts";

/**
 * Android's back button from a tab's root (`S04` §2). Tabs and Start's pages
 * push no history, so without this the activity finishes from any of them.
 *
 * **It answers only while the tabs are the focused screen.** A pushed screen
 * or a sheet is a stack entry, and declining leaves that pop to the stack's own
 * handler. The platform seam is `subscribeHardwareBack`; the web build never
 * calls back.
 */
export function useHardwareBack(tab: TabName | undefined, onSelect: (name: string) => void): void {
  const page = useStartPage();
  const navigation = useNavigation();
  const latest = useRef({ tab, page, onSelect, navigation });
  latest.current = { tab, page, onSelect, navigation };

  useEffect(
    () =>
      subscribeHardwareBack(() => {
        const now = latest.current;
        if (now.tab === undefined || !now.navigation.isFocused()) return false;
        const action = decideBack({ tab: now.tab, page: now.page });
        if (action.kind === "exit") return false;
        if (action.kind === "tab") now.onSelect(action.tab);
        else showStartOverview();
        return true;
      }),
    [],
  );
}
