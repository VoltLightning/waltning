/**
 * `<RestoreCard>` — what is in the file, before the ledger is overwritten.
 *
 * `architecture/14` §14.3's other half. The export's card shows a key you must
 * keep; this one shows a **decision you have not made yet**: when the backup
 * was taken, how much it holds, how many captures were still unsent — and only
 * then the control that writes it.
 *
 * **The manifest comes before the confirm, and that ordering is the design.**
 * A restore replaces a ledger. Reading what is in the file *after* saying yes
 * is a receipt for a decision already made; `S30`'s own wording about backup
 * manifests is that a manifest you only see after downloading is exactly that.
 *
 * **The key is a field, not a memory.** Nothing in this app keeps a copy of an
 * identity (`use-ledger-backup.ts` says why), so on the day this screen is
 * reached the key comes out of a password manager and into here. The
 * fingerprint under it is the same six characters the filename carries, so a
 * wrong key and a wrong file are told apart before either is blamed.
 */

import { Text, View } from "react-native";
import { useT } from "../../../i18n/provider";
import { Card } from "../../../shell/molecules/card/card";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { hairline, space, touchTarget } from "../../../tokens.ts";

export type RestoreSummary = {
  readonly filename: string;
  /** When the backup was taken, already formatted — this card does no date arithmetic. */
  readonly takenAt: string;
  readonly transactions: number;
  readonly outboxEntries: number;
  /** The six characters that pair this file with its key. */
  readonly fingerprint: string;
};

export type RestoreCardProps = {
  summary: RestoreSummary;
};

export function RestoreCard({ summary }: RestoreCardProps) {
  const t = useT();
  const styles = useStyles();

  return (
    <Card title={t("restore.found")} tag={summary.fingerprint}>
      <View style={styles.rows}>
        <Row label={t("backup.file")} value={summary.filename} />
        <Row label={t("restore.taken")} value={summary.takenAt} />
        <Row
          label={t("backup.entries")}
          value={t("restore.entriesValue", { count: summary.transactions })}
        />
        {summary.outboxEntries > 0 ? (
          <Row
            label={t("backup.unsent")}
            value={t("backup.unsentValue", { count: summary.outboxEntries })}
            last
          />
        ) : null}
      </View>
    </Card>
  );
}

function Row({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.row, last ? null : styles.ruled]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  rows: { marginVertical: -space.xs },
  row: {
    minHeight: touchTarget.row,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
  },
  ruled: { borderBottomWidth: hairline.width, borderBottomColor: theme.hairline },
  label: { color: theme.textMuted, ...text.ui("label", 400) },
  value: { color: theme.text, flexShrink: 1, ...text.ui("label") },
}));
