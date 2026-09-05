/**
 * `<BrandIcon>` — `SPEC.md` §14.4b, `design-system/05`.
 *
 * *"A transaction for ORLEN, YouTube or another recognised merchant shows
 * its real mark immediately — including when it was created with no
 * internet — while an unknown payee is still never blank."*
 *
 * **A catalogue accent badge today, a real vector mark later.** `packages/ui`
 * carries no dependency floor the way `packages/core` does (`CLAUDE.md`'s
 * "decimal.js and zod only" is `core`'s alone), but wiring `simple-icons` —
 * bundled SVGs, a contract test pinning every slug, Metro *and* Vite asset
 * pipelines — is S34's job (`SPEC.md`'s own stack table). This component's
 * props are shaped so that swap is additive: `brandKey` already names the
 * catalogue entry a real mark would key off, and nothing about the callers
 * on S04/S09/S10 changes when it lands.
 *
 * **Never blank.** A recognised `brandKey` renders the catalogue's own
 * accent colour and short mark; anything else — `null`, or a key this
 * build's catalogue does not carry — falls back to `monogramFor`, the exact
 * treatment `CounterpartyRow`'s own avatar already gives an unmatched name
 * (`design-system/05`: *"same treatment as CounterpartyRow's fallback"*).
 * The payee is what the fallback is derived from; `brandKey` is never
 * invented from it here — that resolution already happened, offline, in
 * `@waltning/core/brands/match`, before this component ever saw a row.
 */

import { brandCatalogEntry } from "@waltning/core/brands/catalog";
import { Text, View } from "react-native";
import { monogramFor } from "../primitives/monogram.ts";
import { text } from "../theme/fonts.ts";
import { useTheme } from "../theme/provider";
import { makeStyles } from "../theme/styles.ts";
import { radius } from "../tokens.ts";

export type BrandIconProps = {
  /** The catalogue key a row resolved to, or `null`/absent when nothing matched. */
  brandKey?: string | null;
  /** What the fallback monogram is derived from — never used when `brandKey` resolves. */
  payee: string;
  /** Row (24) and widget (20) — `design-system/05`'s own `ServiceIcon` sizing, reused here. */
  size?: 24 | 20;
};

export function BrandIcon({ brandKey, payee, size = 24 }: BrandIconProps) {
  const theme = useTheme();
  const styles = useStyles();
  const entry = brandKey ? brandCatalogEntry(brandKey) : undefined;
  // A plain object built *above* the JSX, not inline — `tests/architecture.test.ts`'s
  // "no style object literal through JSX" rule, the same reason `counterparty-row.tsx`
  // computes `monogramFill`/`monogramInk` as their own variables.
  const box = { width: size, height: size };

  if (entry) {
    const fill = { backgroundColor: entry.accent };
    const ink = { color: theme.textOnAccent };
    return (
      <View style={[styles.badge, box, fill]} {...DECORATIVE}>
        <Text style={[styles.mark, ink]} numberOfLines={1}>
          {entry.mark}
        </Text>
      </View>
    );
  }

  // Unrecognised — never blank (§14.4b). The same monogram `CounterpartyRow`
  // gives an unmatched name, derived from the payee rather than the brand.
  const monogram = monogramFor(payee, theme);
  const fill = { backgroundColor: monogram.fill };
  const ink = { color: monogram.ink };
  return (
    <View style={[styles.badge, box, fill]} {...DECORATIVE}>
      <Text style={[styles.mark, ink]} numberOfLines={1}>
        {monogram.letter}
      </Text>
    </View>
  );
}

/**
 * This badge is never its own accessible stop. The mark is decorative
 * everywhere it appears today (S04, S09, S10, S13) and the payee text beside
 * it already carries the words a screen reader needs — an `accessibilityLabel`
 * here would make the row announce "ORLEN, ORLEN", and would leave a blank
 * payee's `?` fallback with nothing to announce at all.
 *
 * **All three targets, because all three ship.** iOS reads
 * `accessibilityElementsHidden` and Android reads
 * `importantForAccessibility` — the pair `toast.tsx`'s status mark carries,
 * with `"no-hide-descendants"` rather than its `"no"` because this badge has
 * a `<Text>` child that would otherwise stay exposed on its own — and the web
 * (react-native-web) reads `aria-hidden`, the attribute `button.tsx`'s
 * spinner uses. A badge carrying only one of the three is hidden on one
 * platform and announced twice on the others.
 */
const DECORATIVE = {
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
  "aria-hidden": true,
} as const;

const useStyles = makeStyles(() => ({
  // `radius.xs`, never `radius.pill` — sharp corners are this product's own
  // rule for a badge, the same choice `CounterpartyRow`'s own monogram makes
  // at `radius.sm` for its larger size.
  badge: {
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: { ...text.ui("caption", 700) },
}));
