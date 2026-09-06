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
 * phone gets `TabHeader`, the slot, the bar and the button, in that order.
 * The desk branch provides no floating clearance for the same reason it draws
 * no button, rather than for a second reason of its own.
 *
 * **The header is the shell's on both sides of the breakpoint.** `DeskBand`
 * already named the route; on the phone every tab but Today used to name
 * nothing, so the same four screens read as titled at 1440 and untitled at
 * 390. A screen drawing its own is what produced three different treatments
 * in the first place.
 */

import { useDisplayCurrency } from "@waltning/client/currencies/display-currency";
import { useDevicePreference } from "@waltning/client/device/use-device-preference";
import { DEFAULT_DESK_SCOPE, parseDeskScope } from "@waltning/client/ledger/desk-scope";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { useLeadCurrency } from "@waltning/client/ledger/use-lead-currency";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { useLastUsedAccount } from "@waltning/client/transactions/last-capture";
import { useCommandBar } from "@waltning/client/transactions/use-command-bar";
import { mapFieldErrors } from "@waltning/client/transport/field-errors";
import { type CaptureContext, parseCapture } from "@waltning/core/capture/grammar";
import { currencyCode } from "@waltning/core/money";
import { CurrencyChip } from "@waltning/ui/fx/currency-chip";
import { useT } from "@waltning/ui/i18n/provider";
import { SafeAreaProvider, useSafeArea } from "@waltning/ui/primitives/safe-area";
import { SegmentControl } from "@waltning/ui/primitives/segment-control";
import { useBreakpoint } from "@waltning/ui/primitives/use-breakpoint";
import { CommandBarPlaceholder, DeskBand, DeskNavItem } from "@waltning/ui/shell/desk-band";
import { DualTotal } from "@waltning/ui/shell/dual-total";
import type { FloatPosition } from "@waltning/ui/shell/float-geometry";
import { FloatingAdd } from "@waltning/ui/shell/floating-add";
import { FloatingClearanceProvider } from "@waltning/ui/shell/floating-clearance";
import { TabBar, type TabBarItem } from "@waltning/ui/shell/tab-bar";
import { TabHeader } from "@waltning/ui/shell/tab-header";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { floating } from "@waltning/ui/tokens";
import { CommandBar, type CommandBarHandle } from "@waltning/ui/transactions/command-bar";
import {
  KNOWN_PATHS,
  resolveFieldErrorMessage,
} from "@waltning/ui/transactions/field-error-messages";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type LayoutChangeEvent, Text, View } from "react-native";
import {
  deskScope,
  displayCurrency,
  floatPosition,
  lastCapture,
  subscribeCommandBarHotkey,
} from "./platform";
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
export function handleSelectType(type: "expense" | "transfer" | "income") {
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

/** Same category as the drop above — a lens on the ledger, not a write to it. */
function handleDeskScope(next: string) {
  return deskScope.set(parseDeskScope(next) ?? DEFAULT_DESK_SCOPE);
}

/**
 * The tab's own name, in the shell's band — `05-composites` §5.1's
 * `TabHeader`, drawn here rather than by each screen.
 *
 * **Today is the one tab this skips**, because `TodayFrame` leads with a hero
 * band and a hero is a better header than a word (§5.1: a 54pt total does not
 * fit in a navigation bar). Every other tab root drew nothing at all, or a
 * card whose title stood in for the page's, and three treatments for one
 * thing is how an app comes to read as three.
 *
 * The label comes from `useTabBarItems`, so the header and the bar can never
 * disagree about what the tab is called — including in Polish, where a
 * second hardcoded string would be the thing that drifts.
 */
function PhoneHeader() {
  const { items } = useTabBarItems();
  const active = items.find((item) => item.active);
  if (active === undefined || active.name === "today") return null;
  return <TabHeader title={active.label} />;
}

/**
 * The device chrome as the tab slot actually meets it — which is not what the
 * device reports.
 *
 * `GroundPanel` clears the home-indicator inset because it is *"the screen's
 * own bottom edge"*, and inside this shell it is not: the `TabBar` below it
 * is, and the bar already pads itself by `insets.bottom`. Both are children
 * of the same column, so the inset was being paid twice and every tab root's
 * last row sat 34pt further up than anything asked for. Sides and top are the
 * device's own — a landscape notch is still on one of them.
 *
 * The same shape `FloatingAddLayer` below already takes for its own layer,
 * and for the same reason: what a child should clear is a property of where
 * it sits, and this component is the only thing that knows where that is.
 */
function SlotInsets({ children }: { children: React.ReactNode }) {
  const insets = useSafeArea();
  const cleared = { top: insets.top, right: insets.right, left: insets.left, bottom: 0 };
  return <SafeAreaProvider insets={cleared}>{children}</SafeAreaProvider>;
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
 * `04` §4.5's real toggle, filling `DeskBand`'s own `currency` slot — DESK1
 * left it empty for a component E3/E6 had not built yet. `listCurrencySettings`
 * is an on-demand read (`create-phone-ledger.ts`'s own comment on the FX
 * block), so this reads it every render rather than carrying `pinned` in the
 * snapshot every subscriber pays for.
 */
function DeskCurrency() {
  const ledger = useLedgerController();
  const pinned = ledger.listCurrencySettings().filter((currency) => currency.pinned);
  const snapshot = useDisplayCurrency(displayCurrency);
  const handleChange = useCallback((code: string) => {
    void displayCurrency.set(currencyCode(code));
  }, []);
  return <CurrencyChip pinned={pinned} active={snapshot.currency} onChange={handleChange} />;
}

/**
 * `DualTotal`'s C2 caller has not merged (`wave-3-shared.md` task 2's named
 * fallback): *mine* is the subtotal `useLeadCurrency` picked, *ours* is `null`
 * rather than a second figure nobody has computed yet. The whole hero is
 * absent only before the first account, matching `CurrencyTotals` returning
 * nothing rather than a fabricated zero balance in an invented currency — a
 * ledger that holds *something* always draws a figure, captioned when that
 * something is not the currency asked for.
 *
 * `collapsed` picks `DualTotal`'s shape, not just its size: `"band"` on the
 * landing route, `"compact"` everywhere else — only the hero row changes
 * shape when the band collapses, per the design correction on #95.
 */
function DeskHero({ collapsed }: { collapsed: boolean }) {
  const t = useT();
  const ledger = useLedgerController();
  const display = useDisplayCurrency(displayCurrency);
  const lead = useLeadCurrency(ledger, display.currency);
  if (lead === null) return null;

  return (
    <DualTotal
      mine={lead.entry.balance}
      ours={null}
      currency={lead.entry.currency}
      decimals={lead.entry.decimals}
      size={collapsed ? "compact" : "band"}
      caption={lead.fallback ? t("shell.noBalanceIn", { currency: lead.missing }) : undefined}
    />
  );
}

/**
 * `DESK1`'s scope control, now read by `DESK4`'s dashboard.
 *
 * The value is a **device preference**, not `useState`: the control is in the
 * band and the widgets are under `<TabSlot>`, so local state could only ever
 * drive the band — which is exactly what it did, while two widget headers
 * underneath claimed a different scope entirely.
 *
 * **Not every widget can honour every choice, and `S01` §3 already says so** —
 * *"with a scope segment in the shell that a widget may or may not inherit,
 * the frame has to be local."* So this states the intent, and each widget
 * states the scope it actually applied in its own header.
 *
 * `tone="shell"` — the canvas's scope control is a dark inset on the band,
 * not the light control `SegmentControl` draws everywhere else it is used.
 */
function DeskScope() {
  const t = useT();
  const stored = useDevicePreference(deskScope);
  const segments = [
    { value: "all", label: t("shell.scopeAll") },
    { value: "mine", label: t("shell.scopeMine") },
    { value: "shared", label: t("shell.scopeShared") },
    { value: "business", label: t("shell.scopeBusiness") },
  ] as const;

  return (
    <SegmentControl
      segments={segments}
      value={stored.value ?? DEFAULT_DESK_SCOPE}
      onChange={handleDeskScope}
      tone="shell"
    />
  );
}

/**
 * `N`'s own composer — `DeskBand`'s command-bar slot, `screens/S05-quick-add.
 * md` §3's "Web — ≥1024px". `N` focuses it from anywhere
 * (`subscribeCommandBarHotkey`, `platform.ts`'s own seam), D1's grammar
 * (`parseCapture`) resolves the line live, D2 proposes the category, and
 * Enter saves through the same `createTransaction` the phone's own quick-add
 * draft calls.
 *
 * **The one place this arc builds `CaptureContext`.** `useCommandBar`
 * (`packages/client`) takes `parse` as a parameter precisely so this — the
 * component that already has the ledger's accounts, categories, today's date
 * and the four-hour last-used window, the same shapes `DeskCurrency`/
 * `DeskHero` above already read off this same snapshot — is the one to close
 * `parseCapture` over them.
 *
 * **`CommandBarPlaceholder` while nothing is capturable** — the same reason
 * `FloatingAdd` disables on the phone (`FloatingAddLayer`'s own
 * `disabled={!hasAccounts}`, above). `<CommandBar>` fills the slot the moment
 * an account exists.
 *
 * **Defined here, not its own file.** `apps hold only what names a
 * platform` (`tests/architecture.test.ts`) reads a file's own source for a
 * platform import — `expo-router`'s `router`, `react-native`'s primitives —
 * and a standalone wiring file importing only `packages/client`/
 * `packages/ui` and a sibling `./platform` would have named none of its own,
 * failing that test outright. `DeskCurrency`/`DeskHero`/`DeskScope` already
 * take the same shape for the same reason.
 */
function DeskCommandBar() {
  const t = useT();
  const ledger = useLedgerController();
  const snapshot = usePhoneLedger(ledger);
  // L7 — read every render, deliberately: `quick-add-screen.tsx`'s own
  // `today` read takes the identical shape, for the identical reason — a
  // date that goes stale across midnight while the tab stays open is a worse
  // defect than a cheap `Intl` call this component already re-renders on
  // every keystroke of the bar itself. `deviceRuntime` (`packages/client`) is
  // the isolated seam `Date`/`Intl` never appear outside of; nothing here
  // reads either directly.
  const capture = deviceRuntime().capture();
  const today = capture.date;
  const lastUsedAccountId = useLastUsedAccount(
    lastCapture,
    capture.at.getTime(),
    snapshot.accounts,
  );

  // Fixed to expense (`use-command-bar.ts`'s own scope decision) — the
  // grammar never matches an income-only category against this bar's line.
  const expenseCategories = useMemo(
    () => snapshot.categories.filter((category) => category.kind === "expense"),
    [snapshot.categories],
  );

  const context: CaptureContext = useMemo(
    () => ({
      accounts: snapshot.accounts,
      categories: expenseCategories,
      defaultAccountId: lastUsedAccountId,
      today,
      // Both languages' words already resolve unconditionally (`dates.ts`'s
      // own comment) — this is the seam a future locale-specific rule would
      // need, not a live switch today.
      locale: "en",
    }),
    [snapshot.accounts, expenseCategories, lastUsedAccountId, today],
  );
  const parse = useCallback((text: string) => parseCapture(text, context), [context]);

  const commandBar = useCommandBar(ledger, parse, expenseCategories);

  const fieldErrors = useMemo(() => {
    if (commandBar.fieldErrors === undefined) return undefined;
    const resolved = commandBar.fieldErrors.map((error) => ({
      path: error.path,
      message: resolveFieldErrorMessage(t, error),
    }));
    return mapFieldErrors(resolved, KNOWN_PATHS);
  }, [commandBar.fieldErrors, t]);

  const commandBarRef = useRef<CommandBarHandle>(null);
  useEffect(() => subscribeCommandBarHotkey(() => commandBarRef.current?.focus()), []);

  // L6 — `capturable`, not merely "exists": an account whose currency has no
  // rate yet (`needsRate`) cannot take a capture either, and the placeholder
  // is the honest state for that ledger too — showing the real bar would
  // only earn a `needsRate` refusal the instant Enter is pressed.
  const hasCapturableAccount = snapshot.accounts.some((account) => account.capturable);
  if (!hasCapturableAccount) return <CommandBarPlaceholder />;

  return (
    <CommandBar
      ref={commandBarRef}
      value={commandBar.text}
      onChangeText={commandBar.setText}
      accounts={snapshot.accounts}
      categories={expenseCategories}
      today={today}
      parse={commandBar.parse}
      {...(commandBar.categoryProposal === undefined
        ? {}
        : { categoryProposal: commandBar.categoryProposal })}
      categoryAutoFilled={commandBar.categoryAutoFilled}
      onUndoCategory={commandBar.undoCategory}
      {...(fieldErrors === undefined ? {} : { fieldErrors })}
      onSubmit={commandBar.submit}
      onDiscard={commandBar.discard}
    />
  );
}

function DeskLayer({ slot }: { slot: React.ReactNode }) {
  const t = useT();
  const styles = useStyles();
  const { items, onSelect } = useTabBarItems();
  // §2.9's own split: everywhere but the landing route collapses to one row.
  const collapsed = !items.find((item) => item.name === "today")?.active;
  // The landing route is one router tab and two screens: `S04 Today` under
  // 1024, `S01 Dashboard` at and above it (`app/(tabs)/index.tsx`). The tab's
  // own name stays `today` because that is what the router registered; only
  // the word on the band changes, and only here, where the width is known.
  const deskItems = items.map((item) =>
    item.name === "today" ? { ...item, label: t("dashboard.title") } : item,
  );

  return (
    <View style={styles.column}>
      <DeskBand
        brand={<Brand />}
        nav={deskItems.map((item) => (
          <DeskNavLink key={item.name} item={item} onSelect={onSelect} />
        ))}
        commandBar={<DeskCommandBar />}
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
      <PhoneHeader />
      {/* The one place the button is mounted is the one place a page under it
          is told to leave room — `shell/floating-clearance.tsx`. Outside this
          provider (the stack's own routes, the startup screen, desk width)
          the answer is zero, which is what it always should have been. */}
      <FloatingClearanceProvider value={floating.clearance}>
        <SlotInsets>{slot}</SlotInsets>
      </FloatingClearanceProvider>
      <VisibleTabBar onLayout={onBarLayout} />
      <FloatingAddLayer barHeight={barHeight} />
    </>
  );
}

const useStyles = makeStyles((theme) => ({
  brand: { color: theme.shellText, ...text.display("displayThree") },
  column: { flex: 1 },
}));
