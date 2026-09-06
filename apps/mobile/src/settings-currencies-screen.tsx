/**
 * S17 · Settings · Currencies — `screens/S17`.
 *
 * **A list, not six open editors.** Each currency is one compact row — code,
 * name, symbol · decimals, its coverage, and *Pinned* when it is — and
 * tapping the row expands that one row's controls in place: the pinned
 * toggle, the rate source, and the row's own actions. Every row carrying its
 * whole editor open was some 200 px each, which made a six-currency screen
 * three screens tall and unscannable; one open at a time is what a list of
 * six things is for. Symbol and decimals stay behind their own detail sheet
 * (S17 §9.2, `update_currency`) — §9.2's "editable, but not prominent".
 *
 * **The card is the rows, and nothing else.** The list of rows is the one
 * grouped-rows card; *Add currency*, the pivot block and the screen's own
 * title sit on the ground (`design-system/05` §5.1). The card carries no
 * title of its own — the navigation header already says *Currencies*, and
 * saying it twice, 40 px apart, is chrome.
 *
 * Pivot shown read-only at the bottom, its one write (`change_pivot`) behind
 * `ConfirmDialog` — E3's executor refuses it once any transaction exists, and
 * the dialog now says so before offering (S17 §7).
 *
 * **No backfill progress.** S17 §2's own text: "No backfill progress on the
 * phone (nothing to fetch)" — `add_currency` here writes the row alone;
 * `sync_fx_rates` is server-side (`wave-4-shared.md`'s own excluded list).
 *
 * **A 0% row is not "0%".** `CoverageStatus` states `fx.noRatesYet` instead,
 * as a muted caption rather than a pill — and *Exchange rates*, in the row's
 * expanded actions, is where that sentence becomes a place: S18 with the pair
 * preselected (`?quote=<code>`). It sits with the other actions rather than
 * on the coverage line itself, because the row is now the tap target and a
 * pressable inside a pressable is one gesture with two meanings.
 */

import type { CurrencyPatch } from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import type { FieldError } from "@waltning/client/transport/field-errors";
import { CoverageStatus, resolveCoverageStatus } from "@waltning/ui/fx/coverage-status";
import { useT } from "@waltning/ui/i18n/provider";
import { Button } from "@waltning/ui/primitives/button";
import { Select, type SelectOption } from "@waltning/ui/primitives/select";
import { Tag } from "@waltning/ui/primitives/tag";
import { TextField } from "@waltning/ui/primitives/text-field";
import { Toggle } from "@waltning/ui/primitives/toggle";
import { BottomSheet } from "@waltning/ui/shell/bottom-sheet";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { ConfirmDialog } from "@waltning/ui/shell/confirm-dialog";
import { Toast } from "@waltning/ui/states/toast";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { space, touchTarget } from "@waltning/ui/tokens";
import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

type CurrencyRowData = {
  code: string;
  name: string;
  symbol: string;
  symbolPosition: string;
  decimals: number;
  pinned: boolean;
  rateSource: string | null;
  version: number;
};

type CurrencyRowCoverage = {
  days: number;
  realDays: number;
  calendarDays: number;
  futureRows: number;
  pct: number;
  lastDate?: string;
};

type CurrencyRowProps = {
  row: CurrencyRowData;
  coverage: CurrencyRowCoverage | undefined;
  /** One row is open at a time — the screen owns which, so opening one closes the last. */
  expanded: boolean;
  onToggleExpanded: (code: string) => void;
  onTogglePinned: (code: string, version: number, next: boolean) => void;
  onChangeSource: (code: string, version: number, source: string) => void;
  onArchive: (code: string, version: number) => void;
  onEdit: (row: CurrencyRowData) => void;
  onViewRates: (code: string) => void;
};

function CurrencyRow({
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
    row.pinned ? t("fx.pinned") : null,
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
        style={styles.rowHeader}
      >
        <View style={styles.rowHeaderLine}>
          <Text style={styles.code}>{row.code}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {row.name}
          </Text>
          <Text style={styles.detail}>{detail}</Text>
        </View>
        <View style={styles.rowStatusLine}>
          {coverage ? (
            <CoverageStatus
              days={coverage.days}
              realDays={coverage.realDays}
              calendarDays={coverage.calendarDays}
              futureRows={coverage.futureRows}
              pct={coverage.pct}
              lastDate={coverage.lastDate}
            />
          ) : null}
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

/**
 * `change_pivot`'s two refusals (C1), resolved through `useT()` —
 * `packages/client` cannot call it itself. Same shape `account-editor-
 * screen.tsx` uses for `update_account`'s own refusals.
 */
function resolvePivotErrorMessage(t: ReturnType<typeof useT>, error: FieldError): string {
  if (error.messageKey === "fx.pivotAlreadyPivot") return t("fx.pivotAlreadyPivot");
  if (error.messageKey === "fx.pivotChangeRefused") return t("fx.pivotChangeRefused");
  return error.message;
}

type Draft = { code: string; name: string; symbol: string };

const EMPTY_DRAFT: Draft = { code: "", name: "", symbol: "" };

type EditDraft = {
  code: string;
  version: number;
  symbol: string;
  symbolPosition: "P" | "S";
  decimals: number;
};

export default function SettingsCurrenciesScreen() {
  const t = useT();
  const styles = useStyles();
  const ledger = useLedgerController();
  usePhoneLedger(ledger);

  const today = deviceRuntime().capture().date;
  const rows = ledger.listCurrencySettings();
  const coverage = ledger.readCoverage(today);
  const coverageByCode = useMemo(
    () =>
      new Map<string, CurrencyRowCoverage>(
        coverage.map((row) => [
          row.code,
          {
            days: row.days,
            realDays: row.realDays,
            calendarDays: row.calendarDays,
            futureRows: row.futureRows,
            pct: row.coveragePct,
            ...(row.lastDate !== null ? { lastDate: row.lastDate } : {}),
          },
        ]),
      ),
    [coverage],
  );

  const [toast, setToast] = useState<string | null>(null);
  // The toast's own re-arm token (`useTimer`/`useToastMotion`'s `resetKey`,
  // H1) — two shows can repeat an identical message (the same validation
  // error twice), and the ref is bumped synchronously before the state
  // setter that triggers the re-render, so the new value is already
  // current by the time it's read.
  const toastTokenRef = useRef(0);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [pivotConfirmOpen, setPivotConfirmOpen] = useState(false);
  const [pivotTargetCode, setPivotTargetCode] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  // One row open at a time — held here rather than per row, which is what
  // makes opening one close the last.
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  const symbolPositionOptions: SelectOption[] = useMemo(
    () => [
      { value: "P", label: t("fx.symbolBefore") },
      { value: "S", label: t("fx.symbolAfter") },
    ],
    [t],
  );

  const handleDismissToast = useCallback(() => setToast(null), []);
  const handleToggleExpanded = useCallback(
    (code: string) => setExpandedCode((prev) => (prev === code ? null : code)),
    [],
  );

  const pivotRow = rows.find((row) => row.isPivot);
  const otherRows = rows.filter((row) => !row.isPivot);

  // C1 — `otherRows` is already non-pivot, non-archived (`listCurrencySettings`'s
  // own default). Defaults to the first candidate so the flow works with one
  // tap when there is only one, and stays a real choice past that.
  const pivotTargetOptions: SelectOption[] = useMemo(
    () => otherRows.map((row) => ({ value: row.code, label: row.code })),
    [otherRows],
  );
  const selectedPivotTarget = pivotTargetCode ?? otherRows[0]?.code ?? null;

  const handleTogglePinned = useCallback(
    (code: string, version: number, next: boolean) => {
      const result = ledger.setPinned({ code, version, pinned: next });
      if ("fieldErrors" in result) {
        toastTokenRef.current += 1;
        setToast(result.fieldErrors[0]?.message ?? t("fx.currencyWriteFailed"));
      }
    },
    [ledger, t],
  );

  const handleChangeSource = useCallback(
    (code: string, version: number, source: string) => {
      const result = ledger.setRateSource({ code, version, rateSource: source });
      if ("fieldErrors" in result) {
        toastTokenRef.current += 1;
        setToast(result.fieldErrors[0]?.message ?? t("fx.currencyWriteFailed"));
      }
    },
    [ledger, t],
  );

  const handleArchive = useCallback(
    (code: string, version: number) => {
      const result = ledger.archiveCurrency({ code, version });
      if ("fieldErrors" in result) {
        toastTokenRef.current += 1;
        setToast(result.fieldErrors[0]?.message ?? t("fx.currencyArchiveRefused"));
      }
    },
    [ledger, t],
  );

  const handleViewRates = useCallback((code: string) => {
    router.push({ pathname: "/settings/rates", params: { quote: code } });
  }, []);

  const handleOpenAdd = useCallback(() => setAddOpen(true), []);
  const handleCloseAdd = useCallback(() => {
    setAddOpen(false);
    setDraft(EMPTY_DRAFT);
  }, []);
  const handleChangeCode = useCallback(
    (value: string) => setDraft((prev) => ({ ...prev, code: value.toUpperCase() })),
    [],
  );
  const handleChangeName = useCallback(
    (value: string) => setDraft((prev) => ({ ...prev, name: value })),
    [],
  );
  const handleChangeSymbol = useCallback(
    (value: string) => setDraft((prev) => ({ ...prev, symbol: value })),
    [],
  );
  const handleSaveDraft = useCallback(() => {
    const result = ledger.addCurrency({ code: draft.code, name: draft.name, symbol: draft.symbol });
    if ("fieldErrors" in result) {
      toastTokenRef.current += 1;
      setToast(result.fieldErrors[0]?.message ?? t("fx.currencyWriteFailed"));
      return;
    }
    handleCloseAdd();
  }, [ledger, draft, handleCloseAdd, t]);

  const handleOpenEdit = useCallback((row: CurrencyRowData) => {
    setEditDraft({
      code: row.code,
      version: row.version,
      symbol: row.symbol,
      symbolPosition: row.symbolPosition === "S" ? "S" : "P",
      decimals: row.decimals,
    });
  }, []);
  const handleCloseEdit = useCallback(() => setEditDraft(null), []);
  const handleChangeEditSymbol = useCallback(
    (value: string) => setEditDraft((prev) => (prev ? { ...prev, symbol: value } : prev)),
    [],
  );
  const handleChangeEditPosition = useCallback(
    (value: string) =>
      setEditDraft((prev) =>
        prev ? { ...prev, symbolPosition: value === "S" ? "S" : "P" } : prev,
      ),
    [],
  );
  const handleChangeEditDecimals = useCallback(
    (value: string) => setEditDraft((prev) => (prev ? { ...prev, decimals: Number(value) } : prev)),
    [],
  );
  const handleSaveEdit = useCallback(() => {
    if (!editDraft) return;
    const original = rows.find((row) => row.code === editDraft.code);
    if (!original) return;
    const patch: CurrencyPatch = {
      ...(editDraft.symbol !== original.symbol ? { symbol: editDraft.symbol } : {}),
      ...(editDraft.symbolPosition !== original.symbolPosition
        ? { symbolPosition: editDraft.symbolPosition }
        : {}),
      ...(editDraft.decimals !== original.decimals ? { decimals: editDraft.decimals } : {}),
    };
    if (Object.keys(patch).length === 0) {
      handleCloseEdit();
      return;
    }
    const result = ledger.updateCurrency({
      code: editDraft.code,
      version: editDraft.version,
      patch,
    });
    if ("fieldErrors" in result) {
      toastTokenRef.current += 1;
      setToast(result.fieldErrors[0]?.message ?? t("fx.currencyWriteFailed"));
      return;
    }
    handleCloseEdit();
  }, [ledger, editDraft, rows, handleCloseEdit, t]);

  const handleChangePivotTarget = useCallback((value: string) => setPivotTargetCode(value), []);
  const handleOpenPivotConfirm = useCallback(() => setPivotConfirmOpen(true), []);
  const handleCancelPivotConfirm = useCallback(() => setPivotConfirmOpen(false), []);
  const handleConfirmPivotChange = useCallback(() => {
    setPivotConfirmOpen(false);
    if (!selectedPivotTarget) return;
    // C1 — the *target*, non-pivot currency, never `pivotRow.code` (the
    // current pivot): the executor refuses that as "already the pivot".
    const result = ledger.changePivot({ code: selectedPivotTarget });
    if ("fieldErrors" in result) {
      const [fieldError] = result.fieldErrors;
      toastTokenRef.current += 1;
      setToast(fieldError ? resolvePivotErrorMessage(t, fieldError) : t("fx.pivotChangeRefused"));
      return;
    }
    // M2 — §7.0's *"dropped rather than left mis-quoted"*, said out loud. The
    // rewrite silently loses every date it cannot re-derive against the new
    // pivot, and a run that kept one date in twenty-eight used to look
    // exactly like one that kept them all. Not an error — the operation
    // succeeded — so a toast, not a field error.
    if (result.droppedDates > 0) {
      toastTokenRef.current += 1;
      setToast(t("fx.pivotChangeDroppedDates", { count: result.droppedDates }));
    }
    // M7 — the chosen target just became the pivot: clearing it here is what
    // lets `selectedPivotTarget` fall back to `otherRows[0]` on the next
    // render, rather than resending a code the executor now refuses as
    // "already the pivot".
    setPivotTargetCode(null);
  }, [ledger, selectedPivotTarget, t]);

  return (
    <GroundPanel>
      {/*
        The card is the group of currency rows, so with no rows there is no
        group — and a card holding nothing is chrome claiming a list exists.
        Only the pivot is set up in that state; *Add currency* is the one
        thing to do about it, and it is a button, so it sits on the ground
        either way (`design-system/05` §5.1) — as does the screen's own name,
        which the navigation header already carries.
      */}
      {otherRows.length > 0 ? (
        <Card>
          {otherRows.map((row) => (
            <CurrencyRow
              key={row.code}
              row={row}
              coverage={coverageByCode.get(row.code)}
              expanded={expandedCode === row.code}
              onToggleExpanded={handleToggleExpanded}
              onTogglePinned={handleTogglePinned}
              onChangeSource={handleChangeSource}
              onArchive={handleArchive}
              onEdit={handleOpenEdit}
              onViewRates={handleViewRates}
            />
          ))}
        </Card>
      ) : null}

      <Button label={t("fx.addCurrency")} onPress={handleOpenAdd} variant="secondary" size="sm" />

      {pivotRow ? (
        <View style={styles.pivotRow}>
          <Text style={styles.pivotLabel}>{t("fx.pivotLabel", { code: pivotRow.code })}</Text>
          {otherRows.length > 0 ? (
            <Select
              label={t("fx.pivotTarget")}
              placeholder={t("fx.pivotTargetPlaceholder")}
              options={pivotTargetOptions}
              value={selectedPivotTarget}
              onChange={handleChangePivotTarget}
            />
          ) : null}
          <Button
            label={t("fx.changePivot")}
            onPress={handleOpenPivotConfirm}
            variant="ghost"
            size="sm"
            disabled={selectedPivotTarget === null}
          />
        </View>
      ) : null}

      <BottomSheet visible={addOpen} title={t("fx.addCurrency")} onDismiss={handleCloseAdd}>
        <TextField
          label={t("fx.currencyCode")}
          value={draft.code}
          onChangeText={handleChangeCode}
          maxLength={3}
        />
        <TextField label={t("common.name")} value={draft.name} onChangeText={handleChangeName} />
        <TextField
          label={t("fx.currencySymbol")}
          value={draft.symbol}
          onChangeText={handleChangeSymbol}
        />
        <Button label={t("common.save")} onPress={handleSaveDraft} variant="primary" />
      </BottomSheet>

      <BottomSheet
        visible={editDraft !== null}
        title={editDraft ? t("fx.editCurrency", { code: editDraft.code }) : ""}
        onDismiss={handleCloseEdit}
      >
        {editDraft ? (
          <>
            <TextField
              label={t("fx.currencySymbol")}
              value={editDraft.symbol}
              onChangeText={handleChangeEditSymbol}
            />
            {/* `placeholder` is required by `Select`, and unreachable here — this
                field always seeds a value from the row being edited (`handleOpenEdit`),
                never opens on "nothing chosen". */}
            <Select
              label={t("fx.symbolPosition")}
              placeholder=""
              options={symbolPositionOptions}
              value={editDraft.symbolPosition}
              onChange={handleChangeEditPosition}
            />
            <Select
              label={t("fx.decimals")}
              placeholder=""
              options={DECIMALS_OPTIONS}
              value={String(editDraft.decimals)}
              onChange={handleChangeEditDecimals}
            />
            <Button label={t("common.save")} onPress={handleSaveEdit} variant="primary" />
          </>
        ) : null}
      </BottomSheet>

      <ConfirmDialog
        visible={pivotConfirmOpen}
        title={t("fx.pivotConfirmTitle")}
        body={t("fx.pivotConfirmBody")}
        confirmLabel={t("fx.pivotConfirmSubmit")}
        onConfirm={handleConfirmPivotChange}
        onCancel={handleCancelPivotConfirm}
      />

      {toast === null ? null : (
        <Toast message={toast} onDismiss={handleDismissToast} token={toastTokenRef.current} />
      )}
    </GroundPanel>
  );
}

const DECIMALS_OPTIONS: SelectOption[] = Array.from({ length: 9 }, (_, decimals) => ({
  value: String(decimals),
  label: String(decimals),
}));

const useStyles = makeStyles((theme) => ({
  row: {
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  /** §10's 44 pt floor — the whole header is the disclosure target. */
  rowHeader: { gap: space.xs, paddingVertical: space.x2, minHeight: touchTarget.min },
  rowHeaderLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rowStatusLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  rowDetail: { gap: space.sm, paddingBottom: space.x2 },
  code: { color: theme.text, ...text.ui("body", 600) },
  name: { color: theme.textMuted, ...text.ui("bodySm"), flex: 1 },
  detail: { color: theme.textMuted, ...text.ui("caption") },
  rowActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pivotRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space.x2,
  },
  pivotLabel: { color: theme.textMuted, ...text.ui("bodySm") },
}));
