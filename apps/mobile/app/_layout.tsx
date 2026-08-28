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
import { ThemeProvider } from "@waltning/ui/theme/provider";
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
  if ((!loaded && !error) || !resolved.hydrated) return <View />;

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
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </DeviceInsets>
  );
}
