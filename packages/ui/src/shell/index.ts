/**
 * The app frame — `design-system/05` §5.1.
 *
 * Named `shell/` rather than `structure/` or `layout/` because those are tiers
 * wearing a domain's clothes, and the rule bans tiers as folders. This one has
 * a referent: `Shell` is a component (§5.1), and everything here is part of the
 * frame a screen sits in.
 *
 * **`DualTotal` belongs here, not in `dashboard/`.** §5.1 puts it *inside*
 * `Shell` — "brand, nav, scope segment, FxStatusChip, CurrencyChip, `DualTotal`
 * hero" — and D2 places it early "because mine and ours appear on every
 * headline figure". Filing it under `dashboard/` and then having `Shell` import
 * it would break "no module imports another" on the first day.
 */

export { Card, type CardProps, GroundPanel } from "./card";
export { DualTotal, type DualTotalProps } from "./dual-total";
