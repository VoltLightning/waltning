/** Development-readable structured logs for the native and Expo web surfaces. */

import { configureSync, getConsoleSink, getLogger } from "@logtape/logtape";
import type { ClientDiagnosticEvent } from "@waltning/client/diagnostics";
import type { DiagnosticError } from "@waltning/core/diagnostics";
import type { ApiRequestDiagnosticEvent } from "@waltning/core/rule-zero-fetch";
import type { LedgerDiagnosticEvent } from "@waltning/ledger/diagnostics";
import { Platform } from "react-native";

type MobileDiagnosticEvent =
  | ClientDiagnosticEvent
  | ApiRequestDiagnosticEvent
  | LedgerDiagnosticEvent
  | {
      scope: "app_startup";
      phase: "success";
      component: "root";
    }
  | {
      scope: "app_startup";
      phase: "failure";
      component: "fonts";
      error: DiagnosticError;
    };

const BUILD = process.env["EXPO_PUBLIC_BUILD_SHA"] || "dev";
const SURFACE = Platform.OS === "web" ? "web" : "mobile";

configureSync({
  reset: true,
  sinks: { console: getConsoleSink() },
  loggers: [
    {
      category: ["waltning", SURFACE],
      lowestLevel: __DEV__ ? "debug" : "info",
      sinks: ["console"],
    },
  ],
});

const logger = getLogger(["waltning", SURFACE]);

/**
 * One sink makes the event order visible in Metro and browser consoles. Event
 * types contain no open metadata bag, so a caller cannot casually attach an
 * amount, form value, token or request body.
 */
export function mobileDiagnostics(event: MobileDiagnosticEvent): void {
  try {
    const properties = {
      surface: SURFACE,
      build: BUILD,
      ...event,
    };
    if (event.phase === "failure") logger.error("Waltning operation failed", properties);
    else if (event.phase === "start") logger.debug("Waltning operation started", properties);
    else logger.info("Waltning operation completed", properties);
  } catch {
    // Logging must not become a new startup or write failure.
  }
}
