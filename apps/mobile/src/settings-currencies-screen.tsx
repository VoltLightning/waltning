/**
 * S17 · Settings · Currencies — `screens/S17`.
 *
 * Row per currency: code, name, symbol, decimals, rate source, pinned
 * toggle, coverage, archive — symbol and decimals editable behind the row's
 * own detail sheet (S17 §9.2, `update_currency`). Pivot shown read-only at
 * the bottom, its one write (`change_pivot`) behind `ConfirmDialog` — E3's
 * executor refuses it once any transaction exists, and the dialog now says
 * so before offering (S17 §7).
 *
 * **No backfill progress.** S17 §2's own text: "No backfill progress on the
 * phone (nothing to fetch)" — `add_currency` here writes the row alone;
 * `sync_fx_rates` is server-side (`wave-4-shared.md`'s own excluded list).
 *
 * **A 0% row is not "0%".** `CoverageTag` states `fx.noRatesYet` instead,
 * and this screen is the one place that wires its `onPress` — tapping opens
 * S18 with the pair preselected (`?quote=<code>`), because "set one by hand"
 * is a place, not just a sentence.
 */

import type { CurrencyPatch } from "@waltning/client/ledger/create-phone-ledger";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import type { FieldError } from "@waltning/client/transport/field-errors";
import { CoverageTag } from "@waltning/ui/fx/coverage-tag";
import { useT } from "@waltning/ui/i18n/provider";
import { Button } from "@waltning/ui/primitives/button";
import { Select, type SelectOption } from "@waltning/ui/primitives/select";
import { TextField } from "@waltning/ui/primitives/text-field";
import { Toggle } from "@waltning/ui/primitives/toggle";
import { BottomSheet } from "@waltning/ui/shell/bottom-sheet";
import { Card, GroundPanel } from "@waltning/ui/shell/card";
import { ConfirmDialog } from "@waltning/ui/shell/confirm-dialog";
import { Toast } from "@waltning/ui/states/toast";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { space } from "@waltning/ui/tokens";
import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";

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
  onTogglePinned: (code: string, version: number, next: boolean) => void;
  onChangeSource: (code: string, version: number, source: string) => void;
  onArchive: (code: string, version: number) => void;
  onEdit: (row: CurrencyRowData) => void;
  onViewRates: (code: string) => void;
};

function CurrencyRow({
  row,
  coverage,
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

  const handleToggle = useCallback(
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

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.code}>{row.code}</Text>
        <Text style={styles.name}>{row.name}</Text>
        <Text style={styles.detail}>
          {t("fx.currencyDetail", { symbol: row.symbol, decimals: row.decimals })}
        </Text>
        {coverage ? (
          <CoverageTag
            days={coverage.days}
            realDays={coverage.realDays}
            calendarDays={coverage.calendarDays}
            futureRows={coverage.futureRows}
            pct={coverage.pct}
            lastDate={coverage.lastDate}
            {...(coverage.days === 0 ? { onPress: handleViewRates } : {})}
          />
        ) : null}
      </View>
      <Toggle label={t("fx.pinned")} value={row.pinned} onChange={handleToggle} />
      <Select
        label={t("fx.rateSource")}
        placeholder={t("fx.rateSourceNone")}
        options={rateSources}
        value={row.rateSource}
        onChange={handleSource}
      />
      <View style={styles.rowActions}>
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

  const symbolPositionOptions: SelectOption[] = useMemo(
    () => [
      { value: "P", label: t("fx.symbolBefore") },
      { value: "S", label: t("fx.symbolAfter") },
    ],
    [t],
  );

  const handleDismissToast = useCallback(() => setToast(null), []);

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

  const addAction = (
    <Button label={t("fx.addCurrency")} onPress={handleOpenAdd} variant="secondary" size="sm" />
  );

  return (
    <GroundPanel>
      {/*
        The card is the group of currency rows, so with no rows there is no
        group — and a titled card holding nothing is chrome claiming a list
        exists. Only the pivot is set up in that state; *Add currency* is the
        one thing to do about it, and it is a button, so it sits on the
        ground (`design-system/05` §5.1).
      */}
      {otherRows.length > 0 ? (
        <Card title={t("routes.currencies")} action={addAction}>
          {otherRows.map((row) => (
            <CurrencyRow
              key={row.code}
              row={row}
              coverage={coverageByCode.get(row.code)}
              onTogglePinned={handleTogglePinned}
              onChangeSource={handleChangeSource}
              onArchive={handleArchive}
              onEdit={handleOpenEdit}
              onViewRates={handleViewRates}
            />
          ))}
        </Card>
      ) : (
        addAction
      )}

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
    gap: space.sm,
    paddingVertical: space.x2,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: space.sm },
  code: { color: theme.text, ...text.ui("body", 600) },
  name: { color: theme.textMuted, ...text.ui("bodySm"), flex: 1 },
  detail: { color: theme.textMuted, ...text.ui("caption") },
  rowActions: { flexDirection: "row", gap: space.sm },
  pivotRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space.x2,
  },
  pivotLabel: { color: theme.textMuted, ...text.ui("bodySm") },
}));
