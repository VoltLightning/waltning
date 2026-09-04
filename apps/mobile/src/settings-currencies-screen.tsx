/**
 * S17 · Settings · Currencies — `screens/S17`.
 *
 * Row per currency: code, name, symbol, rate source, pinned toggle,
 * coverage, archive. Pivot shown read-only at the bottom, its one write
 * (`change_pivot`) behind `ConfirmDialog` — E3's executor refuses it once
 * any transaction exists.
 *
 * **The pivot's own refusal is stated after a failed attempt, not before.**
 * §17's own text says the dialog states the refusal "before offering" —
 * that needs a read this PR has no reader for (whether any transaction
 * exists at all), so this confirms unconditionally and surfaces
 * `change_pivot`'s own refusal on a `Toast` if the executor throws. Named
 * here as the one place this screen is narrower than the spec's own words.
 *
 * **No backfill progress.** S17 §2's own text: "No backfill progress on the
 * phone (nothing to fetch)" — `add_currency` here writes the row alone;
 * `sync_fx_rates` is server-side (`wave-4-shared.md`'s own excluded list).
 */

import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
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
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";

type CurrencyRowData = {
  code: string;
  name: string;
  pinned: boolean;
  rateSource: string | null;
  version: number;
};

type CurrencyRowCoverage = { pct: number; lastDate?: string };

type CurrencyRowProps = {
  row: CurrencyRowData;
  coverage: CurrencyRowCoverage | undefined;
  onTogglePinned: (code: string, version: number, next: boolean) => void;
  onChangeSource: (code: string, version: number, source: string) => void;
  onArchive: (code: string, version: number) => void;
};

function CurrencyRow({
  row,
  coverage,
  onTogglePinned,
  onChangeSource,
  onArchive,
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

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.code}>{row.code}</Text>
        <Text style={styles.name}>{row.name}</Text>
        {coverage ? <CoverageTag pct={coverage.pct} lastDate={coverage.lastDate} /> : null}
      </View>
      <Toggle label={t("fx.pinned")} value={row.pinned} onChange={handleToggle} />
      <Select
        label={t("fx.rateSource")}
        placeholder={t("fx.rateSourceNone")}
        options={rateSources}
        value={row.rateSource}
        onChange={handleSource}
      />
      <Button
        label={t("fx.archiveCurrency")}
        onPress={handleArchive}
        variant="secondary"
        size="sm"
      />
    </View>
  );
}

type Draft = { code: string; name: string; symbol: string };

const EMPTY_DRAFT: Draft = { code: "", name: "", symbol: "" };

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
          { pct: row.coveragePct, ...(row.days > 0 ? { lastDate: row.lastDate } : {}) },
        ]),
      ),
    [coverage],
  );

  const [toast, setToast] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [pivotConfirmOpen, setPivotConfirmOpen] = useState(false);

  const handleDismissToast = useCallback(() => setToast(null), []);

  const pivotRow = rows.find((row) => row.isPivot);
  const otherRows = rows.filter((row) => !row.isPivot);

  const handleTogglePinned = useCallback(
    (code: string, version: number, next: boolean) => {
      const result = ledger.setPinned({ code, version, pinned: next });
      if ("fieldErrors" in result) {
        setToast(result.fieldErrors[0]?.message ?? t("fx.currencyWriteFailed"));
      }
    },
    [ledger, t],
  );

  const handleChangeSource = useCallback(
    (code: string, version: number, source: string) => {
      const result = ledger.setRateSource({ code, version, rateSource: source });
      if ("fieldErrors" in result) {
        setToast(result.fieldErrors[0]?.message ?? t("fx.currencyWriteFailed"));
      }
    },
    [ledger, t],
  );

  const handleArchive = useCallback(
    (code: string, version: number) => {
      const result = ledger.archiveCurrency({ code, version });
      if ("fieldErrors" in result) {
        setToast(result.fieldErrors[0]?.message ?? t("fx.currencyArchiveRefused"));
      }
    },
    [ledger, t],
  );

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
      setToast(result.fieldErrors[0]?.message ?? t("fx.currencyWriteFailed"));
      return;
    }
    handleCloseAdd();
  }, [ledger, draft, handleCloseAdd, t]);

  const handleOpenPivotConfirm = useCallback(() => setPivotConfirmOpen(true), []);
  const handleCancelPivotConfirm = useCallback(() => setPivotConfirmOpen(false), []);
  const handleConfirmPivotChange = useCallback(() => {
    setPivotConfirmOpen(false);
    if (!pivotRow) return;
    const result = ledger.changePivot({ code: pivotRow.code });
    if ("fieldErrors" in result) {
      setToast(result.fieldErrors[0]?.message ?? t("fx.pivotChangeRefused"));
    }
  }, [ledger, pivotRow, t]);

  const addAction = (
    <Button label={t("fx.addCurrency")} onPress={handleOpenAdd} variant="secondary" size="sm" />
  );

  return (
    <GroundPanel>
      <Card title={t("routes.currencies")} action={addAction}>
        {otherRows.map((row) => (
          <CurrencyRow
            key={row.code}
            row={row}
            coverage={coverageByCode.get(row.code)}
            onTogglePinned={handleTogglePinned}
            onChangeSource={handleChangeSource}
            onArchive={handleArchive}
          />
        ))}

        {pivotRow ? (
          <View style={styles.pivotRow}>
            <Text style={styles.pivotLabel}>{t("fx.pivotLabel", { code: pivotRow.code })}</Text>
            <Button
              label={t("fx.changePivot")}
              onPress={handleOpenPivotConfirm}
              variant="ghost"
              size="sm"
            />
          </View>
        ) : null}
      </Card>

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
        <Button label={t("common.save")} onPress={handleSaveDraft} />
      </BottomSheet>

      <ConfirmDialog
        visible={pivotConfirmOpen}
        title={t("fx.pivotConfirmTitle")}
        body={t("fx.pivotConfirmBody")}
        confirmLabel={t("fx.pivotConfirmSubmit")}
        onConfirm={handleConfirmPivotChange}
        onCancel={handleCancelPivotConfirm}
      />

      {toast === null ? null : <Toast message={toast} onDismiss={handleDismissToast} />}
    </GroundPanel>
  );
}

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
  pivotRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space.x2,
  },
  pivotLabel: { color: theme.textMuted, ...text.ui("bodySm") },
}));
