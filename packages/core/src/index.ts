/**
 * The contract layer, and the bottom of the dependency graph.
 *
 * Everything here must run identically on the phone, the web bundle and the
 * server — so: no Node APIs, no database driver, no filesystem. decimal.js and
 * zod only. `packages/db` depends on this package; never the other way around.
 *
 * Grows with the registry: operation definitions, shared Zod schemas, F/R/S
 * classifications (`computations.md` §0).
 */
export * as money from "./money.ts";
