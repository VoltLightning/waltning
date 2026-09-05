/**
 * The bundled brand catalogue — `SPEC.md` §14.4b, the transaction-level
 * sibling of §14.4a's subscription `service` slug.
 *
 * **Waltning-owned keys, never an upstream slug.** `key` is this catalogue's
 * own stable identifier (`"orlen"`, `"youtube"`) — never a `simple-icons`
 * slug or any other third party's naming, because a vendor's rename or
 * removal must never be a silent migration of every transaction that named
 * it. Rendering a real vector mark for a known key is `packages/ui`'s
 * `BrandIcon`, backed today by this catalogue's own `accent`/`mark` pair
 * rather than a bundled SVG set (`simple-icons` per `SPEC.md`'s stack table)
 * — that wiring is S34's job; this catalogue is deliberately shaped so S34
 * only has to add a `simpleIconsSlug` field and a lookup, never touch a
 * transaction row.
 *
 * **Deliberately small.** Two entries — the two examples the card that
 * commissioned this file names as the *class* of thing it recognises, not an
 * attempt at a real merchant database. Growing this list is ordinary,
 * versioned code, the same reasoning `SPEC.md` §14.4a gives for `service`
 * being free text rather than a `CHECK`-constrained column: *"the catalog is
 * versioned code, and a CHECK against it would turn adding a service into a
 * migration."*
 *
 * **`core`'s dependency floor is decimal.js and zod, nothing else**
 * (`tests/architecture.test.ts`) — so this file is plain data and pure
 * functions, never an icon library. Real brand marks belong in
 * `packages/ui`, which carries no such floor.
 */

/**
 * Reused by `packages/schema`'s `enums.ts` — restated there, not imported,
 * for the same reason every other enum in this registry is restated (core
 * cannot import schema; see `registry/inputs.ts`'s own note on
 * `ACCOUNT_KIND`).
 *
 * **Three values, not two — round 1's M4.** `"auto"` (matched from the payee
 * offline, at write time — the value this file called `"catalog"` through
 * round 0) and `"manual"` (asserted by the caller) both pair with a non-null
 * `brand_key`. `"none"` is the third state this round adds: a *deliberate*
 * "no brand", written when a person clears a wrong catalogue match — paired
 * with a `null` key, and — unlike a row that was simply never matched, which
 * is `null`/`null` — sticky against a later payee edit, the same way
 * `"manual"` already was. Without it, clearing a match that a payee still
 * folds to had no way to stay cleared (`match.ts`'s own doc on
 * `resolveBrand`).
 */
export const BRAND_SOURCE = ["auto", "manual", "none"] as const;
export type BrandSource = (typeof BRAND_SOURCE)[number];

export type BrandCatalogEntry = {
  /** Waltning-owned, stable, lower-case, `[a-z0-9_]+`. Never renamed once shipped — `create_transaction`'s own `brand_key` values are permanent. */
  key: string;
  /** Display name — what `BrandIcon`'s accessibility label and any future editor show. */
  name: string;
  /**
   * Payee text this brand is recognised from, already folded
   * (`capture/names.ts`'s `fold`) — the offline matcher (`match.ts`) folds
   * the incoming payee the same way and looks up an exact match, so an
   * alias here must already be in its folded form or it can never match.
   */
  aliases: readonly string[];
  /** A hex colour, for `BrandIcon`'s badge until a real vector mark exists (see the file header). */
  accent: string;
  /** One or two characters, for `BrandIcon`'s badge — a wordmark abbreviation, not a monogram of the payee (that fallback is `monogramFor`, for an *unmatched* payee). */
  mark: string;
};

export const BRAND_CATALOG: readonly BrandCatalogEntry[] = [
  {
    key: "orlen",
    name: "ORLEN",
    aliases: ["orlen"],
    accent: "#D2001F",
    mark: "O",
  },
  {
    key: "youtube",
    name: "YouTube",
    aliases: ["youtube", "youtube premium"],
    // Not the brand's own #FF0000 — that fails WCAG AA (3.99:1) against the
    // white mark `BrandIcon` sets on it (`design-system/10`'s contrast gate,
    // caught by the visual suite's own axe-core pass). Darkened just enough
    // to clear 4.5:1 while staying recognisably the same red.
    accent: "#CC0000",
    mark: "YT",
  },
] as const;

export const BRAND_KEYS: ReadonlySet<string> = new Set(BRAND_CATALOG.map((entry) => entry.key));

/** Whether `key` names a catalogue entry — the whole of `create_transaction`'s "valid pair" rule for `brand_key`. */
export function isValidBrandKey(key: string): boolean {
  return BRAND_KEYS.has(key);
}

/** The catalogue entry for `key`, or `undefined` for anything not in it — including a value that was once valid and later removed (never; keys are permanent, see the file header, but `BrandIcon` still has to handle a row from a build with a wider catalogue). */
export function brandCatalogEntry(key: string): BrandCatalogEntry | undefined {
  return BRAND_CATALOG.find((entry) => entry.key === key);
}
