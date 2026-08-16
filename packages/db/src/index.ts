// Re-exported for server-side convenience; the canonical home is
// @waltning/core, which clients import directly (they never depend on db).
export { money } from "@waltning/core";
export { createDb, type Database, ping, requireDatabaseUrl, schema } from "./client.ts";
export * from "./schema.ts";
