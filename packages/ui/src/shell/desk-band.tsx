/**
 * `<DeskBand>` — `design-system/05` §5.1, `design-system/02` §2.10. The shell
 * at desk width (`useBreakpoint() === "desk"`).
 *
 * **A second composition of `Shell`'s own vocabulary, not a second shell.**
 * `Shell` stacks a header row over a hero because a phone reads top to
 * bottom; `DeskBand` puts nav, a command bar, a currency marker and the scope
 * filter beside the hero because a desk reads left to right and has the width
 * to spend. Both draw the same flat `theme.shell` band, both take a `hero` as
 * a slot rather than building one, and neither is the general case of the
 * other — a component trying to be both would carry every phone prop into
 * every desk story and back.
 *
 * **Every non-brand piece arrives as a slot**, exactly as `Shell`'s `leading`
 * / `trailing` do. `apps/mobile` is what knows how nav resolves to
 * `expo-router` triggers, what the ledger's leading currency is, and what
 * scope a screen has not wired a reader for yet — none of which this
 * component may import (`architecture/11`: no app names a platform, and
 * `packages/ui` never names a router). `DeskNavItem` below is the one piece
 * of that composition that *is* rendering, not wiring, so it lives here and
 * the app only supplies the label, the active flag and the handler.
 *
 * **Two rows expanded; one, collapsed, everywhere but the landing route** —
 * the same split `02-tokens` §2.9 already draws for the phone header
 * (title+tag left, total right, one row tall). Expanded: brand+nav, the
 * command bar and the currency chip share the top row; scope and the hero
 * share the bottom one — the hero's neighbour once `DESK4`'s spend/net/
 * business triple exists (arc-full, `SPEC.md` §5/§12), empty until then.
 * Collapsed drops the command bar, the currency chip and the scope segment:
 * a route that is not the dashboard has no command to type and no filter
 * this arc reads, and showing controls nothing answers is worse than
 * omitting them. What survives collapsing is identity (brand, nav) and the
 * one figure every route can still state.
 */

import { Pressable, Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { useInteraction } from "../primitives/interaction.ts";
import { useSafeArea } from "../primitives/safe-area";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";

export type DeskBandProps = {
  /** The wordmark. Rendered exactly as given, like `Shell`'s `leading`. */
  brand: React.ReactNode;
  /** `DeskNavItem`s, in route order. */
  nav: React.ReactNode;
  /** `N`'s composer slot — a disabled placeholder until `DESK2`. */
  commandBar: React.ReactNode;
  /** The ledger's leading currency — `CurrencyChip`, or nothing to show. */
  currency: React.ReactNode;
  /** The scope `SegmentControl` — a filter, never shown on `DualTotal`. */
  scope: React.ReactNode;
  /** `DualTotal` at `size="band"`, or its single-currency fallback. */
  hero: React.ReactNode;
  /** One row: every route but the landing one. */
  collapsed?: boolean;
};

export function DeskBand({
  brand,
  nav,
  commandBar,
  currency,
  scope,
  hero,
  collapsed = false,
}: DeskBandProps) {
  const styles = useStyles();
  const insets = useSafeArea();

  // Composed here rather than in `useStyles`, matching `Shell`: the theme
  // cache is keyed on the theme object alone, and a per-device inset baked
  // into it would hand the second window the first one's.
  const clearance = {
    paddingTop: space.x3 + insets.top,
    paddingLeft: space.x5 + insets.left,
    paddingRight: space.x5 + insets.right,
  };

  const identity = (
    <View style={styles.identity}>
      {brand}
      <View accessibilityRole="tablist" style={styles.nav}>
        {nav}
      </View>
    </View>
  );

  if (collapsed) {
    return (
      <View style={[styles.band, clearance]}>
        <View style={styles.row}>
          {identity}
          <View style={styles.heroSlot}>{hero}</View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.band, clearance]}>
      <View style={styles.row}>
        {identity}
        <View style={styles.commandBar}>{commandBar}</View>
        <View style={styles.currencySlot}>{currency}</View>
      </View>
      <View style={styles.row}>
        <View>{scope}</View>
        <View style={styles.heroSlot}>{hero}</View>
      </View>
    </View>
  );
}

export type DeskNavItemProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

/**
 * One nav link — an `sm` rectangle, the active one lit by
 * `theme.shellNavActiveFill`. `accessibilityRole="tab"` rather than `"link"`,
 * matching `TabBar`'s own choice for the same four routes: exactly one is
 * ever current, which is what `aria-selected` asserts, and axe refuses that
 * attribute on a role that does not expect it.
 */
export function DeskNavItem({ label, active, onPress }: DeskNavItemProps) {
  const styles = useStyles();
  const { focused, handlers } = useInteraction();

  // `react-native-web` reads the flat `accessibilitySelected`, never the
  // React Native `accessibilityState` object — the same gap `TabBar`
  // documents. Both forms are supplied.
  const ariaSelectedProps: { accessibilitySelected: boolean } = {
    accessibilitySelected: active,
  };

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      {...handlers}
      {...ariaSelectedProps}
      style={[
        styles.navItem,
        active ? styles.navItemActive : null,
        focused ? styles.navItemFocused : null,
      ]}
    >
      <Text style={[styles.navLabel, active ? styles.navLabelActive : null]}>{label}</Text>
    </Pressable>
  );
}

export type CurrencyChipProps = {
  /** The ledger's leading currency, or `null` before the first account. */
  currency: string | null;
};

/**
 * A static marker, deliberately — no picker, no chevron. Arc 1 has one
 * currency's worth of unrated captures and no rate source to switch against
 * (`DESK` table, "out of it": the FX chip), so a dropdown affordance here
 * would promise a control nothing behind it answers.
 */
export function CurrencyChip({ currency }: CurrencyChipProps) {
  const styles = useStyles();
  if (currency === null) return null;

  return (
    <View style={styles.currencyChip}>
      <Text style={styles.currencyChipText}>{currency}</Text>
    </View>
  );
}

/**
 * `N`'s composer, before `DESK2` builds it. A disabled look — muted text,
 * `shellNavActiveFill`'s own border — rather than `TextField`: that component
 * always draws a label above the input, which a single-line slot in a
 * horizontal band has no row for, and this one accepts no text yet regardless.
 */
export function CommandBarPlaceholder() {
  const t = useT();
  const styles = useStyles();

  return (
    <View style={styles.commandBarPlaceholder} accessibilityRole="none">
      <Text style={styles.commandBarText}>{t("shell.deskAddPlaceholder")}</Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  band: { backgroundColor: theme.shell, gap: space.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x4,
    paddingVertical: space.x2,
  },
  identity: { flexDirection: "row", alignItems: "center", gap: space.x4 },
  nav: { flexDirection: "row", gap: space.xs },
  commandBar: { flex: 1 },
  currencySlot: { flexShrink: 0 },
  heroSlot: { alignItems: "flex-end" },

  commandBarPlaceholder: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    paddingHorizontal: space.x3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: theme.shellNavActiveFill,
  },
  commandBarText: { color: theme.shellTextMuted, ...text.ui("body") },

  navItem: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    paddingHorizontal: space.xl,
    borderRadius: radius.sm,
  },
  navItemActive: { backgroundColor: theme.shellNavActiveFill },
  navItemFocused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  navLabel: { color: theme.shellTextMuted, ...text.ui("bodySm") },
  navLabelActive: { color: theme.shellText, ...text.ui("bodySm", 600) },

  currencyChip: {
    borderWidth: 1,
    borderColor: theme.shellNavActiveFill,
    borderRadius: radius.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
  },
  currencyChipText: { color: theme.shellTextMuted, ...text.ui("bodySm", 600) },
}));
