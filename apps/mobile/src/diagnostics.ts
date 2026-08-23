/** Development-readable structured logs for the native and Expo web surfaces. */

import { configureSync, getConsoleSink, getLogger, type LogRecord } from "@logtape/logtape";
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

function diagnosticIdentity(event: MobileDiagnosticEvent): string {
  if ("operation" in event) return event.operation;
  if ("action" in event) return event.action;
  if ("update" in event) return event.update;
  if (event.scope === "api_request") return `${event.method} ${event.path}`;
  if ("stage" in event) return `${event.scope} ${event.stage}`;
  return `${event.scope} ${event.component}`;
}

function diagnosticOutcome(event: MobileDiagnosticEvent): string {
  if (event.phase === "start") return "started";
  if (event.phase === "failure") return "failed";
  return "completed";
}

function diagnosticMessage(event: MobileDiagnosticEvent): string {
  const boundary = "boundary" in event ? ` at ${event.boundary}` : "";
  return `${diagnosticIdentity(event)} ${diagnosticOutcome(event)}${boundary}`;
}

function metroFormatter(record: LogRecord): readonly [string] {
  const message =
    typeof record.rawMessage === "string" ? record.rawMessage : record.rawMessage.join("{}");
  return [
    JSON.stringify({
      ...record.properties,
      time: new Date(record.timestamp).toISOString(),
      level: record.level,
      category: record.category.join("."),
      message,
    }),
  ];
}

configureSync({
  reset: true,
  sinks: { console: getConsoleSink({ formatter: metroFormatter }) },
  loggers: [
    {
      category: ["logtape", "meta"],
      lowestLevel: "warning",
      sinks: ["console"],
    },
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
    const message = diagnosticMessage(event);
    if (event.phase === "failure") logger.error(message, properties);
    else if (event.phase === "start") logger.debug(message, properties);
    else logger.info(message, properties);
  } catch {
    // Logging must not become a new startup or write failure.
  }
}
