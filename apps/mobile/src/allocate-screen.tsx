/**
 * S36 · Allocate — J08's split, and the only screen that spends a pot down.
 *
 * **The pot is a balance, not a transaction.** You reach this screen from the
 * unsettled banner or a clearing account's row, and what it allocates is
 * whatever that account still holds — however many transfers built it up
 * (S36 §2). So the route carries an account id and nothing else.
 *
 * **Every figure is decided in `packages/client`.** `splitEvenly`,
 * `splitByWeight` and `splitSummary` own the arithmetic; this file owns who
 * is in the list and which mode is on. That division is what lets S36 §6's
 * rule — *the remainder is on screen the whole time, not computed after
 * commit* — be tested without mounting anything.
 *
 * **Typing an amount switches the mode to Custom and keeps the other rows
 * where they were** (§7). An edit is a statement about one row, never a
 * re-split of the others behind your back — so `custom` holds a draft string
 * per row and `even`/`shares` hold none at all.
 */

import {
  type SplitMode,
  splitByWeight,
  splitEvenly,
  splitSummary,
} from "@waltning/client/counterparties/split-shares";
import { deviceRuntime } from "@waltning/client/ledger/device-runtime";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import * as money from "@waltning/core/money";
import { type Money, toMoney } from "@waltning/core/money";
import { CategorySheet } from "@waltning/ui/categories/category-sheet";
import { CounterpartyPicker } from "@waltning/ui/counterparties/counterparty-picker";
import { ShareRow } from "@waltning/ui/counterparties/share-row";
import { Amount } from "@waltning/ui/fx/amount";
import { parseAmount } from "@waltning/ui/fx/amount-field";
import { decimalMark } from "@waltning/ui/i18n/locales";
import { useLocale, useT } from "@waltning/ui/i18n/provider";
import { Button } from "@waltning/ui/primitives/button";
import { type Segment, SegmentControl } from "@waltning/ui/primitives/segment-control";
import { Card } from "@waltning/ui/shell/card";
import { Banner } from "@waltning/ui/states/banner";
import { EmptyState } from "@waltning/ui/states/empty-state";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { space } from "@waltning/ui/tokens";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { PushedPage } from "./pushed-page";

/** One row of the split, as this screen holds it. `null` is your own share (J08 §4). */
type Row = {
  key: string;
  counterpartyId: string | null;
  weight: number;
  /** What was typed, in `custom` only — the computed split owns the figure otherwise. */
  draft: string;
};

const OWN_KEY = "own";

export default function Allocate() {
  const t = useT();
  const styles = useStyles();
  // The commit states the figure it will write, so the figure has to read
  // like one — `<Amount>` cannot render inside a label (§4.1's own note).
  const mark = decimalMark(useLocale());
  const ledger = useLedgerController();
  const snapshot = usePhoneLedger(ledger);
  const params = useLocalSearchParams<{ account?: string }>();
  const accountId = params.account ?? null;

  const [mode, setMode] = useState<SplitMode>("even");
  const [rows, setRows] = useState<readonly Row[]>([
    { key: OWN_KEY, counterpartyId: null, weight: 1, draft: "" },
  ]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  /**
   * What the write refused, as one line.
   *
   * Every refusal `allocate_shares` can produce is about the split as a
   * whole — the pot, its kind, its currency — so there is no field to hang
   * one on and a form-level banner is the honest shape.
   */
  const [refusal, setRefusal] = useState<string | undefined>(undefined);

  const account = snapshot.accounts.find((candidate) => candidate.id === accountId);
  const decimals = account?.decimals ?? 2;
  const pot = account?.balance ?? toMoney("0");

  /**
   * The figures, one place. `custom` reads what was typed and treats
   * anything unparseable as zero — the remainder below then states the gap,
   * which is the same sentence a validation message would be, on the line
   * that already exists for it (§6).
   */
  const amounts = useMemo((): readonly Money[] => {
    if (mode === "custom") {
      return rows.map((row) => toMoney(parseAmount(row.draft) ?? "0"));
    }
    if (mode === "shares") {
      return splitByWeight(
        pot,
        rows.map((row) => row.weight),
        decimals,
      );
    }
    return splitEvenly(pot, rows.length, decimals);
  }, [decimals, mode, pot, rows]);

  const summary = useMemo(() => splitSummary(pot, amounts, decimals), [amounts, decimals, pot]);

  const nameOf = useCallback(
    (counterpartyId: string | null) =>
      counterpartyId === null
        ? t("allocate.you")
        : (snapshot.counterparties.find((c) => c.id === counterpartyId)?.name ?? ""),
    [snapshot.counterparties, t],
  );

  const categoryName = snapshot.categories.find((c) => c.id === categoryId)?.name;

  const handleMode = useCallback((next: string) => {
    if (next === "even" || next === "shares" || next === "custom") setMode(next);
  }, []);

  /**
   * Editing one row is what makes the split custom — and the switch carries
   * every current figure into the drafts, so the rows a person did not touch
   * stay exactly where they were (§7).
   */
  const startEditing = useCallback(() => {
    if (mode === "custom") return;
    setRows((current) => current.map((row, index) => ({ ...row, draft: amounts[index] ?? "0" })));
    setMode("custom");
  }, [amounts, mode]);

  const changeAmount = useCallback((key: string, value: string) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, draft: value } : row)));
  }, []);

  const changeWeight = useCallback((key: string, weight: number) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, weight } : row)));
  }, []);

  const removeRow = useCallback((key: string) => {
    setRows((current) => current.filter((row) => row.key !== key));
  }, []);

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const dismissPicker = useCallback(() => setPickerOpen(false), []);
  const openCategory = useCallback(() => setCategorySheetOpen(true), []);
  const dismissCategory = useCallback(() => setCategorySheetOpen(false), []);

  const pickCounterparty = useCallback((id: string) => {
    setRows((current) =>
      current.some((row) => row.counterpartyId === id)
        ? current
        : [...current, { key: id, counterpartyId: id, weight: 1, draft: "" }],
    );
    setPickerOpen(false);
  }, []);

  const createCounterparty = useCallback(() => {
    setPickerOpen(false);
    router.push("/counterparty/new");
  }, []);

  const pickCategory = useCallback((id: string) => {
    setCategoryId(id);
    setCategorySheetOpen(false);
  }, []);

  const commit = useCallback(() => {
    if (account === undefined || categoryId === null) return;
    const result = ledger.allocateShares({
      accountId: account.id,
      date: deviceRuntime().capture().date,
      currency: account.currency,
      categoryId,
      note: "",
      shares: rows.map((row, index) => ({
        counterpartyId: row.counterpartyId,
        amount: amounts[index] ?? toMoney("0"),
      })),
    });
    if ("fieldErrors" in result) {
      setRefusal(result.fieldErrors[0]?.message ?? t("common.formIncomplete"));
      return;
    }
    setRefusal(undefined);
    router.back();
  }, [account, amounts, categoryId, ledger, rows, t]);

  if (account === undefined) {
    return (
      <PushedPage title={t("allocate.title")} subtitle={t("allocate.subtitle")}>
        <EmptyState
          variant="range"
          title={t("allocate.emptyTitle")}
          body={t("allocate.emptyBody")}
          primaryAction={{ label: t("common.back"), onPress: goBack }}
        />
      </PushedPage>
    );
  }

  const segments: readonly [Segment<SplitMode>, Segment<SplitMode>, Segment<SplitMode>] = [
    { value: "even", label: t("allocate.modeEven") },
    { value: "shares", label: t("allocate.modeShares") },
    { value: "custom", label: t("allocate.modeCustom") },
  ];

  return (
    <PushedPage title={t("allocate.title")} subtitle={t("allocate.subtitle")}>
      {/* The pot, and what it is — the figure every other figure is measured against. */}
      <View style={styles.pot}>
        <Text style={styles.potName}>{account.name}</Text>
        <Amount value={pot} currency={account.currency} decimals={decimals} size="medium" />
        <Text style={styles.potNote}>{t("allocate.toAllocate")}</Text>
      </View>

      <SegmentControl segments={segments} value={mode} onChange={handleMode} />

      <Card>
        <View style={styles.rows}>
          {rows.map((row, index) => (
            <ShareRow
              key={row.key}
              id={row.key}
              name={nameOf(row.counterpartyId)}
              isOwn={row.counterpartyId === null}
              categoryName={categoryName}
              onPressCategory={openCategory}
              amount={amounts[index] ?? toMoney("0")}
              currency={account.currency}
              decimals={decimals}
              draft={mode === "custom" ? row.draft : undefined}
              onAmountChange={changeAmount}
              onEdit={startEditing}
              weight={mode === "shares" ? row.weight : undefined}
              onWeightChange={changeWeight}
              onRemove={rows.length > 1 ? removeRow : undefined}
            />
          ))}
        </View>
      </Card>

      <View style={styles.addRow}>
        <Button label={t("allocate.addSomeone")} onPress={openPicker} variant="ghost" />
      </View>

      {/*
        §6 — the remainder is on screen throughout, not computed after commit.
        An allocation that does not sum is the commonest way a clearing
        balance quietly stops meaning anything, and it is silent unless the
        interface refuses to be.
      */}
      <Card>
        <View style={styles.remainder} testID="allocate-remainder">
          <Text style={styles.remainderLabel}>{t("allocate.leftToAllocate")}</Text>
          <Amount
            value={summary.remaining}
            currency={account.currency}
            decimals={decimals}
            size="small"
          />
        </View>
      </Card>

      {summary.over ? <Banner tone="warn" message={t("allocate.over")} /> : null}
      {refusal === undefined ? null : <Banner tone="negative" message={refusal} />}

      <Button
        label={t("allocate.commit", {
          amount: money.forDisplay(summary.allocated, decimals, mark),
          currency: account.currency,
        })}
        onPress={commit}
        variant="primary"
        size="lg"
        disabled={summary.over || categoryId === null}
      />

      <CategorySheet
        visible={categorySheetOpen}
        kind="expense"
        tree={snapshot.categoryTree}
        onPick={pickCategory}
        onDismiss={dismissCategory}
      />
      <CounterpartyPicker
        visible={pickerOpen}
        counterparties={snapshot.counterparties}
        onPick={pickCounterparty}
        onCreateNew={createCounterparty}
        onDismiss={dismissPicker}
      />
    </PushedPage>
  );
}

/** The empty state's only exit: back to wherever the pot was opened from. */
function goBack() {
  router.back();
}

const useStyles = makeStyles((theme) => ({
  pot: { gap: space.xxs },
  potName: { color: theme.textMuted, ...text.ui("label") },
  potNote: { color: theme.textMuted, ...text.ui("caption") },
  rows: { gap: space.md },
  addRow: { alignItems: "flex-end" },
  remainder: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  remainderLabel: { color: theme.textMuted, ...text.ui("body") },
}));
