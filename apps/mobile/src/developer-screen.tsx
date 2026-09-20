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
  const [confirming, setConfirming] = useState(false);

  const handleLoad = useCallback(() => {
    const outcome = loadDemo(
      {
        createAccount: ledger.createAccount,
        createCategory: ledger.createCategory,
        createTransaction: ledger.createTransaction,
        convertCategory: ledger.convertCategory,
        setManualRate: ledger.setManualRate,
        existingCategories: snapshot.categories,
      },
      todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone),
    );
    ledger.refresh();
    setWrote(
      t("developer.loaded", {
        transactions: outcome.transactions,
        accounts: outcome.accounts,
      }) + (outcome.refused > 0 ? t("developer.refused", { count: outcome.refused }) : ""),
    );
  }, [ledger, snapshot.categories, t]);

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

      <Button label={t("preview.loadDemo")} onPress={handleLoad} variant="primary" size="lg" />
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
