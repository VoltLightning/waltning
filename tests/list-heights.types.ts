/**
 * Type-level contract test: the two halves of the list's height table agree.
 *
 * **A compile-time assertion, not a runtime one.** It runs in `pnpm -r
 * typecheck`, which the pre-commit hook gates on, so a key added to one side
 * and not the other is a `tsc` error rather than a strip that drifts.
 *
 * The seam is real and unavoidable. The heights are *reported* by
 * `ListEntryCell`, which lives in `packages/ui` because it is the thing that
 * renders them; they are *consumed* by `listGeometry`, which lives in
 * `packages/client` because it is a derived model and must not import a
 * renderer. Neither package may import the other, so the union and the record
 * are declared separately — and this screen is the one place both are in
 * scope — which is `tests/`, not the screen: the assertion names no platform,
 * and `architecture.test.ts` refused it in `apps/mobile` for exactly that
 * reason while this file was being written. `CLAUDE.md`: *a loose type at a
 * seam is where contracts leak; pin those with compile-time assertions.*
 *
 * Break it by adding a kind to one side: add `"expected"` to `EntryHeightKey`
 * and this file stops compiling until `EntryHeights` grows the same key.
 *
 * The file exports nothing at run time. If it compiles, the contract holds.
 */

// Relative, because `tests/` is not a workspace package and so has no
// dependency on either one — the same reason `architecture.test.ts` reads
// source by path rather than importing it.
import type { EntryHeights } from "../packages/client/src/ledger/use-ledger-list/list-geometry.ts";
import type { EntryHeightKey } from "../packages/ui/src/transactions/molecules/list-entry/entry.ts";

type Expect<T extends true> = T;

/** Invariant equality — `Equals<any, X>` is false, which is the point. */
type Equals<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;

/**
 * Every kind the cell can report is a kind the geometry has a height for, and
 * the other way round. A one-way `extends` would let the record grow a key
 * nothing ever measures, which reads as working and silently uses the estimate
 * for ever.
 */
export type HeightKeysAgree = Expect<Equals<EntryHeightKey, keyof EntryHeights>>;
