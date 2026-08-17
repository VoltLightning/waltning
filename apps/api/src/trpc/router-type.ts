/**
 * The client's view of the server: a type, and deliberately nothing else.
 *
 * §11.0 promises that an operation's input and output types reach the client,
 * and `contract.types.ts` pins that promise on this side. The client half of it
 * needs `AppRouter` — which means `apps/mobile` has to name `apps/api`, an edge
 * the dependency floor (`architecture/10`) does not have.
 *
 * It is a *type* edge, erased before any bundler sees it, and this file is what
 * keeps it that way. It exports no value at all, so:
 *
 *  - a value import finds nothing to import;
 *  - under `verbatimModuleSyntax`, writing `import { AppRouter }` instead of
 *    `import type { AppRouter }` fails to compile;
 *  - the file emits nothing, so no bundler can follow it into `apps/api` and
 *    drag Hono, Drizzle and the Postgres driver into a phone bundle.
 *
 * The alternative was an untyped client with hand-written response types, which
 * is the same drift `routerFromRegistry` returning `AnyRouter` already caused
 * once: the client compiled happily against shapes the server had stopped
 * sending.
 */

export type { AppRouter } from "./router.ts";
