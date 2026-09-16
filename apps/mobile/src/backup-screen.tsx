/**
 * Settings · Back up — `architecture/14` §14.3's app-owned encrypted export.
 *
 * A screen composes. The state machine is `useLedgerBackup`'s, the key's card
 * is `packages/ui`'s, and the platform calls come through `./platform` — which
 * is what makes this file platform-bound: `platform.native.ts` and
 * `platform.ts` are different modules behind that one extension-less
 * specifier, and the export is the feature's whole platform surface.
 *
 * **The lede and the buttons are on the ground, not in a card** —
 * `design-system/05` §5.1. The card appears only once there is a key, because
 * a key is the one thing here that a card's job (hold the hero) describes.
 *
 * **Copy is offered only where the platform has a clipboard**, and it says
 * what happened. A button that fails into a `void` renders success and failure
 * identically, directly above the control that destroys the key.
 */

import { useLedgerBackup } from "@waltning/client/backup/use-ledger-backup";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { BackupCard } from "@waltning/ui/backup/backup-card";
import { useT } from "@waltning/ui/i18n/provider";
import { Button } from "@waltning/ui/primitives/button";
import { ErrorState } from "@waltning/ui/states/error-state";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { useCallback, useState } from "react";
import { Text } from "react-native";
import { mobileDiagnostics } from "./diagnostics.ts";
import { backupPort } from "./platform";
import { PushedPage } from "./pushed-page";

/**
 * The device's clock and its offset, as a stable reference.
 *
 * The offset travels because the filename carries a **day**, and `core/date`'s
 * C28 is exactly the mistake of taking it off a UTC instant: at 00:10 in
 * Warsaw a backup would file itself under yesterday.
 */
const clock = () => ({ at: new Date(), offsetMinutes: -new Date().getTimezoneOffset() });

export default function Backup() {
  const t = useT();
  const styles = useStyles();
  const ledger = useLedgerController();
  const backup = useLedgerBackup(ledger, backupPort, clock, mobileDiagnostics);
  const { state } = backup;
  const [copied, setCopied] = useState<"copied" | "refused" | undefined>(undefined);

  // `backupPort` is a module constant, so its clipboard is one too — the
  // dependency list is empty because nothing here can change between renders.
  const { clipboard } = backupPort;
  const handleCopyKey = useCallback((identity: string) => {
    if (clipboard === null) return;
    // Fire and forget the promise, not the answer: the card renders it.
    void clipboard(identity).then(
      (ok) => setCopied(ok ? "copied" : "refused"),
      () => setCopied("refused"),
    );
  }, []);

  const handleDone = useCallback(() => {
    setCopied(undefined);
    backup.dismiss();
  }, [backup]);

  if (state.kind === "done") {
    return (
      <PushedPage title={t("routes.backup")} subtitle={t("pages.backup")}>
        <BackupCard
          identity={state.identity}
          fingerprint={state.fingerprint}
          summary={{
            transactions: state.manifest.transactions,
            outboxEntries: state.manifest.outboxEntries,
            bytes: state.manifest.bytes,
            filename: state.filename,
            // `handoff` is null until the platform has answered — the key is on
            // screen first, deliberately (`use-ledger-backup.ts`).
            where: state.handoff?.where ?? t("backup.handing"),
            confirmed: state.handoff?.confirmed ?? false,
          }}
          {...(clipboard === null ? {} : { onCopyKey: handleCopyKey })}
          {...(copied === undefined ? {} : { copied })}
        />
        <Button label={t("backup.done")} onPress={handleDone} variant="primary" size="lg" />
      </PushedPage>
    );
  }

  if (state.kind === "failed") {
    return (
      <PushedPage title={t("routes.backup")} subtitle={t("pages.backup")}>
        <ErrorState
          variant="recoverable"
          what={t("backup.failed")}
          why={state.reason}
          cost={t("backup.failedCost")}
          action={{ label: t("backup.again"), onPress: backup.run }}
        />
      </PushedPage>
    );
  }

  return (
    <PushedPage title={t("routes.backup")} subtitle={t("pages.backup")}>
      <Text style={styles.lede}>{t("backup.lede")}</Text>
      <Button
        label={t("backup.action")}
        onPress={backup.run}
        variant="primary"
        size="lg"
        loading={state.kind === "working"}
      />
    </PushedPage>
  );
}

const useStyles = makeStyles((theme) => ({
  lede: { color: theme.textMuted, ...text.ui("body", 400) },
}));
