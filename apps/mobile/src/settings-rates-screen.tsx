/**
 * S18 · Settings · Exchange rates — `screens/S18`.
 *
 * Pair `Select` (quote; base is the pivot) and range chips over `RateTable`.
 * A tapped row or *Set a range* opens `RateEditor` → `setManualRate` — first
 * without `overwriteManual`, and a second confirmation when the range holds
 * existing manual rows (`RateEditor`'s own gate). *Clear manual* removes the
 * manual rows in the same range. Coverage per currency beneath, from
 * `readCoverage` — `SyncLog`'s coverage half; the event log (`sync_fx_rates`
 * history) is arc 2's, once a server sync exists to log.
 *
 * **Re-rate is not offered**, per S18 §3/§7: `rerate_transactions` is
 * server-only (`offlineEligible: false`, `wave-4-shared.md`'s own excluded
 * list). The count of transactions resting on an estimate in the range is
 * not stated — no reader exists for it yet (`fx_rate_estimated` is not
 * surfaced through any port method this arc built) — so the line names the
 * gap rather than inventing a number.
 */

import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { type AccountingDate, addDays, isAccountingDate } from "@waltning/core/date";
import { type CurrencyCode, currencyCode } from "@waltning/core/money";
import { CoverageTag } from "@waltning/ui/fx/coverage-tag";
import { RateEditor } from "@waltning/ui/fx/rate-editor";
import { RateTable } from "@waltning/ui/fx/rate-table";
import { useT } from "@waltning/ui/i18n/provider";
import { Button } from "@waltning/ui/primitives/button";
import { DateField } from "@waltning/ui/primitives/date-field";
import { Select, type SelectOption } from "@waltning/ui/primitives/select";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { Toast } from "@waltning/ui/states/toast";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { space } from "@waltning/ui/tokens";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";

type RangePreset = "30d" | "90d" | "year" | "custom";
type Range = { from: AccountingDate; to: AccountingDate };

/** `null` for `"custom"` while what is typed is not yet a real, ordered range. */
function presetRange(
  today: AccountingDate,
  preset: RangePreset,
  custom: { from: string; to: string },
): Range | null {
  if (preset === "30d") return { from: addDays(today, -29), to: today };
  if (preset === "90d") return { from: addDays(today, -89), to: today };
  if (preset === "year") return { from: addDays(today, -364), to: today };
  if (!isAccountingDate(custom.from) || !isAccountingDate(custom.to)) return null;
  if (custom.from > custom.to) return null;
  return { from: custom.from, to: custom.to };
}

export default function SettingsRatesScreen() {
  const t = useT();
  const styles = useStyles();
  const ledger = useLedgerController();
  usePhoneLedger(ledger);

  const today = deviceRuntime().capture().date;
  const settings = ledger.listCurrencySettings();
  const pivot = settings.find((row) => row.isPivot);
  const quoteOptions: SelectOption[] = settings
    .filter((row) => !row.isPivot)
    .map((row) => ({ value: row.code, label: `${row.code} · ${row.name}` }));

  // S17's own link at 0% coverage (`CoverageTag.onPress`) preselects the pair
  // — `?quote=<code>` — over the plain first-option default, but only when
  // that code is actually one of this pivot's quote currencies.
  const { quote: quoteParam } = useLocalSearchParams<{ quote?: string }>();
  const preselected = quoteOptions.find((option) => option.value === quoteParam);

  const [quote, setQuote] = useState<CurrencyCode | null>(
    preselected
      ? currencyCode(preselected.value)
      : quoteOptions[0]
        ? currencyCode(quoteOptions[0].value)
        : null,
  );
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [custom, setCustom] = useState({
    from: addDays(today, -29) as string,
    to: today as string,
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorRange, setEditorRange] = useState<Range>({ from: today, to: today });
  const [rate, setRate] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  // The toast's own re-arm token (`useTimer`/`useToastMotion`'s `resetKey`,
  // H1) — two shows can repeat an identical message (the same validation
  // error twice), and the ref is bumped synchronously before the state
  // setter that triggers the re-render, so the new value is already
  // current by the time it's read.
  const toastTokenRef = useRef(0);

  const range = presetRange(today, preset, custom);
  const handleDismissToast = useCallback(() => setToast(null), []);

  const handleChangeQuote = useCallback((value: string) => setQuote(currencyCode(value)), []);
  const handlePreset30 = useCallback(() => setPreset("30d"), []);
  const handlePreset90 = useCallback(() => setPreset("90d"), []);
  const handlePresetYear = useCallback(() => setPreset("year"), []);
  const handleChangeCustomFrom = useCallback((value: string) => {
    setPreset("custom");
    setCustom((prev) => ({ ...prev, from: value }));
  }, []);
  const handleChangeCustomTo = useCallback((value: string) => {
    setPreset("custom");
    setCustom((prev) => ({ ...prev, to: value }));
  }, []);

  const rows =
    quote === null || pivot === undefined || range === null
      ? []
      : ledger.listFxRates({ base: pivot.code, quote, from: range.from, to: range.to });

  const handleSelectRow = useCallback((date: string) => {
    if (!isAccountingDate(date)) return;
    setEditorRange({ from: date, to: date });
    setRate("");
    setEditorOpen(true);
  }, []);
  const handleOpenRangeEditor = useCallback(() => {
    if (range === null) return;
    setEditorRange(range);
    setRate("");
    setEditorOpen(true);
  }, [range]);
  const handleCloseEditor = useCallback(() => setEditorOpen(false), []);
  const handleChangeRate = useCallback((value: string | null) => setRate(value ?? ""), []);

  const editorRows =
    quote === null || pivot === undefined || !editorOpen
      ? []
      : ledger.listFxRates({ base: pivot.code, quote, from: editorRange.from, to: editorRange.to });

  const handleSubmitEditor = useCallback(
    (overwriteManual: boolean) => {
      if (quote === null || pivot === undefined) return;
      const result = ledger.setManualRate({
        base: pivot.code,
        quote,
        from: editorRange.from,
        to: editorRange.to,
        rate,
        overwriteManual,
        today,
      });
      if ("fieldErrors" in result) {
        toastTokenRef.current += 1;
        setToast(result.fieldErrors[0]?.message ?? t("fx.rateWriteFailed"));
        return;
      }
      setEditorOpen(false);
    },
    [ledger, quote, pivot, editorRange, rate, t, today],
  );

  const handleClearManual = useCallback(() => {
    if (quote === null || pivot === undefined || range === null) return;
    const result = ledger.clearManualRate({
      base: pivot.code,
      quote,
      from: range.from,
      to: range.to,
    });
    if ("fieldErrors" in result) {
      toastTokenRef.current += 1;
      setToast(result.fieldErrors[0]?.message ?? t("fx.rateWriteFailed"));
    }
  }, [ledger, quote, pivot, range, t]);

  const coverage = ledger.readCoverage(today);
  const quoteCurrencies = useMemo(() => new Set(quoteOptions.map((o) => o.value)), [quoteOptions]);
  const shownCoverage = coverage.filter((row) => quoteCurrencies.has(row.code));

  return (
    <GroundPanel scroll="own">
      {pivot === undefined ? null : (
        <Select
          label={t("fx.pairLabel", { base: pivot.code })}
          placeholder={t("fx.pairPlaceholder")}
          options={quoteOptions}
          value={quote}
          onChange={handleChangeQuote}
        />
      )}

      <View style={styles.presetRow}>
        <Button
          label={t("fx.range30d")}
          onPress={handlePreset30}
          variant={preset === "30d" ? "primary" : "secondary"}
          size="sm"
        />
        <Button
          label={t("fx.range90d")}
          onPress={handlePreset90}
          variant={preset === "90d" ? "primary" : "secondary"}
          size="sm"
        />
        <Button
          label={t("fx.rangeYear")}
          onPress={handlePresetYear}
          variant={preset === "year" ? "primary" : "secondary"}
          size="sm"
        />
      </View>
      <View style={styles.customRow}>
        <DateField
          label={t("fx.rangeFrom")}
          value={custom.from}
          onChange={handleChangeCustomFrom}
          today={today}
        />
        <DateField
          label={t("fx.rangeTo")}
          value={custom.to}
          onChange={handleChangeCustomTo}
          today={today}
        />
      </View>

      <Card>
        {quote === null || range === null || pivot === undefined ? (
          <Text style={styles.empty}>{t("fx.noQuoteCurrency")}</Text>
        ) : (
          <RateTable
            base={pivot.code}
            quote={quote}
            from={range.from}
            to={range.to}
            rows={rows}
            onSelectRow={handleSelectRow}
          />
        )}
      </Card>

      <View style={styles.actionsRow}>
        <Button
          label={t("fx.setRange")}
          onPress={handleOpenRangeEditor}
          variant="secondary"
          disabled={quote === null || range === null}
        />
        <Button
          label={t("fx.clearManual")}
          onPress={handleClearManual}
          variant="ghost"
          disabled={quote === null || range === null}
        />
      </View>

      {editorOpen && quote !== null && pivot !== undefined ? (
        <RateEditor
          base={pivot.code}
          quote={quote}
          from={editorRange.from}
          to={editorRange.to}
          rate={rate}
          onRateChange={handleChangeRate}
          existingRows={editorRows}
          onSubmit={handleSubmitEditor}
          onCancel={handleCloseEditor}
        />
      ) : null}

      <Text style={styles.rerateNote}>{t("fx.rerateNotOffered")}</Text>

      <Card title={t("fx.coverageTitle")}>
        {shownCoverage.map((row) => (
          <View key={row.code} style={styles.coverageRow}>
            <Text style={styles.coverageCode}>{row.code}</Text>
            <CoverageTag
              days={row.days}
              realDays={row.realDays}
              calendarDays={row.calendarDays}
              futureRows={row.futureRows}
              pct={row.coveragePct}
              lastDate={row.lastDate ?? undefined}
            />
          </View>
        ))}
      </Card>

      {toast === null ? null : (
        <Toast message={toast} onDismiss={handleDismissToast} token={toastTokenRef.current} />
      )}
    </GroundPanel>
  );
}

const useStyles = makeStyles((theme) => ({
  presetRow: { flexDirection: "row", gap: space.sm },
  customRow: { flexDirection: "row", gap: space.sm },
  actionsRow: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
  empty: { color: theme.textMuted, ...text.ui("body") },
  rerateNote: { color: theme.textMuted, ...text.ui("caption") },
  coverageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space.xs,
  },
  coverageCode: { color: theme.text, ...text.ui("body", 600) },
}));
