/**
 * `@waltning/client` — how any surface talks to the server.
 *
 * **May import `react`. Must never import `react-native`** (`architecture/11`).
 * React is platform-neutral and React Native is a renderer, so all client
 * *behaviour* is shared by construction and only rendering is negotiable.
 *
 * **Sliced by domain, not by layer.** This was `src/hooks/` holding
 * `use-accounts`, `use-transactions`, `use-currencies`, `use-probe` and
 * `use-query` together — five things from four domains plus a primitive, filed
 * by what kind of function they are. The moment `use-transactions` grows a
 * filter model and a selector, `hooks/` pushes them apart from the hook they
 * belong to.
 *
 * `transport/` and `query/` are the domain-free foundation; everything else is
 * a domain and matches a folder in `@waltning/ui`.
 *
 * The root export is the transport alone, so a consumer that needs no React
 * gets none. Hooks come from their domain: `@waltning/client/accounts`.
 */

export { CaptiveResponseError } from "@waltning/core";
export * from "./transport/index.ts";
