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
    }
  | {
      scope: "app_startup";
      phase: "failure";
      component: "ledger";
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

/**
 * Exhaustive on `phase` — every value across every unioned event type,
 * `LedgerDiagnosticEvent`'s `"rebuild"` and `ApiRequestDiagnosticEvent`'s
 * `"response"` included. The old catch-all `else return "completed"` is
 * exactly the shape that let `"rebuild"` through unnoticed as a plain
 * success; a `switch` with a `never` default makes a phase this function
 * has not been told about a compile error instead.
 */
function diagnosticOutcome(event: MobileDiagnosticEvent): string {
  switch (event.phase) {
    case "start":
      return "started";
    case "failure":
      return "failed";
    case "rebuild":
      return "rebuilt";
    case "success":
    case "response":
      return "completed";
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
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
    else if (event.phase === "rebuild") logger.warn(message, properties);
    else logger.info(message, properties);
  } catch {
    // Logging must not become a new startup or write failure.
  }
}
