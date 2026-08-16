/**
 * Currencies — the module's public API.
 *
 * Everything another part of the system may use is exported here. The service
 * is not: a module's internals are its own, and a second module reaching into
 * `currencies.service.ts` would couple the two in a way no boundary check can
 * see once it is normal.
 */

export type { CurrencySummary } from "./currencies.service.ts";
export { getCurrencies } from "./get-currencies.operation.ts";
