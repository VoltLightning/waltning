/**
 * Root layout — one route tree for native and web (§14.6).
 *
 * `expo-router` maps this directory to routes on both platforms, which is what
 * makes "one codebase" a fact rather than an aspiration: a screen added here
 * exists on the phone and in the browser without a second registration.
 *
 * It is also where the fonts load, because loading them is a platform concern
 * and this is the platform's entry point.
 */

// Side-effect import, and it must come first: `randomId()` reads the global at
// call time and the first call is a row insert.
import "../src/polyfills.ts";
import { useAppearance } from "@waltning/client/appearance/use-appearance";
import { LedgerProvider } from "@waltning/client/ledger/ledger-provider";
import { describeDiagnosticError } from "@waltning/core/diagnostics";
import { resolveLocale } from "@waltning/ui/i18n/locales";
import { I18nProvider, useT } from "@waltning/ui/i18n/provider";
import { text } from "@waltning/ui/theme/fonts";
import { ThemeProvider, useTheme } from "@waltning/ui/theme/provider";
import { makeStyles } from "@waltning/ui/theme/styles";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { useColorScheme, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { DeviceInsets } from "../src/device-insets";
import { mobileDiagnostics } from "../src/diagnostics.ts";
import { FONT_ASSETS } from "../src/fonts.ts";
import { requirePhoneLedger, usePhoneLedgerReady } from "../src/phone-ledger";
import { appearance, DEVICE_LOCALES, displayCurrency, floatPosition } from "../src/platform";

export default function RootLayout() {
  const [loaded, error] = useFonts(FONT_ASSETS);
  const systemScheme = useColorScheme();
  const resolved = useAppearance(
    appearance,
    systemScheme === "light" || systemScheme === "dark" ? systemScheme : null,
  );

  useEffect(() => {
    void appearance.hydrate();
    // Not awaited before first paint: the button renders at the default and
    // moves once the disk answers, which on a phone is before the fonts are.
    void floatPosition.hydrate();
    void displayCurrency.hydrate();
  }, []);

  useEffect(() => {
    if (error) {
      mobileDiagnostics({
        scope: "app_startup",
        phase: "failure",
        component: "fonts",
        error: describeDiagnosticError(error),
      });
    }
  }, [error]);

  useEffect(() => {
    if (loaded && resolved.hydrated) {
      mobileDiagnostics({ scope: "app_startup", phase: "success", component: "root" });
    }
  }, [loaded, resolved.hydrated]);

  /**
   * **Render nothing until the faces are in — and only until then.**
   *
   * Text laid out in the system face and then reflowed into Figtree is a
   * visible jump on every cold start, and on a screen whose whole job is a
   * column of figures it is a column that moves while being read.
   *
   * The blank is a `View` rather than a spinner deliberately. Font loading from
   * the bundle is measured in milliseconds; a spinner would flash and be gone,
   * which reads as a glitch rather than as progress.
   */
  // On the device this is constant `true`; in the browser it turns once the
  // SQLite worker can answer a synchronous call — opening before that would
  // time out by construction (see `phone-ledger.web.ts`).
  const ledgerReady = usePhoneLedgerReady();

  const ready = (loaded || error) && resolved.hydrated && ledgerReady;

  /**
   * **A font that failed to load is a fact, not a reason to stop.**
   *
   * The fallback is legible, so refusing to start would trade a cosmetic
   * failure for a total one. But it must not pass unnoticed either — the exact
   * failure this file exists to end is the app rendering in the system face for
   * months with nobody able to tell.
   *
   * This is the only remaining way that happens. A face the design system asks
   * for and the app does not supply is a **compile** error (`src/fonts.ts`), so
   * what is left is the bundle being present and unreadable at runtime.
   *
   * A structured error rather than a throw or a banner: it reaches the
   * development logs, and it does not put a typography problem in front of
   * someone trying to enter a transaction.
   */
  return (
    // `DeviceInsets` outside `ThemeProvider`: the insets are a property of the
    // window and the theme is a property of the app. Nothing about a notch
    // changes when the appearance does, and a provider that remounted on a
    // theme swap would remeasure the window for no reason.
    // `GestureHandlerRootView` outermost: every gesture in the tree — the
    // floating button's drag today — is resolved by this one root, and a
    // gesture outside it is silently a no-op on Android.
    <GestureHandlerRootView style={rootViewStyle}>
      <DeviceInsets>
        <ThemeProvider name={resolved.theme}>
          {/*
          **No `<StatusBar>` component, and that is the fix.**

          `expo-status-bar` drives the status bar through APIs Android
          deprecated for edge-to-edge, and mounting it *turns edge-to-edge off*
          — which is what put an opaque black strip above every screen. Expo
          say as much for Expo Go — edge-to-edge there "works only for
          projects which aren't using the `<StatusBar/>` component" — and
          `react-native-edge-to-edge` warns that both it and RN's own
          `StatusBar` "may cause unexpected behavior".

          What it was there for — light icons over a dark green header — is a
          *theme* property, not a runtime one. `app.json` configures the
          `expo-status-bar` plugin with `style: "light"`, which writes
          `android:windowLightStatusBar=false` into the app theme at build
          time. Nothing mounts, edge-to-edge stays on, and the strip is drawn
          by whatever the app renders at y=0.
        */}
          {/*
          **The root is the shell's green, and that is what paints the status
          bar.**

          The strip was black. Under Android's edge-to-edge — enforced from
          Expo SDK 54 — the window draws behind the status bar and the system
          paints nothing there; whatever React renders at y=0 is the strip. On
          the ledger that is `TodayFrame`'s shell, which is why that screen
          looked right. On a pushed route it is the navigation header, and the
          native header does not extend its own background under the inset
          here — so the strip fell through to the window, which is black.

          A root in `shell` makes the fall-through the header's own colour
          rather than the window's. It is not a workaround for the header: the
          header still paints itself, and this is simply what is behind
          everything. The ledger is unaffected — `TodayFrame`'s root is
          `ground` and covers it.

          `shell` rather than `ground` because green is the colour of every
          top strip in the app, and the top strip is the only place this shows.
        */}
          <I18nProvider locale={resolveLocale(DEVICE_LOCALES)}>
            {/* The one place the platform-resolved ledger meets the tree: every
              screen below reads it from context, so a test or a diff preview
              can hand the same screens a different controller. */}
            {ready ? (
              <LedgerProvider controller={requirePhoneLedger()}>
                <AppShell />
              </LedgerProvider>
            ) : (
              <StartupBlank />
            )}
          </I18nProvider>
        </ThemeProvider>
      </DeviceInsets>
    </GestureHandlerRootView>
  );
}

/**
 * The one style that cannot come from `makeStyles`: it sits *outside*
 * `ThemeProvider`, and it names no colour — `flex: 1` is layout, not theme.
 */
const rootViewStyle = { flex: 1 } as const;

/**
 * The navigator, **inside `<I18nProvider>` rather than beside it.**
 *
 * A route title is a translated string, and `useTranslation` reads the nearest
 * provider — called in `RootLayout`, which *renders* the provider, it would
 * find none and fall back to English. Every route would then be titled in
 * English on a Polish phone while the screen below it was Polish, which is the
 * kind of half-translation that looks like a data problem rather than a wiring
 * one.
 *
 * Separated for that reason alone: this is the same tree, one component down.
 */
function AppStack() {
  const t = useT();
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: theme.ground },
        headerStyle: { backgroundColor: theme.shell },
        // Colours the title *and* the back chevron; a `color` inside
        // `headerTitleStyle` would set one of the two and look right.
        headerTintColor: theme.shellText,
        headerTitleStyle: text.ui("displayThree"),
        headerShadowVisible: false,
      }}
    >
      {/* The tab shell draws its own chrome — Today's header is the shell
          itself (a 54pt total does not fit in a navigation bar, §5.1), and
          the other tabs are stubs with none yet. `quick-add`,
          `account/new`, `transaction/[id]` and `settings/categories` stay
          stack routes pushed *over* the tabs. */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="quick-add" options={{ title: t("routes.expense") }} />
      <Stack.Screen name="transfer" options={{ title: t("routes.transfer") }} />
      <Stack.Screen name="account/new" options={{ title: t("routes.createAccount") }} />
      <Stack.Screen name="transaction/[id]" options={{ title: t("routes.transaction") }} />
      <Stack.Screen name="accounts/index" options={{ title: t("routes.accounts") }} />
      <Stack.Screen name="accounts/[id]" options={{ title: t("routes.editAccount") }} />
      <Stack.Screen name="account/new" options={{ title: t("routes.createAccount") }} />
      <Stack.Screen name="settings/categories" options={{ title: t("routes.categories") }} />
      <Stack.Screen name="settings/currencies" options={{ title: t("routes.currencies") }} />
      <Stack.Screen name="settings/rates" options={{ title: t("routes.rates") }} />
      <Stack.Screen name="counterparty/[id]" options={{ title: t("routes.counterparty") }} />
      <Stack.Screen name="counterparty/new" options={{ title: t("routes.newCounterparty") }} />
      <Stack.Screen
        name="counterparty/[id]/edit"
        options={{ title: t("routes.editCounterparty") }}
      />
    </Stack>
  );
}

/**
 * The blank first frame, **painted** — it was a bare `<View>`, which is
 * transparent, so a cold start flashed the window's own white before the first
 * frame even for someone who had chosen the dark theme.
 *
 * It is a component rather than an early return because that is what lets it
 * take its colour from `makeStyles` like everything else. The early return
 * happened *above* `ThemeProvider` and so had to read `themes[name]` by hand
 * and write the result into an inline style — the one shape in the app where a
 * colour reached JSX directly, and the shape a hardcoded colour comes back in.
 *
 * A `View` rather than a spinner, deliberately: font loading from the bundle is
 * measured in milliseconds, and a spinner that flashes and is gone reads as a
 * glitch rather than as progress.
 */
function StartupBlank() {
  const styles = useStyles();
  return <View style={styles.blank} />;
}

/**
 * The app under its providers: the shell's green behind everything, and the
 * navigator on top.
 */
function AppShell() {
  const styles = useStyles();
  return (
    <View style={styles.root}>
      <AppStack />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  blank: { flex: 1, backgroundColor: theme.ground },
  /**
   * **The root is the shell's green, and that is what paints the status bar.**
   *
   * Under Android's edge-to-edge — enforced from Expo SDK 54 — the window draws
   * behind the status bar and the system paints nothing there; whatever React
   * renders at y=0 is the strip. On the ledger that is `TodayFrame`'s own
   * shell, which is why that screen always looked right. On a pushed route it
   * is the navigation header, and the native header does not extend its
   * background under the inset — so the strip fell through to the window, which
   * is black.
   *
   * `shell` rather than `ground` because green is the colour of every top strip
   * in the app, and the top strip is the only place this shows. The ledger is
   * unaffected: `TodayFrame`'s root is `ground` and covers it.
   */
  root: { flex: 1, backgroundColor: theme.shell },
}));
