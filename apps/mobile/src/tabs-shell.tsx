/**
 * The tab shell's furniture — everything `(tabs)/_layout.tsx` used to define
 * inline, moved here so it can be pointed at a stub `expo-router/ui` the way
 * `use-tab-bar-items.test.tsx` already points `useTabBarItems` at one
 * (`architecture/11`: a hook, or a component that calls one, invisible to the
 * runner is a component nothing can test — `app/` is a sibling of `src/`, not
 * a child, and the suite never looks there).
 *
 * **`slot` arrives as a prop rather than being rendered here.** `<TabSlot />`
 * is `expo-router/ui`'s own primitive, and the route file's own doc comment
 * claims itself as the one place that names the router's tab JSX — `TabList`,
 * `Tabs`, `TabTrigger`, `TabSlot`. This file places that element; it does not
 * construct it, so the claim stays true.
 *
 * **The breakpoint decides the whole furniture, not one component inside
 * it.** `DESK1` (`02-tokens` §2.10): at `desk` width the app gets `DeskBand`
 * and neither the phone's `TabBar` nor the floating add button — the design
 * doc's flat rule, "no floating add button at desk width" — and below it the
 * phone composition is exactly what it always was.
 */

import { useDevicePreference } from "@waltning/client/device/use-device-preference";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { useT } from "@waltning/ui/i18n/provider";
import { SafeAreaProvider, useSafeArea } from "@waltning/ui/primitives/safe-area";
import { SegmentControl } from "@waltning/ui/primitives/segment-control";
import { useBreakpoint } from "@waltning/ui/primitives/use-breakpoint";
import {
  CommandBarPlaceholder,
  CurrencyChip,
  DeskBand,
  DeskNavItem,
} from "@waltning/ui/shell/desk-band";
import { DualTotal } from "@waltning/ui/shell/dual-total";
import type { FloatPosition } from "@waltning/ui/shell/float-geometry";
import { FloatingAdd } from "@waltning/ui/shell/floating-add";
import { TabBar, type TabBarItem } from "@waltning/ui/shell/tab-bar";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { type LayoutChangeEvent, Text, View } from "react-native";
import { floatPosition } from "./platform";
import { useTabBarItems } from "./use-tab-bar-items";

function handleAdd() {
  router.push("/quick-add");
}

/**
 * The long-press picker's own three choices (S05 §9.1) — `Transfer` opens
 * S31; `Expense`/`Income` open Quick add, `Income` naming its type in the
 * route so the composer opens on that side of the toggle rather than the
 * ordinary default.
 */
function handleSelectType(type: "expense" | "transfer" | "income") {
  if (type === "transfer") {
    router.push("/transfer");
    return;
  }
  if (type === "income") {
    router.push({ pathname: "/quick-add", params: { type: "income" } });
    return;
  }
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
        onSelectType={handleSelectType}
        disabled={!hasAccounts}
        position={float.value}
        onPositionChange={handleFloatPosition}
      />
    </SafeAreaProvider>
  );
}

function Brand() {
  const t = useT();
  const styles = useStyles();
  return <Text style={styles.brand}>{t("common.appName")}</Text>;
}

function DeskNavLink({ item, onSelect }: { item: TabBarItem; onSelect: (name: string) => void }) {
  const handlePress = useCallback(() => onSelect(item.name), [onSelect, item.name]);
  return <DeskNavItem label={item.label} active={item.active} onPress={handlePress} />;
}

/**
 * The ledger's leading currency, read the same way `CurrencyTotals` reads it
 * on the phone (`today-screen.tsx`): the first subtotal, or nothing before
 * the first account exists.
 */
function useLeadCurrency() {
  const ledger = useLedgerController();
  const snapshot = usePhoneLedger(ledger);
  const [lead] = snapshot.subtotals;
  return lead ?? null;
}

function DeskCurrency() {
  const lead = useLeadCurrency();
  return <CurrencyChip currency={lead === null ? null : lead.currency} />;
}

/**
 * `DualTotal`'s C2 caller has not merged (`wave-3-shared.md` task 2's named
 * fallback): *mine* is the snapshot's own leading subtotal, *ours* is `null`
 * rather than a second figure nobody has computed yet. `null` before the
 * first account, matching `CurrencyTotals` returning nothing rather than a
 * fabricated zero balance in an invented currency.
 *
 * `collapsed` picks `DualTotal`'s shape, not just its size: `"band"` on the
 * landing route, `"compact"` everywhere else — only the hero row changes
 * shape when the band collapses, per the design correction on #95.
 */
function DeskHero({ collapsed }: { collapsed: boolean }) {
  const lead = useLeadCurrency();
  if (lead === null) return null;

  return (
    <DualTotal
      mine={lead.balance}
      ours={null}
      currency={lead.currency}
      decimals={lead.decimals}
      size={collapsed ? "compact" : "band"}
    />
  );
}

/**
 * Bound to state nothing reads yet — no screen filters on scope this arc, so
 * switching it changes nothing below the band. Named here rather than left
 * unbuilt: the control is part of `DESK1`'s card, and the read is `DESK4`'s.
 *
 * `tone="shell"` — the canvas's scope control is a dark inset on the band,
 * not the light control `SegmentControl` draws everywhere else it is used.
 */
function DeskScope() {
  const t = useT();
  const [scope, setScope] = useState("all");
  const segments = [
    { value: "all", label: t("shell.scopeAll") },
    { value: "mine", label: t("shell.scopeMine") },
    { value: "shared", label: t("shell.scopeShared") },
    { value: "business", label: t("shell.scopeBusiness") },
  ] as const;

  return <SegmentControl segments={segments} value={scope} onChange={setScope} tone="shell" />;
}

function DeskLayer({ slot }: { slot: React.ReactNode }) {
  const styles = useStyles();
  const { items, onSelect } = useTabBarItems();
  // §2.9's own split: everywhere but the landing route collapses to one row.
  const collapsed = !items.find((item) => item.name === "today")?.active;

  return (
    <View style={styles.column}>
      <DeskBand
        brand={<Brand />}
        nav={items.map((item) => <DeskNavLink key={item.name} item={item} onSelect={onSelect} />)}
        commandBar={<CommandBarPlaceholder />}
        currency={<DeskCurrency />}
        scope={<DeskScope />}
        hero={<DeskHero collapsed={collapsed} />}
        collapsed={collapsed}
      />
      {slot}
    </View>
  );
}

export type TabsShellProps = {
  /** `<TabSlot />`, constructed by `_layout.tsx`. */
  slot: React.ReactNode;
};

export function TabsShell({ slot }: TabsShellProps) {
  const breakpoint = useBreakpoint();
  const [barHeight, setBarHeight] = useState(0);
  const onBarLayout = useCallback((event: LayoutChangeEvent) => {
    setBarHeight(event.nativeEvent.layout.height);
  }, []);

  if (breakpoint === "desk") {
    return <DeskLayer slot={slot} />;
  }

  return (
    <>
      {slot}
      <VisibleTabBar onLayout={onBarLayout} />
      <FloatingAddLayer barHeight={barHeight} />
    </>
  );
}

const useStyles = makeStyles((theme) => ({
  brand: { color: theme.shellText, ...text.display("displayThree") },
  column: { flex: 1 },
}));
