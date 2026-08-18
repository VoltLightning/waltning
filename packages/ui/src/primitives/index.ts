/**
 * Primitives — `design-system/03`. **The one folder that knows no domain.**
 *
 * Not a tier. `primitives/` survives the feature-first rule because domain-free
 * is a *property*, where `atoms/` was a size. A component belongs here only if
 * it would mean the same thing in a ledger, a calendar or a chat client.
 *
 * That test moved `Pill` out — §3.4 defines it as *import review's* row-level
 * provenance marker, and `Rule · <name>` is review vocabulary. `Tag` was moved
 * out too and came back: see its own note.
 *
 * The 44px floor and the §2.6 focus ring are properties of everything here, and
 * `conformance.test.ts` checks them across the whole package rather than this
 * folder — an interactive control in `fx/` needs them just as much.
 */

export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from "./button";
export { Chip, type ChipProps } from "./chip";
export { IconButton, type IconButtonProps, type IconButtonSize } from "./icon-button";
export { type Segment, SegmentControl, type SegmentControlProps } from "./segment-control";
export { Tag, type TagProps, type TagVariant } from "./tag";
