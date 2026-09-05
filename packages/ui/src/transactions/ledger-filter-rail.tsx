/**
 * `<LedgerFilterRail>` — S10 §3 (web): "the filter bar as a persistent left
 * rail rather than a chip row", carrying every dimension §4 names: search ·
 * period · account · category · scope · currency · counterparty · date
 * range, and one "clear every filter" action.
 *
 * **It owns its own scroll, and that is why it is a component.** The rail is
 * a fixed 280px column of eight controls; 1024×640 is a legitimate desk
 * viewport under `useBreakpoint`, and without a scroller of its own the
 * bottom of the stack is simply unreachable there. `GroundPanel` cannot
 * supply it — the screen passes `scroll="own"` because the table beside this
 * rail is a `FlatList` that must keep its own height — so the scroll is
 * *this* column's, bounded by the row it sits in, and the two columns scroll
 * independently. Owning it here is also what keeps the screen free of a
 * `ScrollView` import at all, which `tests/architecture.test.ts` enforces: a
 * screen that reaches for a scroller is a screen that has taken on layout
 * that belongs to a component.
 *
 * **The rail *is* the "shown, not silently applied" treatment at desk
 * width.** Each control displays its own active value — the `MultiSelect`'s
 * tokens, the `SegmentControl`'s selected segment, the stepper's own label —
 * so a second chip row restating the same state would be a duplicate the
 * phone's chips-plus-closed-sheet layout never has to show at once. Only
 * "clear every filter at a stroke" earns a control of its own.
 *
 * **Every active control says what it excludes** (S10 §4: "each filter
 * reports the count it excludes"). The number arrives as a prop — one count
 * per dimension, computed by whoever owns the port
 * (`use-filter-exclusion-counts.ts`) — because a component that queried for
 * it would be a molecule fetching, which `CLAUDE.md` forbids for the reason
 * this file would then fail to render in a story at all.
 *
 * **State in, callbacks out, and the shape is restated rather than
 * imported.** `packages/client` and `packages/ui` are siblings on the
 * architecture floor, so `LedgerFilterState` cannot come from the hook that
 * owns it; `LedgerFilterRailValue` is the same fields declared here, the
 * same way `LedgerTableSelection` is. `scope` is a bare `string` on purpose:
 * the four values are the caller's `SegmentControl` segments, and a rail
 * that hard-coded them would own a partition (`SPEC.md` §6.7) it does not
 * define.
 */

import type { TextInput } from "react-native";
import { Pressable, ScrollView, Text } from "react-native";
import { useT } from "../i18n/provider";
import { DateField } from "../primitives/date-field";
import { useInteraction } from "../primitives/interaction.ts";
import { SearchField } from "../primitives/search-field";
import { type Segment, SegmentControl } from "../primitives/segment-control";
import { MultiSelect, Select, type SelectOption } from "../primitives/select";
import { PeriodHeader } from "../shell/period-header";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, hairline, space, touchTarget } from "../tokens.ts";

/** The filter as the rail draws it — `useLedgerFilters`' own state, restated (see the file doc). */
export type LedgerFilterRailValue = {
  text: string;
  accountIds: readonly string[];
  categoryIds: readonly string[];
  /** One of `scopes`' own `value`s — the caller owns that partition. */
  scope: string;
  /** `""` — every currency. */
  currency: string;
  /** `""` — every counterparty. */
  counterpartyId: string;
  from: string;
  to: string;
};

/** Everything the four list controls can offer, resolved for display by the caller. */
export type LedgerFilterRailOptions = {
  accounts: readonly SelectOption[];
  categories: readonly SelectOption[];
  currencies: readonly SelectOption[];
  counterparties: readonly SelectOption[];
  /** `SegmentControl`'s own shape — at least two, and the caller owns the partition. */
  scopes: readonly [Segment, Segment, ...Segment[]];
};

/**
 * How many extra rows each control keeps off screen. A dimension absent from
 * this object draws no note — which is also what an inactive control gets,
 * since an inactive control excludes nothing.
 */
export type LedgerFilterRailExclusions = {
  text?: number | undefined;
  accountIds?: number | undefined;
  categoryIds?: number | undefined;
  scope?: number | undefined;
  currency?: number | undefined;
  counterpartyId?: number | undefined;
  dateRange?: number | undefined;
};

export type LedgerFilterRailProps = {
  value: LedgerFilterRailValue;
  options: LedgerFilterRailOptions;
  exclusions?: LedgerFilterRailExclusions | undefined;
  /** The period stepper — its label is derived from the range by the caller (H5, round 1). */
  period: {
    label: string;
    isCurrent: boolean;
    onPrevious: () => void;
    onNext: () => void;
    onToday: () => void;
  };
  /** The device's local `AccountingDate` — what `DateField`'s relative chips are relative to. */
  today: string;
  /** S10 §7 web's `F`: the table hands focus back to this field. */
  searchRef?: React.Ref<TextInput> | undefined;
  onChangeText: (value: string) => void;
  onChangeAccountIds: (ids: readonly string[]) => void;
  onChangeCategoryIds: (ids: readonly string[]) => void;
  onChangeScope: (scope: string) => void;
  onChangeCurrency: (code: string) => void;
  onChangeCounterpartyId: (id: string) => void;
  onChangeFrom: (value: string) => void;
  onChangeTo: (value: string) => void;
  /** Absent while nothing is active — there is nothing to clear, so nothing is drawn. */
  onClearAll?: (() => void) | undefined;
};

export function LedgerFilterRail({
  value,
  options,
  exclusions,
  period,
  today,
  searchRef,
  onChangeText,
  onChangeAccountIds,
  onChangeCategoryIds,
  onChangeScope,
  onChangeCurrency,
  onChangeCounterpartyId,
  onChangeFrom,
  onChangeTo,
  onClearAll,
}: LedgerFilterRailProps) {
  const t = useT();
  const styles = useStyles();

  return (
    <ScrollView
      style={styles.rail}
      // The gap lives on the content, not the `ScrollView` itself — a
      // `ScrollView`'s own style is its viewport, and spacing set there
      // would not travel with the scrolled content.
      contentContainerStyle={styles.railContent}
      testID="ledger-desk-rail"
    >
      <SearchField
        ref={searchRef}
        value={value.text}
        onChangeText={onChangeText}
        placeholder={t("transactions.searchPlaceholder")}
      />
      <ExcludesNote count={exclusions?.text} />

      {/*
        `tone="surface"` — the rail sits on `GroundPanel`, not in the shell
        band this component was first drawn for; `shellText` on a panel is a
        near-white on near-white (its own file doc has the ratio).
      */}
      <PeriodHeader
        tone="surface"
        label={period.label}
        onPrevious={period.onPrevious}
        onNext={period.onNext}
        onToday={period.onToday}
        isCurrent={period.isCurrent}
      />

      <MultiSelect
        label={t("transactions.filterAccount")}
        placeholder={t("transactions.filterAccount")}
        options={options.accounts}
        values={value.accountIds}
        onChange={onChangeAccountIds}
        searchable
      />
      <ExcludesNote count={exclusions?.accountIds} />

      <MultiSelect
        label={t("transactions.filterCategory")}
        placeholder={t("transactions.filterCategory")}
        options={options.categories}
        values={value.categoryIds}
        onChange={onChangeCategoryIds}
        searchable
      />
      <ExcludesNote count={exclusions?.categoryIds} />

      <SegmentControl segments={options.scopes} value={value.scope} onChange={onChangeScope} />
      <ExcludesNote count={exclusions?.scope} />

      <Select
        label={t("transactions.filterCurrency")}
        placeholder={t("transactions.filterEveryCurrency")}
        options={options.currencies}
        value={value.currency}
        onChange={onChangeCurrency}
      />
      <ExcludesNote count={exclusions?.currency} />

      <Select
        label={t("transactions.filterCounterparty")}
        placeholder={t("transactions.filterEveryCounterparty")}
        options={options.counterparties}
        value={value.counterpartyId}
        onChange={onChangeCounterpartyId}
        searchable
      />
      <ExcludesNote count={exclusions?.counterpartyId} />

      {/*
        §4's arbitrary date range, which the stepper above cannot express —
        at desk width these two were reachable only through the phone's
        bottom sheet, which the desk branch never opens, so a range that was
        not one calendar month could be neither set nor seen (M, round 1).
        Setting either end makes the stepper's own label say "from → to"
        rather than naming a month it is not filtering.
      */}
      <DateField
        label={t("transactions.filterFrom")}
        value={value.from}
        onChange={onChangeFrom}
        today={today}
      />
      <DateField
        label={t("transactions.filterTo")}
        value={value.to}
        onChange={onChangeTo}
        today={today}
      />
      {/* One note for the pair — `from` and `to` are one filter (see `dateRange`). */}
      <ExcludesNote count={exclusions?.dateRange} />

      {onClearAll ? <ClearAllFilters onPress={onClearAll} /> : null}
    </ScrollView>
  );
}

/**
 * The one control the rail draws itself, so it carries §2.6's ring itself —
 * `Button` would put a filled or outlined surface where a plain text action
 * belongs, at the bottom of a column of labelled fields.
 */
function ClearAllFilters({ onPress }: { onPress: () => void }) {
  const t = useT();
  const styles = useStyles();
  const { focused, handlers } = useInteraction();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("transactions.clearAllFilters")}
      onPress={onPress}
      {...handlers}
      style={[styles.clearAll, focused ? styles.clearAllFocused : null]}
    >
      <Text style={styles.clearAllText}>{t("transactions.clearAllFilters")}</Text>
    </Pressable>
  );
}

/**
 * "Excludes 34." Nothing at all when the count is absent or zero: a control
 * that hides nothing has nothing to report, and "Excludes 0" beside every
 * unset filter would be noise in a column whose whole argument is that
 * everything is visible at once.
 */
function ExcludesNote({ count }: { count?: number | undefined }) {
  const t = useT();
  const styles = useStyles();
  if (count === undefined || count <= 0) return null;
  return (
    <Text style={styles.excludes}>
      {count === 1
        ? t("transactions.filterExcludesOne", { count })
        : t("transactions.filterExcludesMany", { count })}
    </Text>
  );
}

const useStyles = makeStyles((theme) => ({
  rail: {
    width: 280,
    flexGrow: 0,
    flexShrink: 0,
    paddingRight: space.x3,
    borderRightWidth: hairline.width,
    borderRightColor: theme.hairline,
  },
  railContent: { gap: space.x3, paddingBottom: space.x3 },
  // Pulled up against the control above it — the note belongs to that
  // control, and the rail's own `gap` would otherwise float it between two.
  excludes: { marginTop: -space.md, color: theme.textMuted, ...text.ui("caption") },
  clearAll: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  clearAllFocused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  clearAllText: { color: theme.textMuted, ...text.ui("bodySm", 600) },
}));
