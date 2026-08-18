/**
 * Organisms — D2 of `12-build-order.md`: structure for every screen.
 *
 * `Card` · `GroundPanel` · `DualTotal` are here. Deferred with the screens that
 * define them rather than guessed: `Shell` (needs `FxStatusChip` and
 * `CurrencyChip`, which are D9's FX work), `TabBar` (S01/S04 decide what the
 * five tabs are — building it now means inventing the app's navigation), and
 * `BottomSheet` (S05's 170px-from-top composer with a pinned footer).
 *
 * `DiffCard` is D3 and deliberately not here: **one gate, three call sites** —
 * agent, voice and receipt — so building it before any of them is what stops
 * three variants appearing (P3).
 *
 * Original note follows.
 *
 * Organisms — a whole section of a screen, composed of molecules, still
 * fetching nothing. `design-system/05-composites.md` §5.3, §5.5–5.8.
 *
 * `DiffCard` is the one to get right: it carries §11.2's approval gate, and
 * building it twice would produce two approval semantics on the two surfaces
 * where being wrong costs most.
 *
 * Shell · DiffCard · CalendarGrid · SubscriptionRow · ComparisonTable · Table
 */
export { Card, type CardProps, GroundPanel } from "./card.tsx";
export { DualTotal, type DualTotalProps } from "./dual-total.tsx";
