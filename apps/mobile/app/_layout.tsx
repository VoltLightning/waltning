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
import { describeDiagnosticError } from "@waltning/core/diagnostics";
import { text } from "@waltning/ui/theme/fonts";
import { ThemeProvider } from "@waltning/ui/theme/provider";
import { themes } from "@waltning/ui/theme/roles";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { useColorScheme, View } from "react-native";
import { DeviceInsets } from "../src/device-insets";
import { mobileDiagnostics } from "../src/diagnostics.ts";
import { FONT_ASSETS } from "../src/fonts.ts";
import { appearance } from "../src/platform";

export default function RootLayout() {
  const [loaded, error] = useFonts(FONT_ASSETS);
  const systemScheme = useColorScheme();
  const resolved = useAppearance(
    appearance,
    systemScheme === "light" || systemScheme === "dark" ? systemScheme : null,
  );

  useEffect(() => {
    void appearance.hydrate();
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
  const theme = themes[resolved.theme];

  /**
   * **The blank is painted.** It was a bare `<View>`, which is transparent, so
   * a cold start flashed the window's own background — white — before the first
   * frame, including for someone who chose the dark theme. The appearance is
   * already resolved by this point; there is nothing to wait for.
   */
  if ((!loaded && !error) || !resolved.hydrated) {
    return <View style={{ flex: 1, backgroundColor: theme.ground }} />;
  }

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
        <View style={{ flex: 1, backgroundColor: theme.shell }}>
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
            {/* The ledger's header is the shell itself — a 54pt total does not
                fit in a navigation bar, and §5.1 makes the shell the frame. */}
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="quick-add" options={{ title: "Expense" }} />
            <Stack.Screen name="account/new" options={{ title: "Create account" }} />
          </Stack>
        </View>
      </ThemeProvider>
    </DeviceInsets>
  );
}
