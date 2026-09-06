/**
 * S18 · Settings · Exchange rates — `screens/S18`.
 *
 * Pair `Select` (quote; base is the pivot) and range chips over `RateTable`.
 * A tapped row or *Set a range* opens `RateEditor` **in a `BottomSheet`** →
 * `setManualRate` — first without `overwriteManual`, and a second
 * confirmation when the range holds existing manual rows (`RateEditor`'s own
 * gate). *Clear manual* removes the manual rows in the same range. Coverage
 * per currency beneath, from `readCoverage` — `SyncLog`'s coverage half; the
 * event log (`sync_fx_rates` history) is arc 2's, once a server sync exists
 * to log.
 *
 * **`RateTable` is this screen's scroller, and everything else rides in it.**
 * The table is virtualized (`FlatList`), and a `FlatList` inside the page's
 * own `ScrollView` is React Native's double-scroll warning — so rather than
 * give up either the virtualization or the page scroll, this screen hands its
 * controls to the table as `header` and its coverage card as `footer`, and
 * `GroundPanel scroll="own"` holds the one list. That is what keeps a
 * 2,080-day pair cheap *and* lets the last card clear the bottom inset.
 *
 * **The editor is a sheet because the table is long.** It used to render
 * below the table, which on a phone put it some 1,300 px past the row that
 * opened it: tapping a date looked like it did nothing at all. A sheet is
 * where the tapped row is, and it is also what makes the editor's own
 * heading a heading (the sheet's header states the pair and the range).
 *
 * **The range control stacks on a phone and pairs at desk width.** Each
 * `DateField` carries its own row of quick-day chips, so two of them side by
 * side is four controls and six chips across 390 px — the *To* field and half
 * its chips ran off the right edge. `useBreakpoint()` decides, at the top,
 * the same way every other layout branch in this app does.
 *
 * **Deep link — `?quote=<code>&date=<YYYY-MM-DD>`.** The route reads both and
 * hands them in as props (`app/settings/rates.tsx`; routes compose only).
 * `quote` preselects the pair, `date` opens the editor on that single day, so
 * a capture blocked for want of a rate can link straight at the fix.
 *
 * **A parameter this ledger cannot resolve opens nothing.** `quote` naming a
 * currency that is not one of this pivot's quotes leaves the editor closed —
 * it must never fall through to the first currency with the editor already
 * open, because two taps there write a manual rate for a pair nobody asked
 * about. `date` must be a real calendar day, and one that has already
 * happened: `set_manual_rate` refuses a future date, so opening the editor on
 * one would only stage a refusal. Any of those, and the visit is an
 * unparameterised visit.
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
import {
  type AccountingDate,
  addDays,
  isAccountingDate,
  isRealCalendarDate,
} from "@waltning/core/date";
import { type CurrencyCode, currencyCode } from "@waltning/core/money";
import { CoverageStatus } from "@waltning/ui/fx/coverage-status";
import { RateEditor } from "@waltning/ui/fx/rate-editor";
import { RateTable, type RateTablePair } from "@waltning/ui/fx/rate-table";
import { useT } from "@waltning/ui/i18n/provider";
import { Button } from "@waltning/ui/primitives/button";
import { DateField } from "@waltning/ui/primitives/date-field";
import { Select, type SelectOption } from "@waltning/ui/primitives/select";
import { useBreakpoint } from "@waltning/ui/primitives/use-breakpoint";
import { BottomSheet } from "@waltning/ui/shell/bottom-sheet";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { Toast } from "@waltning/ui/states/toast";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { space } from "@waltning/ui/tokens";
import { useCallback, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";

type RangePreset = "30d" | "90d" | "year" | "custom";
type Range = { from: AccountingDate; to: AccountingDate };

/**
 * `null` for `"custom"` while what is typed is not yet a real, ordered range.
 *
 * **A real calendar day, not merely the `YYYY-MM-DD` shape.** `2026-02-31`
 * has the shape; `addDays`/`daysBetween` roll it forward into March, so the
 * table would draw rows starting three days after the date on screen while
 * `listFxRates` filtered on the literal string. One field, one reading.
 */
function presetRange(
  today: AccountingDate,
  preset: RangePreset,
  custom: { from: string; to: string },
): Range | null {
  if (preset === "30d") return { from: addDays(today, -29), to: today };
  if (preset === "90d") return { from: addDays(today, -89), to: today };
  if (preset === "year") return { from: addDays(today, -364), to: today };
  if (!isAccountingDate(custom.from) || !isAccountingDate(custom.to)) return null;
  if (!isRealCalendarDate(custom.from) || !isRealCalendarDate(custom.to)) return null;
  if (custom.from > custom.to) return null;
  return { from: custom.from, to: custom.to };
}

/**
 * `expo-router` answers `string | string[]` — a repeated key (`?quote=PLN&
 * quote=EUR`) is an array, and an array is not a value this screen can use.
 * Typed honestly at the seam and narrowed here, the same way
 * `transaction-detail-screen.tsx` and `transfer-screen.tsx` do.
 */
function oneParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export type SettingsRatesScreenProps = {
  /** `?quote=<code>` — preselects the pair when it names one of this pivot's quote currencies. */
  quote?: string | string[] | undefined;
  /** `?date=<YYYY-MM-DD>` — opens the editor on that single day when it is a real, past calendar date. */
  date?: string | string[] | undefined;
};

export default function SettingsRatesScreen({
  quote: rawQuoteParam,
  date: rawDateParam,
}: SettingsRatesScreenProps = {}) {
  const t = useT();
  const styles = useStyles();
  const breakpoint = useBreakpoint();
  const ledger = useLedgerController();
  usePhoneLedger(ledger);

  const today = deviceRuntime().capture().date;
  const settings = ledger.listCurrencySettings();
  const pivot = settings.find((row) => row.isPivot);
  const quoteOptions: SelectOption[] = settings
    .filter((row) => !row.isPivot)
    .map((row) => ({ value: row.code, label: `${row.code} · ${row.name}` }));

  const quoteParam = oneParam(rawQuoteParam);
  const dateParam = oneParam(rawDateParam);

  // S17's own link, and PRs C/D's capture gate — `?quote=` preselects the pair
  // over the plain first-option default, but only when that code is actually
  // one of this pivot's quote currencies.
  const preselected = quoteOptions.find((option) => option.value === quoteParam);
  // A `?quote=` this ledger cannot resolve — archived, renamed, or a gate that
  // raced the ledger — must not open the editor on whichever pair happened to
  // sort first. The selection falls back as it always did; the editor does not
  // open at all.
  const quoteResolved = quoteParam === undefined || preselected !== undefined;
  // `?date=` — the day a capture could not be priced. Checked against the
  // calendar, not only the shape (`isAccountingDate` accepts `2026-02-31` by
  // design), and against today, because `set_manual_rate` refuses a date that
  // has not happened yet: opening on one would only stage a refusal.
  const linkedDate =
    dateParam !== undefined &&
    isAccountingDate(dateParam) &&
    isRealCalendarDate(dateParam) &&
    dateParam <= today
      ? dateParam
      : null;
  const linkOpensEditor = linkedDate !== null && quoteResolved;

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
  const [editorOpen, setEditorOpen] = useState(linkOpensEditor);
  const [editorRange, setEditorRange] = useState<Range>(
    linkOpensEditor && linkedDate !== null
      ? { from: linkedDate, to: linkedDate }
      : { from: today, to: today },
  );
  const [rate, setRate] = useState("");
  const [editorError, setEditorError] = useState<string | null>(null);
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
    setEditorError(null);
    setEditorOpen(true);
  }, []);
  const handleOpenRangeEditor = useCallback(() => {
    if (range === null) return;
    setEditorRange(range);
    setRate("");
    setEditorError(null);
    setEditorOpen(true);
  }, [range]);
  const handleCloseEditor = useCallback(() => {
    setEditorOpen(false);
    setEditorError(null);
  }, []);
  // The refusal belongs to the rate that caused it. Left standing under a
  // field that has since been retyped, it reads as a live objection to what is
  // there now.
  const handleChangeRate = useCallback((value: string | null) => {
    setRate(value ?? "");
    setEditorError(null);
  }, []);

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
        // Inside the sheet, not on a `Toast`: the sheet is a modal, and a
        // toast on the page behind it is a refusal nobody sees.
        setEditorError(result.fieldErrors[0]?.message ?? t("fx.rateWriteFailed"));
        return;
      }
      setEditorError(null);
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
  /**
   * **The hint and the coverage card read one state, so they cannot
   * disagree.** With no currency besides the pivot there is nothing to quote
   * against: no table, no coverage row, and the hint on the ground is the one
   * true sentence about it. Both are gated on this value rather than on two
   * conditions of their own — `shownCoverage.length === 0` was the second
   * condition, and two conditions that happen to agree today are two
   * conditions that can drift.
   *
   * They agree by construction, not by luck: `readCoverage` returns exactly
   * one row per non-pivot, non-archived currency (`read-rate.ts`) and
   * `listCurrencySettings()` excludes archived by default, so `shownCoverage`
   * is empty when and only when there is no quote currency.
   */
  const noQuoteCurrency = quoteOptions.length === 0;

  const editorPair = quote !== null && pivot !== undefined ? { quote, base: pivot.code } : null;

  const tablePair: RateTablePair | null =
    quote === null || pivot === undefined || range === null
      ? null
      : {
          base: pivot.code,
          quote,
          from: range.from,
          to: range.to,
          rows,
          onSelectRow: handleSelectRow,
        };

  const header = (
    <View style={styles.headerBlock}>
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
      {/*
        Stacked on a phone, paired at desk width. Each `DateField` brings its
        own Today/Yesterday/weekday chip row, and two of those side by side is
        what ran off a 390 px screen.
      */}
      <View style={[styles.rangeRow, breakpoint === "desk" ? styles.rangeRowDesk : null]}>
        <View style={breakpoint === "desk" ? styles.rangeCell : null}>
          <DateField
            label={t("fx.rangeFrom")}
            value={custom.from}
            onChange={handleChangeCustomFrom}
            today={today}
          />
        </View>
        <View style={breakpoint === "desk" ? styles.rangeCell : null}>
          <DateField
            label={t("fx.rangeTo")}
            value={custom.to}
            onChange={handleChangeCustomTo}
            today={today}
          />
        </View>
      </View>

      {/*
        S18 §3 — with no quote currency there is no table, and the hint saying
        so is a hint: it renders beside the controls it is about. The other two
        tableless states — a ledger with no pivot, a custom range that does not
        parse — draw no hint, because there *is* a currency to compare against
        and this sentence would be false of them.
      */}
      {noQuoteCurrency ? <Text style={styles.empty}>{t("fx.noQuoteCurrency")}</Text> : null}
    </View>
  );

  const footer = (
    <View style={styles.footerBlock}>
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

      <Text style={styles.rerateNote}>{t("fx.rerateNotOffered")}</Text>

      {/*
        The card is the group of per-currency coverage rows, so with no quote
        currency there are no rows and no group — a titled card holding
        nothing is chrome claiming a list exists (`design-system/05` §5.1).
        The hint above already says why there is nothing here; repeating it
        under a *Coverage* heading would state the same absence twice. Same
        `noQuoteCurrency` the hint reads, so the two can never disagree about
        which state this screen is in.
      */}
      {noQuoteCurrency ? null : (
        <Card title={t("fx.coverageTitle")}>
          {shownCoverage.map((row) => (
            <View key={row.code} style={styles.coverageRow}>
              <Text style={styles.coverageCode}>{row.code}</Text>
              <CoverageStatus
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
      )}
    </View>
  );

  return (
    <GroundPanel scroll="own">
      <RateTable pair={tablePair} header={header} footer={footer} />

      {/*
        The sheet's own header is the editor's heading — "Set PLN per USD,
        2026-08-08 … 2026-08-08" — which is why `RateEditor` no longer draws a
        title of its own.
      */}
      <BottomSheet
        visible={editorOpen && editorPair !== null}
        title={
          editorPair === null
            ? ""
            : t("fx.rateEditorTitle", {
                quote: editorPair.quote,
                base: editorPair.base,
                from: editorRange.from,
                to: editorRange.to,
              })
        }
        onDismiss={handleCloseEditor}
      >
        {editorPair === null ? null : (
          <RateEditor
            base={editorPair.base}
            quote={editorPair.quote}
            from={editorRange.from}
            to={editorRange.to}
            rate={rate}
            onRateChange={handleChangeRate}
            existingRows={editorRows}
            onSubmit={handleSubmitEditor}
            onCancel={handleCloseEditor}
            {...(editorError === null ? {} : { error: editorError })}
          />
        )}
      </BottomSheet>

      {toast === null ? null : (
        <Toast message={toast} onDismiss={handleDismissToast} token={toastTokenRef.current} />
      )}
    </GroundPanel>
  );
}

const useStyles = makeStyles((theme) => ({
  /** The gaps `GroundPanel`'s own scroll content used to carry, now that the list carries them. */
  headerBlock: { gap: space.x4, marginBottom: space.x4 },
  footerBlock: { gap: space.x4, marginTop: space.x4 },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  /** Phone: one column, so each field keeps its own chip row on its own line. */
  rangeRow: { gap: space.x3 },
  rangeRowDesk: { flexDirection: "row", gap: space.sm },
  rangeCell: { flex: 1 },
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
