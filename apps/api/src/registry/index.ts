/**
 * The operation registry — every capability in the system, declared once.
 *
 * Two operations today. That is deliberate: §11.0's claim that one declaration
 * feeds both the tRPC router and the agent's tools had never been executed,
 * and proving it on two costs a morning where discovering it on a hundred and
 * ten costs a rewrite.
 *
 * The pair is chosen to span the axes that differ: one read that a phone may
 * run offline, one write that is gated, audited and must not.
 */

import type { Registry } from "@waltning/core";
import { createCounterparty } from "../modules/counterparties/index.ts";
import { getCurrencies } from "../modules/currencies/index.ts";
import type { OperationContext } from "./context.ts";

/**
 * Keys are written out rather than computed from `op.name`. A computed key is
 * typed `string`, which collapses the whole object into an index signature and
 * loses every operation's input type at the call site — the exact type safety
 * §11.0 promises reaches the client. A test asserts each key equals its
 * operation's `name`, so the duplication cannot drift.
 */
export const registry = {
  get_currencies: getCurrencies,
  create_counterparty: createCounterparty,
} as const satisfies Registry<OperationContext>;

export type AppRegistry = typeof registry;
