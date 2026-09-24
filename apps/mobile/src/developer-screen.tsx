/**
 * Settings · Developer — the two controls that make a build you can look at.
 *
 * **Its own screen, and gated at the row that opens it.** These lived in the
 * appearance sheet, which is a place to choose a theme: a control that fills
 * or empties a ledger has no business sharing a sheet with light and dark. The
 * row in `settings-screen.tsx` appears only when `PREVIEW_RESET_ENABLED`, so
 * in a production build there is no door, and this screen is unreachable
 * rather than merely empty.
 *
 * **Load is one press; reset asks twice.** Filling a ledger is additive and
 * undone by the button below it. Emptying one closes the store and deletes
 * both files, which nothing undoes — so it is the only one that confirms, and
 * it is the only one drawn in the danger colour.
 *
 * **Load reports what it wrote.** A run that was partly refused has to say so
 * rather than present as a smaller dataset, and the count is the only evidence
 * on screen that a press did anything at all.
 */

import { loadDemo } from "@waltning/client/ledger/demo/load-demo";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { todayIn } from "@waltning/core/date";
import { useT } from "@waltning/ui/i18n/provider";
import { Button } from "@waltning/ui/primitives/button";
import { Banner } from "@waltning/ui/states/banner";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { radius, space } from "@waltning/ui/tokens";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { PushedPage } from "./pushed-page";

export default function Developer() {
  const t = useT();
  const styles = useStyles();
  const ledger = useLedgerController();
  const snapshot = usePhoneLedger(ledger);
  const [wrote, setWrote] = useState<string | null>(null);
  /** History rows written so far, of how many — `null` when no load is running. */
  const [progress, setProgress] = useState<{ written: number; of: number } | null>(null);
  const [confirming, setConfirming] = useState(false);

  /**
   * **Async, and the screen stays live while it runs.** The loader writes the
   * history in chunks and yields between them, so this can say how far it has
   * got — and a device that shows progress is one nobody reloads halfway,
   * which is what used to leave the Counterparties tab empty.
   */
  const handleLoad = useCallback(async () => {
    setWrote(null);
    setProgress({ written: 0, of: 0 });
    const outcome = await loadDemo(
      {
        createAccount: ledger.createAccount,
        createCategory: ledger.createCategory,
        createTransaction: ledger.createTransaction,
        convertCategory: ledger.convertCategory,
        createCounterparty: ledger.createCounterparty,
        settleDebt: ledger.settleDebt,
        setManualRate: ledger.setManualRate,
        // **The whole tree, groups included.** `snapshot.categories` is
        // capturable leaves only, so the loader could not see that *Food*,
        // *Home*, *Transport* and *Subscriptions* already exist — it tried
        // to create all four and the ledger refused them, which is what a
        // device looked like the day the taxonomy started shipping.
        existingCategories: snapshot.categoryTree,
        // The device's own pivot, not the plan's guess at one: every rate is
        // quoted against it and `set_manual_rate` refuses any other base.
        pivot: snapshot.currencies.find((currency) => currency.isPivot)?.code ?? "",
        batch: ledger.batch,
      },
      todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone),
      undefined,
      (written, of) => setProgress({ written, of }),
    );
    setProgress(null);
    ledger.refresh();
    setWrote(
      t("developer.loaded", {
        transactions: outcome.transactions,
        accounts: outcome.accounts,
        people: outcome.counterparties,
      }) + (outcome.refused > 0 ? t("developer.refused", { count: outcome.refused }) : ""),
    );
  }, [ledger, snapshot.categoryTree, snapshot.currencies, t]);

  const askReset = useCallback(() => setConfirming(true), []);
  const cancelReset = useCallback(() => setConfirming(false), []);
  const handleReset = useCallback(() => {
    ledger.reset();
    setWrote(null);
    setConfirming(false);
  }, [ledger]);

  return (
    <PushedPage title={t("routes.developer")} subtitle={t("developer.subtitle")}>
      <Text style={styles.lede}>{t("developer.lede")}</Text>

      <Button
        label={t("preview.loadDemo")}
        onPress={handleLoad}
        variant="primary"
        size="lg"
        loading={progress !== null}
        disabled={progress !== null}
      />
      {progress === null || progress.of === 0 ? null : (
        <Text style={styles.lede}>
          {t("developer.loading", { written: progress.written, of: progress.of })}
        </Text>
      )}
      {wrote === null ? null : <Banner tone="neutral" message={wrote} />}

      <View style={styles.danger}>
        <Text style={styles.dangerTitle}>{t("preview.resetTitle")}</Text>
        <Text style={styles.dangerBody}>{t("preview.resetPrompt")}</Text>
        {confirming ? (
          <>
            <Button label={t("common.cancel")} onPress={cancelReset} variant="ghost" size="lg" />
            <Button
              label={t("preview.resetTitle")}
              onPress={handleReset}
              variant="danger"
              size="lg"
            />
          </>
        ) : (
          <Button label={t("preview.resetAction")} onPress={askReset} variant="danger" size="lg" />
        )}
      </View>
    </PushedPage>
  );
}

const useStyles = makeStyles((theme) => ({
  lede: { color: theme.textMuted, ...text.ui("body") },
  /** The destructive half, set apart — an inset block, not a card. */
  danger: {
    backgroundColor: theme.insetFill,
    borderRadius: radius.md,
    padding: space.x3,
    gap: space.md,
  },
  dangerTitle: { color: theme.text, ...text.ui("label", 600) },
  dangerBody: { color: theme.textMuted, ...text.ui("caption", 400) },
}));
