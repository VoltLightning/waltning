/**
 * The component library, shared by every surface — which are **one Expo build**
 * today (§4.3), so there is one library rather than one per surface.
 *
 * **Organised by domain, not by size.** It was `atoms/`, `molecules/` and
 * `organisms/` — the three global folders `architecture/11` bans — on the
 * premise that "a design system has no features to slice by". It has: the FX
 * concept alone spanned all three tiers and five files, and one file held
 * `TransactionRow` and `BalanceRow` together because they are the same *shape*
 * while belonging to different domains.
 *
 * The full target is thirteen domains, derived from the ~100 components the
 * design system names:
 *
 *   primitives · shell · states · fx · transactions · accounts ·
 *   counterparties · recurring · review · calendar · reports · dashboard · tax
 *
 * Six exist, because six have components. The rest are named here so the next
 * component has a home before it is written, which is the whole argument of
 * `12-build-order.md`. Adding a folder outside that list is a decision —
 * `tests/architecture.test.ts` holds the allowlist.
 *
 * Atomic tiers may still live **inside** a domain when one grows enough to need
 * them. That is what "a scale inside a module" means.
 */

export * from "./accounts/index.ts";
export * from "./fx/index.ts";
export * from "./primitives/index.ts";
export * from "./review/index.ts";
export * from "./shell/index.ts";
export * from "./theme/index.ts";
export * as tokens from "./tokens.ts";
export * from "./transactions/index.ts";
