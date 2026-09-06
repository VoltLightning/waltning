/**
 * `<RateEditor>` — `design-system/04` §4.8, `SPEC.md` §7.6 level 2.
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
 * **The sentence naming the pair and the range is the host's heading, not a
 * line inside this component.** S18 opens this in a `BottomSheet` whose own
 * header states *"Set PLN per USD, 2026-08-08 … 2026-08-08"* as a real
 * heading; a second copy of it here was a body-weight line under a heading
 * saying the same thing, which is how it came to read as disabled chrome
 * rather than as the title of what is about to be written.
 *
 * **The rate field is first, and this component does not avoid the
 * keyboard.** First, because it is the only thing anyone opens this to type,
 * and because a host that lifts its sheet by the keyboard's height lifts the
 * top of the content — so whatever is at the top is what stays reachable.
 * Not avoiding it, because **the sheet is the box that has to move**: two
 * nested keyboard-avoiding views each add the keyboard's height and the
 * content ends up twice as far off the bottom as it should be. `BottomSheet`
 * owns that, and until it does, an iOS `decimal-pad` (which has no return
 * key) covers everything here below the host's header.
 *
 * **Two submits, not two components.** The first press states the count and,
 * only when `manualCount > 0`, waits for a second press before calling
 * `onSubmit(true)` — the "second, explicit confirmation" the spec asks for,
 * held as this component's own state rather than a `shell/confirm-dialog`
 * import `tests/module-boundaries.test.ts` would refuse from a foundation
 * module.
 */

import { accountingDate, daysBetween } from "@waltning/core/date";
import * as money from "@waltning/core/money";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocale, useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { RateField } from "../primitives/rate-field";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { space } from "../tokens.ts";
import { formatRate } from "./format-rate.ts";

export type RateEditorRow = {
  date: string;
  source: string;
};

/**
 * L11 — `setManualRateInput`'s own cap, restated here so the range is refused
 * before a submit round trip.
 *
 * **Deliberately not exported, and deliberately not the screen's business.**
 * This is the cap on a *write*, so it belongs where the write is composed.
 * The range control on S18 picks what to *look at*, `clear_manual_rate` has
 * no cap of its own, and a table that draws whatever range it is handed needs
 * none — a second copy of this number gating either of those would refuse
 * work the ledger accepts.
 */
const MAX_RANGE_DAYS = 366;

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
  /**
   * The host's own refusal — `set_manual_rate`'s first field error. It renders
   * here rather than on a `Toast`, because this component lives inside a
   * modal sheet: a toast on the page behind it is a message nobody can see.
   */
  error?: string;
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
  error,
}: RateEditorProps) {
  const t = useT();
  const locale = useLocale();
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

  // `money.cmp` rather than trusting `rate !== ""` alone: `RateField`'s own
  // `parseRate` already refuses a typed `0`, but `rate` is this component's
  // prop, not its state — a caller could still hand it `"0"` directly, and
  // the contract behind `onSubmit` deserves the same refusal here that a
  // typed zero gets in the field (`fx.ratePositive`'s own reasoning).
  const rangeTooLong = counts.totalDays > MAX_RANGE_DAYS;
  const canSubmit =
    rate !== "" && !disabled && !rangeTooLong && money.cmp(money.toMoney(rate), money.ZERO) > 0;

  return (
    <View style={styles.root}>
      <RateField
        label={t("fx.rateEditorRateLabel", { quote, base })}
        value={rate}
        editable
        onChange={onRateChange}
      />

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

      {error === undefined ? null : <Text style={styles.warning}>{error}</Text>}

      {rangeTooLong ? (
        <Text style={styles.warning}>
          {t("fx.rateEditorRangeTooLong", { max: String(MAX_RANGE_DAYS) })}
        </Text>
      ) : null}

      {confirming ? (
        <Text style={styles.warning}>
          {t("fx.rateEditorConfirmOverwrite", {
            count: counts.manual,
            // L10 — through the locale's own decimal mark, like every other
            // rendered rate — never `rate`'s raw, always-dot storage form.
            rate: formatRate(rate, locale),
            quote,
            base,
          })}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button label={t("common.cancel")} onPress={onCancel} variant="secondary" />
        <Button
          label={confirming ? t("fx.rateEditorConfirmSubmit") : t("fx.rateEditorSubmit")}
          onPress={handlePress}
          disabled={!canSubmit}
          variant="primary"
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: space.x3 },
  summary: { gap: space.xs },
  summaryLine: { color: theme.textMuted, ...text.ui("bodySm") },
  summaryManual: { color: theme.assertedText },
  warning: { color: theme.assertedText, ...text.ui("bodySm") },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.x3 },
}));
