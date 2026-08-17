/**
 * The component library, shared by mobile and web — which are **one Expo
 * build** (§4.3), so there is one library rather than one per surface.
 *
 * Three layers, and the boundary between them is *what a component knows*:
 *
 *   atoms      no domain knowledge      Button, Input, Tag, Icon
 *   molecules  domain meaning, no data  Amount, StatTile, TransactionRow
 *   organisms  a whole section          DiffCard, Shell, CalendarGrid
 *
 * **Screens are not here.** They live in `apps/mobile/app` as expo-router
 * routes, because a screen is a route and owns data fetching — the one thing
 * nothing in this package is allowed to do.
 *
 * The design system is the source of truth for what exists:
 * `docs/specification/design-system/` — §3 primitives are atoms, §5 composites
 * are molecules and organisms. 97 components are named there. A screen never
 * invents one (working rule 1).
 */

export * from "./atoms/index.ts";
export * from "./molecules/index.ts";
export * from "./organisms/index.ts";
export * as tokens from "./tokens.ts";
