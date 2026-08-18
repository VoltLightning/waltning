/**
 * The asynchronous-read primitive — `query/` is this package's `primitives/`.
 *
 * Domain-free by property, not by tier: `useQuery` would mean the same thing in
 * any client. It sat in a folder called `hooks/` beside `use-accounts` and
 * `use-transactions`, which is organisation by *kind* — the same mistake as
 * `atoms/`, less visible because "hooks" reads like a place.
 */

export { type Query, useQuery } from "./use-query.ts";
