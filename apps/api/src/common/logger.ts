/** Pino is the API's JSON log destination; callers can only submit safe events. */

import pino from "pino";
import { BUILD } from "../config/build.ts";
import type { ApiDiagnostics } from "./diagnostics.ts";

const pretty = process.env["NODE_ENV"] !== "production" && process.env["NODE_ENV"] !== "test";

const logger = pino({
  level: process.env["NODE_ENV"] === "test" ? "silent" : (process.env["LOG_LEVEL"] ?? "info"),
  base: { service: "api", build: BUILD },
  redact: {
    paths: [
      "input",
      "payload",
      "body",
      "headers",
      "token",
      "password",
      "amount",
      "memo",
      "name",
      "*.input",
      "*.payload",
      "*.body",
      "*.headers",
      "*.token",
      "*.password",
      "*.amount",
      "*.memo",
      "*.name",
    ],
    censor: "[redacted]",
  },
  ...(pretty
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, singleLine: true, translateTime: "SYS:standard" },
        },
      }
    : {}),
});

export const apiDiagnostics: ApiDiagnostics = (event) => {
  if (event.phase === "failure") logger.error(event);
  else logger.info(event);
};
