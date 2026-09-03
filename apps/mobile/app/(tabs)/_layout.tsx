/**
 * The tab shell. **The only file allowed to name `expo-router`'s tabs
 * primitives** — `packages/ui/src/shell/tab-bar.tsx` renders a platform-
 * neutral bar, and this file is what binds it to the router.
 *
 * `<TabList>` is real but invisible (`style={styles.hiddenList}`): its
 * `<TabTrigger>`s are what register the four routes with the router, and
 * `useTabBarItems` (`../../src/use-tab-bar-items.tsx` — a route defines no
 * hooks) reads them back by name to drive the app's own `<TabBar>` — the
 * pattern `expo-router/ui`'s docs call a fully custom tab bar. Deliberately
 * not the four visible triggers `<TabList>` would draw itself: `TabBar` is
 * the platform-neutral component and the design.
 *
 * **The `+` is not a tab.** It floats, mounted once here — above the whole
 * `<TabSlot>`, not per-screen — so it survives a tab switch instead of
 * remounting (and losing its drag state) every time `TodayFrame` used to draw
 * it. `onAdd`, `addDisabled` and the device's `floatPosition` preference
 * moved here with it; `today-screen.tsx` no longer wires any of them.
 *
 * **The bar's own rendered height becomes the button's bottom inset** — §2.9:
 * *"clears … a tab bar when one exists."* The bar already adds the device's
 * real inset as its own bottom padding (`TabBar` reads the ambient
 * `SafeAreaProvider` `DeviceInsets` provides at the app root), so its
 * measured height *is* the correct bottom inset — adding the device inset a
 * second time would clear the button twice as far as the bar is tall.
 */

import { useDevicePreference } from "@waltning/client/device/use-device-preference";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { SafeAreaProvider, useSafeArea } from "@waltning/ui/primitives/safe-area";
import type { FloatPosition } from "@waltning/ui/shell/float-geometry";
import { FloatingAdd } from "@waltning/ui/shell/floating-add";
import { TabBar } from "@waltning/ui/shell/tab-bar";
import { makeStyles } from "@waltning/ui/theme/styles";
import { router } from "expo-router";
import { TabList, TabSlot, Tabs, TabTrigger } from "expo-router/ui";
import { useCallback, useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import { floatPosition } from "../../src/platform";
import { useTabBarItems } from "../../src/use-tab-bar-items";

function handleAdd() {
  router.push("/quick-add");
}

/** A drop is a device preference (§2.9): stored here, never a registry operation. */
function handleFloatPosition(next: FloatPosition) {
  return floatPosition.set(next);
}

function VisibleTabBar({ onLayout }: { onLayout: (event: LayoutChangeEvent) => void }) {
  const { items, onSelect } = useTabBarItems();
  return (
    <View onLayout={onLayout}>
      <TabBar items={items} onSelect={onSelect} />
    </View>
  );
}

/**
 * Mounted once, above `<TabSlot>` — see the file doc for why the bar's own
 * measured height, not the device inset a second time, is the bottom clearance.
 */
function FloatingAddLayer({ barHeight }: { barHeight: number }) {
  const ledger = useLedgerController();
  const snapshot = usePhoneLedger(ledger);
  const float = useDevicePreference(floatPosition);
  const insets = useSafeArea();
  const hasAccounts = snapshot.accounts.length > 0;

  const clearedInsets = {
    top: insets.top,
    right: insets.right,
    left: insets.left,
    bottom: barHeight > 0 ? barHeight : insets.bottom,
  };

  return (
    <SafeAreaProvider insets={clearedInsets}>
      <FloatingAdd
        onAdd={handleAdd}
        disabled={!hasAccounts}
        position={float.value}
        onPositionChange={handleFloatPosition}
      />
    </SafeAreaProvider>
  );
}

export default function TabsLayout() {
  const styles = useStyles();
  const [barHeight, setBarHeight] = useState(0);
  const onBarLayout = useCallback((event: LayoutChangeEvent) => {
    setBarHeight(event.nativeEvent.layout.height);
  }, []);

  return (
    <Tabs>
      <TabSlot />
      <TabList style={styles.hiddenList}>
        <TabTrigger name="today" href="/" />
        <TabTrigger name="ledger" href="/ledger" />
        <TabTrigger name="calendar" href="/calendar" />
        <TabTrigger name="debt" href="/debt" />
      </TabList>
      <VisibleTabBar onLayout={onBarLayout} />
      <FloatingAddLayer barHeight={barHeight} />
    </Tabs>
  );
}

const useStyles = makeStyles(() => ({
  // The registering triggers, not the visible bar — `VisibleTabBar` draws
  // that. `display: "none"` rather than omitting `<TabList>`: the router
  // still needs it mounted to know the four routes exist.
  hiddenList: { display: "none" },
}));
