/**
 * Settings · Restore — `architecture/14` §14.3's other half.
 *
 * **The screen that makes the export a backup.** Everything before this was a
 * file nobody had put back, which is the definition of a hypothesis. It is
 * reached on the worst day someone has with this app, so it does two things
 * carefully: it shows what is in the file *before* writing anything, and every
 * refusal is a sentence rather than a code.
 *
 * **It fills an empty ledger and says so up front.** A restore cannot merge —
 * two ledgers that both believe they are the ledger have no reconciliation
 * without a writer of record (`§14.0`) — so the lede says it before the file
 * dialog rather than after the refusal.
 */

import { useLedgerRestore } from "@waltning/client/backup/use-ledger-restore";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { accountingDate } from "@waltning/core/date";
import { RestoreCard } from "@waltning/ui/backup/restore-card";
import { dayLabel } from "@waltning/ui/i18n/locales";
import { useLocale, useT } from "@waltning/ui/i18n/provider";
import { Button } from "@waltning/ui/primitives/button";
import { TextField } from "@waltning/ui/primitives/text-field";
import { GroundPanel } from "@waltning/ui/shell/card";
import { ErrorState } from "@waltning/ui/states/error-state";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { useCallback, useState } from "react";
import { Text } from "react-native";
import { mobileDiagnostics } from "./diagnostics.ts";
import { backupPort } from "./platform";
import { PushedHeader } from "./pushed-page";

export default function Restore() {
  const t = useT();
  const locale = useLocale();
  const styles = useStyles();
  const ledger = useLedgerController();
  const restore = useLedgerRestore(ledger, backupPort, mobileDiagnostics);
  const [key, setKey] = useState("");

  const handleOpen = useCallback(() => restore.open(key), [restore, key]);
  const handleDismiss = useCallback(() => {
    setKey("");
    restore.dismiss();
  }, [restore]);

  const { state } = restore;

  if (state.kind === "ready") {
    return (
      <>
        <PushedHeader title={t("restore.title")} subtitle={t("restore.readySubtitle")} />
        <GroundPanel>
          <RestoreCard
            summary={{
              filename: state.filename,
              // The document's `createdAt` is an instant; only its day is shown.
              takenAt: dayLabel(accountingDate(state.manifest.createdAt.slice(0, 10)), locale),
              transactions: state.manifest.transactions,
              outboxEntries: state.manifest.outboxEntries,
              fingerprint: state.fingerprint,
            }}
          />
          <Button label={t("restore.apply")} onPress={restore.apply} variant="primary" size="lg" />
          <Button
            label={t("restore.cancel")}
            onPress={handleDismiss}
            variant="secondary"
            size="lg"
          />
        </GroundPanel>
      </>
    );
  }

  if (state.kind === "done") {
    return (
      <>
        <PushedHeader title={t("restore.doneTitle")} />
        <GroundPanel>
          <Text style={styles.lede}>{t("restore.doneBody")}</Text>
          <Button label={t("backup.done")} onPress={handleDismiss} variant="primary" size="lg" />
        </GroundPanel>
      </>
    );
  }

  if (state.kind === "failed") {
    return (
      <>
        <PushedHeader title={t("restore.title")} />
        <GroundPanel>
          <ErrorState
            variant="recoverable"
            what={t("restore.failed")}
            why={state.reason}
            cost={t("restore.failedCost")}
            action={{ label: t("restore.choose"), onPress: handleOpen }}
          />
        </GroundPanel>
      </>
    );
  }

  return (
    <>
      <PushedHeader title={t("restore.title")} subtitle={t("pages.restore")} />
      <GroundPanel>
        <Text style={styles.lede}>{t("restore.lede")}</Text>
        <TextField
          label={t("restore.keyLabel")}
          hint={t("restore.keyHint")}
          value={key}
          onChangeText={setKey}
        />
        <Button
          label={t("restore.choose")}
          onPress={handleOpen}
          variant="primary"
          size="lg"
          loading={state.kind === "working"}
        />
      </GroundPanel>
    </>
  );
}

const useStyles = makeStyles((theme) => ({
  lede: { color: theme.textMuted, ...text.ui("body", 400) },
}));
