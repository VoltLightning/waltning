/**
 * `<CurrencyRow>` — S17's row: a currency, what it costs to know its rate, and
 * everything you can do to it, behind one disclosure.
 *
 * **The whole header is the target.** A chevron alone would be a 10 px button
 * on a 44 px row — the same reasoning `Toggle` gives for making its label part
 * of the switch.
 *
 * **Pinned is a `Tag`; coverage is a caption.** Pinned is a *state* the
 * currency is in, coverage is a *measurement* of it, and two muted captions
 * side by side said they were the same kind of thing.
 */

import { useCallback, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useT } from "../../../i18n/provider";
import { Button } from "../../../primitives/atoms/button/button";
import { Select, type SelectOption } from "../../../primitives/atoms/select/select";
import { Tag } from "../../../primitives/atoms/tag";
import { Toggle } from "../../../primitives/atoms/toggle/toggle";
import { useInteraction } from "../../../primitives/interaction.ts";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { focus, space, touchTarget } from "../../../tokens.ts";
import {
  CoverageStatus,
  type CoverageStatusProps,
  resolveCoverageStatus,
} from "../../molecules/coverage-status/coverage-status";

/** The currency itself, as S17 reads it. */
export type CurrencyRowData = {
  code: string;
  name: string;
  symbol: string;
  symbolPosition: string;
  decimals: number;
  pinned: boolean;
  rateSource: string | null;
  version: number;
};

/**
 * Exactly `CoverageStatusProps` — declared as it, rather than restated, so the
 * caption and the row's accessible name cannot be handed different shapes.
 */
export type CurrencyRowCoverage = CoverageStatusProps;

export type CurrencyRowProps = {
  row: CurrencyRowData;
  coverage: CurrencyRowCoverage | undefined;
  /** One row is open at a time — the caller owns which, so opening one closes the last. */
  expanded: boolean;
  onToggleExpanded: (code: string) => void;
  onTogglePinned: (code: string, version: number, next: boolean) => void;
  onChangeSource: (code: string, version: number, source: string) => void;
  onArchive: (code: string, version: number) => void;
  onEdit: (row: CurrencyRowData) => void;
  onViewRates: (code: string) => void;
};

export function CurrencyRow({
  row,
  coverage,
  expanded,
  onToggleExpanded,
  onTogglePinned,
  onChangeSource,
  onArchive,
  onEdit,
  onViewRates,
}: CurrencyRowProps) {
  const t = useT();
  const styles = useStyles();
  const { focused, handlers } = useInteraction();

  const rateSources: SelectOption[] = useMemo(
    () => [
      { value: "nbp", label: t("fx.sourceNbp") },
      { value: "ecb", label: t("fx.sourceEcb") },
      { value: "nbrb", label: t("fx.sourceNbrb") },
      { value: "nbg", label: t("fx.sourceNbg") },
    ],
    [t],
  );

  const handleExpand = useCallback(() => onToggleExpanded(row.code), [onToggleExpanded, row.code]);
  const handleTogglePinned = useCallback(
    (next: boolean) => onTogglePinned(row.code, row.version, next),
    [onTogglePinned, row.code, row.version],
  );
  const handleSource = useCallback(
    (value: string) => onChangeSource(row.code, row.version, value),
    [onChangeSource, row.code, row.version],
  );
  const handleArchive = useCallback(
    () => onArchive(row.code, row.version),
    [onArchive, row.code, row.version],
  );
  const handleEdit = useCallback(() => onEdit(row), [onEdit, row]);
  const handleViewRates = useCallback(() => onViewRates(row.code), [onViewRates, row.code]);

  const detail = t("fx.currencyDetail", { symbol: row.symbol, decimals: row.decimals });
  /**
   * **The row's own accessible name, composed rather than overridden.** An
   * `accessibilityLabel` replaces the name a reader would compose from the
   * descendants, so a bare `row.code` made the name, the symbol, the coverage
   * and the pinned state audible to nobody — coverage stated to sighted users
   * only, which is exactly what S17 §6 refuses. Every fragment is already
   * translated; the separator is the same `·` the pair `Select` on S18 joins
   * a code and a name with.
   */
  const accessibilityLabel = [
    row.code,
    row.name,
    detail,
    coverage === undefined ? null : resolveCoverageStatus(t, coverage).label,
    // Gated on `!expanded` for the same reason the visible mark is: open, the
    // `Toggle` below states it and can change it, and a reader hearing "…
    // Pinned" then "Pinned, on" gets the duplication the sighted row avoids.
    row.pinned && !expanded ? t("fx.pinned") : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return (
    <View style={styles.row}>
      {/*
        The whole header is the target — a disclosure chevron alone would be a
        10 px button on a 44 px row, the same reasoning `Toggle` states for
        making its label part of the switch.
      */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        onPress={handleExpand}
        style={[styles.rowHeader, focused ? styles.focused : null]}
        {...handlers}
      >
        <View style={styles.rowHeaderLine}>
          <Text style={styles.code}>{row.code}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {row.name}
          </Text>
          <Text style={styles.detail}>{detail}</Text>
        </View>
        <View style={styles.rowStatusLine}>
          {/*
            Spread, not six hand-mapped fields: the row's accessible name above
            resolves the same sentence from the same object, and two argument
            lists for one fact is one edit away from the caption and the name
            disagreeing. `CurrencyRowCoverage` is `CoverageStatusProps`, so the
            agreement is a construction rather than a convention.
          */}
          {coverage ? <CoverageStatus {...coverage} /> : null}
          {/*
            A `Tag`, where coverage beside it is a caption — the distinction
            this screen's own rule draws: pinned is a **state** the currency
            is in, coverage is a measurement of it. Two muted captions side by
            side said the opposite.

            Only while closed: open, the `Toggle` below states the same fact
            and can change it, and one row saying "Pinned" twice is one of
            them that can go stale in a reader's eye.
          */}
          {row.pinned && !expanded ? <Tag>{t("fx.pinned")}</Tag> : null}
        </View>
      </Pressable>
      {expanded ? (
        <View style={styles.rowDetail}>
          <Toggle label={t("fx.pinned")} value={row.pinned} onChange={handleTogglePinned} />
          <Select
            label={t("fx.rateSource")}
            placeholder={t("fx.rateSourceNone")}
            options={rateSources}
            value={row.rateSource}
            onChange={handleSource}
          />
          <View style={styles.rowActions}>
            <Button label={t("fx.viewRates")} onPress={handleViewRates} variant="ghost" size="sm" />
            <Button
              label={t("fx.editCurrency", { code: row.code })}
              onPress={handleEdit}
              variant="ghost"
              size="sm"
            />
            <Button
              label={t("fx.archiveCurrency")}
              onPress={handleArchive}
              variant="secondary"
              size="sm"
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  row: { borderBottomWidth: 1, borderBottomColor: theme.border },
  /** §10's 44 pt floor — the whole header is the disclosure target. */
  rowHeader: { gap: space.xs, paddingVertical: space.x2, minHeight: touchTarget.min },
  /**
   * §2.6 — the header is a button, so it takes a ring. It carried none in the
   * screen it came from, where the rule that catches this does not run.
   */
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: -focus.offset,
  },
  rowHeaderLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rowStatusLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rowDetail: { gap: space.sm, paddingBottom: space.x2 },
  code: { color: theme.text, ...text.ui("body", 600) },
  name: { color: theme.textMuted, ...text.ui("bodySm"), flex: 1 },
  detail: { color: theme.textMuted, ...text.ui("caption") },
  rowActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
}));
