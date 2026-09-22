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
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { usePhoneLedgerStartup } from "@waltning/client/ledger/use-phone-ledger-startup";
import { describeDiagnosticError } from "@waltning/core/diagnostics";
import { CurrencyMarksProvider } from "@waltning/ui/fx/currency-marks";
import { resolveLocale } from "@waltning/ui/i18n/locales";
import { I18nProvider, useT } from "@waltning/ui/i18n/provider";
import { FormAlertHost } from "@waltning/ui/primitives/form-alert-host";
import { HapticsProvider } from "@waltning/ui/primitives/haptics";
import { StartupFailed } from "@waltning/ui/states/startup-failed";
import { ThemeProvider, useTheme, useThemeName } from "@waltning/ui/theme/provider";
import { makeStyles } from "@waltning/ui/theme/styles";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useColorScheme, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { DeviceInsets } from "../src/device-insets";
import { mobileDiagnostics } from "../src/diagnostics.ts";
import { FONT_ASSETS } from "../src/fonts.ts";
import { LockGate } from "../src/lock-gate";
import { retryPhoneLedger, startPhoneLedger, usePhoneLedgerReady } from "../src/phone-ledger";
import {
  appearance,
  appLock,
  DEVICE_LOCALES,
  dayTickHaptic,
  displayCurrency,
  floatPosition,
} from "../src/platform";

export default function RootLayout() {
  const [loaded, error] = useFonts(FONT_ASSETS);
  const systemScheme = useColorScheme();
  const resolved = useAppearance(
    appearance,
    systemScheme === "light" || systemScheme === "dark" ? systemScheme : null,
  );

  // On the device this is constant `true`; in the browser it turns once the
  // SQLite worker can answer a synchronous call — opening before that would
  // time out by construction (see `phone-ledger.web.ts`).
  const ledgerReady = usePhoneLedgerReady();
  // `null` until `ledgerReady`, then the session's own outcome — see the
  // hook's header for why this runs inside render rather than at module
  // scope: a throw there used to break this module's own evaluation.
  // `retry` runs the whole start again, and is offered only for a failure
  // another attempt could clear (`startup.retryable`).
  // `retryPhoneLedger` re-opens the platform's own gate before the hook starts
  // again — on the browser that means re-probing the SQLite worker, which is
  // what makes "Try again" an attempt rather than a re-render.
  const { startup, retry } = usePhoneLedgerStartup(ledgerReady, startPhoneLedger, retryPhoneLedger);

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
    if (startup?.status === "failed") {
      mobileDiagnostics({
        scope: "app_startup",
        phase: "failure",
        component: "ledger",
        error: describeDiagnosticError(startup.error),
      });
    }
  }, [startup]);

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
  const ready = (loaded || error) && resolved.hydrated;

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
          **The root is the ground, and that is what paints the status bar.**

          Under Android's edge-to-edge — enforced from Expo SDK 54 — the window
          draws behind the status bar and the system paints nothing there;
          whatever React renders at y=0 is the strip. This fill is what is
          behind everything, for the moments between screens when nothing else
          has painted it.

          **It was `shell`, the green, because a navigation header used to own
          that strip on every pushed route.** No route has one now: the deck
          has no navigation band, so every screen opens with `PageHeader` on
          the ground and paints the inset itself in `ground` — the same thing
          `TodayFrame` has done since the ledger got its hero. A green
          fall-through would now show only as a flash between two cream
          screens.

          **The one thing this does not fix is the glyph colour.** `app.json`
          configures `expo-status-bar` with `style: "light"`, which writes
          `android:windowLightStatusBar=false` at *build* time — right for a
          green strip, and now wrong in the light appearance where the strip is
          cream. It has been wrong on Today since that screen got its hero, and
          it is not fixable from here: the correct value is per appearance,
          which is a runtime property, and the runtime API that sets it without
          turning edge-to-edge off is `react-native-edge-to-edge`'s — a native
          module, so it arrives with the build that is ours (E0 · Leave Expo
          Go).
        */}
          {/*
            The device's tick, handed down once: a drum is four components deep
            in a form, and `packages/ui` names no haptics library.
          */}
          <HapticsProvider tick={dayTickHaptic}>
            <I18nProvider locale={resolveLocale(DEVICE_LOCALES)}>
              {/* The one place the platform-resolved ledger meets the tree: every
              screen below reads it from context, so a test or a diff preview
              can hand the same screens a different controller. A startup
              failure is a screen too — never expo-router's own
              `ErrorBoundary`, which reports a missing default export rather
              than what actually broke. */}
              {ready && startup ? (
                startup.status === "ready" ? (
                  // §5.7's launch gate sits between the ledger and the screen:
                  // the session is open (its file is the platform's to protect),
                  // and whether the person holding the phone may see it is the
                  // gate's to say. A failure screen needs no gate — it shows
                  // nothing the ledger holds.
                  <LedgerProvider controller={startup.controller}>
                    <LedgerCurrencyMarks>
                      <LockGate lock={appLock}>
                        {/* A refused submit on any screen raises its alert here. */}
                        <FormAlertHost>
                          <AppShell />
                        </FormAlertHost>
                      </LockGate>
                    </LedgerCurrencyMarks>
                  </LedgerProvider>
                ) : (
                  <StartupFailed
                    error={startup.error}
                    cause={startup.cause}
                    onRetry={startup.retryable ? retry : undefined}
                  />
                )
              ) : (
                <StartupBlank />
              )}
            </I18nProvider>
          </HapticsProvider>
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
  const themeName = useThemeName();

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: theme.ground },
        // **Once, for every route.** Set per screen it comes back the first
        // time somebody adds one; the `title`s below stay because the OS
        // reads them — the back gesture's label, the web document title —
        // even with nothing drawn.
        headerShown: false,
        /**
         * **The clock and the battery, inked for the strip underneath them.**
         *
         * Nothing paints the status bar: under edge-to-edge the window draws
         * behind it and whatever React renders at y=0 *is* the strip — which
         * is `ground` on every route now. So the glyphs have to follow the
         * appearance, dark on cream and light on the near-black.
         *
         * `app.json` still configures `expo-status-bar` with `style: "light"`,
         * and that is not a contradiction: that plugin only writes the
         * *Android* theme's default, which is what shows for the instant
         * before JS runs. This is the runtime value, and it wins.
         *
         * **On iOS this line is only half the change — the other half is in
         * `app.json`, and it is native.** `react-native-screens` applies the
         * option by setting the style on the screen's `UIViewController`
         * (`RNSScreen.mm` → `setStatusBarStyle:`), and iOS only honours a
         * view controller's `preferredStatusBarStyle` when
         * `UIViewControllerBasedStatusBarAppearance` is `YES` in `Info.plist`.
         * Expo's prebuild template writes that key as `false`, so the library
         * asserts on the mismatch and `RCTLogError`s — a red box over the app
         * on the first route that mounts, which on a cold start is the first
         * thing anyone sees. `app.json`'s `ios.infoPlist` flips it to `true`,
         * and because `Info.plist` is baked into the binary, that fix arrives
         * with a build: a JS reload will not pick it up, and Expo Go — whose
         * own `Info.plist` nobody here can edit — cannot honour this option at
         * all.
         *
         * Setting the key is safe **because nothing in this app calls the
         * imperative status-bar API.** React Native's `RCTStatusBarManager`
         * refuses `setStyle`/`setHidden` when the key is `YES`, which is the
         * mirror image of this error and the reason the two approaches cannot
         * both be used. There is no `<StatusBar>` mounted (see the note above
         * `I18nProvider`) and `expo-router` mounts none either, so only the
         * view-controller path is live.
         */
        statusBarStyle: themeName === "dark" ? "light" : "dark",
      }}
    >
      {/* **No navigation band, on any screen.**

          The deck has none. Every artboard that is not a tab root — S09, S13,
          S17, S18, S30's Back up — opens with a display title and a muted line
          on the same cream the cards sit on, and the way back is a quiet mark
          in the corner. Twelve screens wore a sage band with a small white
          title instead, purely because that is what `Stack.Screen` draws when
          nobody says otherwise, and the result was that Today looked like the
          design and everything you navigated *to* looked like a different app.

          So the header is the screen's, drawn by `PageHeader` beside its
          `GroundPanel` — which is also what makes the top inset that screen's
          own to clear, the reason the two composers were already the only
          routes here with `headerShown: false`.

          `tests/architecture.test.ts` refuses a `Stack.Screen` that leaves the
          band on, so this cannot come back one route at a time. */}
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="quick-add" options={{ title: t("routes.expense") }} />
      <Stack.Screen name="transfer" options={{ title: t("routes.transfer") }} />
      <Stack.Screen name="account/new" options={{ title: t("routes.createAccount") }} />
      <Stack.Screen name="transaction/[id]" options={{ title: t("routes.transaction") }} />
      <Stack.Screen name="accounts/[id]" options={{ title: t("routes.editAccount") }} />
      <Stack.Screen name="settings/categories" options={{ title: t("routes.categories") }} />
      <Stack.Screen name="settings/currencies" options={{ title: t("routes.currencies") }} />
      <Stack.Screen name="settings/rates" options={{ title: t("routes.rates") }} />
      <Stack.Screen name="settings/backup" options={{ title: t("routes.backup") }} />
      <Stack.Screen name="settings/restore" options={{ title: t("routes.restore") }} />
      <Stack.Screen name="settings/developer" options={{ title: t("routes.developer") }} />
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
 * The pivot, handed to every `<Amount>` — `@waltning/ui`'s
 * `CurrencyMarksProvider` fed from the ledger it cannot import, so a figure in
 * the pivot draws its symbol and every other currency its code (`04` §4.1).
 * Under `LedgerProvider`, once, so a pivot change repaints every mark.
 */
function LedgerCurrencyMarks({ children }: { children: ReactNode }) {
  const snapshot = usePhoneLedger(useLedgerController());
  const pivot = snapshot.currencies.find((currency) => currency.isPivot);
  return (
    <CurrencyMarksProvider pivot={pivot?.code} symbol={pivot?.symbol}>
      {children}
    </CurrencyMarksProvider>
  );
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
   * **The root is the ground, and that is what paints the status bar.**
   *
   * Under Android's edge-to-edge — enforced from Expo SDK 54 — the window
   * draws behind the status bar and the system paints nothing there; whatever
   * React renders at y=0 is the strip. This fill is what is behind
   * everything, for the moments between screens when nothing else has painted
   * it.
   *
   * **It was `shell`, the green, because a navigation header used to own that
   * strip on every pushed route.** No route has one now: the deck has no
   * navigation band, so every screen opens with `PageHeader` on the ground and
   * paints the inset itself — the same thing `TodayFrame` has done since the
   * ledger got its hero. A green fall-through would show only as a flash
   * between two cream screens.
   *
   * The glyphs over it are `AppStack`'s `statusBarStyle`, which follows the
   * appearance.
   */
  root: { flex: 1, backgroundColor: theme.ground },
}));
