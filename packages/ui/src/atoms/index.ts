/**
 * Atoms — `design-system/03-primitives.md`. D1 of `12-build-order.md`.
 *
 * No domain knowledge, no data fetching, no tRPC. An atom that knows what a
 * transaction is has been misfiled: it belongs one layer up.
 *
 * **The 44px floor is fixed here, once.** §3.5 records that chips measured ~34
 * against it; fixing that across thirty screens is a week and fixing it at the
 * source is a day. Every interactive atom below also carries the §2.6 focus
 * ring, which is never removed and never replaced by a colour change alone.
 *
 * Deferred with their screens rather than built blind: `Keypad` (S05's
 * thumb-zone layout), `RateField` (S18, needs the synced value beside the
 * override), `DateField` (S05's relative shortcuts), `SearchField` (S10's live
 * results). Each is shaped by the one screen that uses it, and building them
 * now would be inventing three-quarters of an interaction.
 */

export { AmountField, type AmountFieldProps, parseAmount } from "./amount-field";
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from "./button";
export { Chip, type ChipProps } from "./chip";
export { IconButton, type IconButtonProps, type IconButtonSize } from "./icon-button";
export { Pill, type PillTier } from "./pill";
export { type Segment, SegmentControl, type SegmentControlProps } from "./segment-control";
export { Tag, type TagProps, type TagVariant } from "./tag";
