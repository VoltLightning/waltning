/**
 * `<RateEditor>` — `design-system/04` §4.7, `SPEC.md` §7.6 level 2.
 *
 * *"Sets a manual rate for a pair over a date or a date range … Before
 * writing, it states exactly what it will do … Never silently overwrites
 * another manual entry. If the range contains existing `manual` rows, they
 * are counted separately and the action requires a second, explicit
 * confirmation."*
 *
 * **The range is a prop, not a field this component owns.** `04`'s own
 * worked example states the dates as already chosen — "Set RUB → 0,0104 for
 * 2022-03-12 … 2026-08-07" — and the screen that hosts this (S18) is what
 * picks them, from a tapped `RateTable` row (`from === to`) or its own range
 * chips. A `DateField` pair here would be a second place a range gets
 * chosen, answering to nothing.
 *
 * **The counts are computed here, from `existingRows`.** `setManualRateInput`
 * takes no preview of its own — the executor either writes or refuses — so
 * the breakdown this component shows before submitting is this component's
 * job, not a server round trip's.
 *
 * **Two submits, not two components.** The first press states the count and,
 * only when `manualCount > 0`, waits for a second press before calling
 * `onSubmit(true)` — the "second, explicit confirmation" the spec asks for,
 * held as this component's own state rather than a `shell/confirm-dialog`
 * import `tests/module-boundaries.test.ts` would refuse from a foundation
 * module.
 */

import { accountingDate, daysBetween } from "@waltning/core/date";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { RateField } from "../primitives/rate-field";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";

export type RateEditorRow = {
  date: string;
  source: string;
};

export type RateEditorProps = {
  /** The pivot — shown, never chosen here (`SPEC.md` §7.0). */
  base: string;
  quote: string;
  from: string;
  to: string;
  /** The typed rate, as a decimal string. */
  rate: string;
  onRateChange: (value: string | null) => void;
  /** Every row the replica already holds across `from`…`to` — sparse. */
  existingRows: readonly RateEditorRow[];
  /** `overwriteManual` — `true` only once the second confirmation has fired. */
  onSubmit: (overwriteManual: boolean) => void;
  onCancel: () => void;
  disabled?: boolean;
};

export function RateEditor({
  base,
  quote,
  from,
  to,
  rate,
  onRateChange,
  existingRows,
  onSubmit,
  onCancel,
  disabled = false,
}: RateEditorProps) {
  const t = useT();
  const styles = useStyles();
  const [confirming, setConfirming] = useState(false);

  const counts = useMemo(() => {
    const totalDays = Math.max(0, daysBetween(accountingDate(from), accountingDate(to))) + 1;
    const manual = existingRows.filter((row) => row.source === "manual").length;
    const carried = existingRows.filter((row) => row.source === "carried_forward").length;
    const synced = existingRows.length - manual - carried;
    const absent = totalDays - existingRows.length;
    return { totalDays, absent, carried, manual, synced };
  }, [from, to, existingRows]);

  const handlePress = useCallback(() => {
    if (counts.manual > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    onSubmit(counts.manual > 0);
  }, [counts.manual, confirming, onSubmit]);

  const canSubmit = rate !== "" && !disabled;

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t("fx.rateEditorTitle", { quote, base, from, to })}</Text>

      <RateField label={t("fx.rateEditorRateLabel")} value={rate} onChange={onRateChange} />

      <View style={styles.summary}>
        <Text style={styles.summaryLine}>
          {t("fx.rateEditorTotalDays", { count: counts.totalDays })}
        </Text>
        <Text style={styles.summaryLine}>{t("fx.rateEditorAbsent", { count: counts.absent })}</Text>
        <Text style={styles.summaryLine}>
          {t("fx.rateEditorCarried", { count: counts.carried })}
        </Text>
        <Text style={[styles.summaryLine, counts.manual > 0 ? styles.summaryManual : null]}>
          {t("fx.rateEditorManual", { count: counts.manual })}
        </Text>
      </View>

      {confirming ? (
        <Text style={styles.warning}>
          {t("fx.rateEditorConfirmOverwrite", { count: counts.manual })}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button label={t("common.cancel")} onPress={onCancel} variant="secondary" />
        <Button
          label={confirming ? t("fx.rateEditorConfirmSubmit") : t("fx.rateEditorSubmit")}
          onPress={handlePress}
          disabled={!canSubmit}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.x3 },
  title: { color: theme.text, ...text.ui("body", 600) },
  summary: { gap: space.xs },
  summaryLine: { color: theme.textMuted, ...text.ui("bodySm") },
  summaryManual: { color: theme.assertedText },
  warning: { color: theme.assertedText, ...text.ui("bodySm") },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.x3 },
}));
