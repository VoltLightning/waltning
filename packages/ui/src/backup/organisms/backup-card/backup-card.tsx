/**
 * `<BackupCard>` — the key a backup was written to, and what that backup
 * holds. `architecture/14` §14.3's app-owned export, on the one card that
 * export produces.
 *
 * **It is the key's card, not the screen's.** `design-system/05` §5.1: a card
 * groups related rows or holds one hero figure, never a whole screen. The
 * sentence explaining what a backup is, and both buttons — the one that takes
 * a backup and the one that dismisses the key — sit on the ground where the
 * screen draws them. This card exists only once there is a key, and the key is
 * its hero.
 *
 * **The key is shown whole, in a face you can read a `0` from an `O` in.** A
 * key with an ellipsis in it cannot be typed back in, and this is the one
 * string in the app with no second copy anywhere — not on the device, not in
 * the manifest, not in a log. Everything else on the card is subordinate to
 * it, and the sentence saying it will not be shown again sits directly under
 * it rather than in a footnote.
 *
 * **The fingerprint appears twice on purpose.** As the card's tag and inside
 * the filename, because every backup has its own key (`use-ledger-backup.ts`
 * says why) and a folder of `.age` files has to be pairable with a password
 * manager full of `AGE-SECRET-KEY-1…` strings without opening either.
 *
 * **No `<Amount>`, correctly.** A backup is measured in entries and kilobytes;
 * there is no money on this card for `design-system/04` to govern.
 */

import { useCallback } from "react";
import { Text, View } from "react-native";
import { useT } from "../../../i18n/provider";
import { Button } from "../../../primitives/atoms/button/button";
import { Card } from "../../../shell/molecules/card/card";
import { text } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { fontFamily, hairline, radius, space, touchTarget } from "../../../tokens.ts";

export type BackupSummary = {
  /** How many transactions travelled — the figure a person recognises as *their ledger*. */
  readonly transactions: number;
  /** Unsent intent. Called out separately because nothing else holds it (§14.1). */
  readonly outboxEntries: number;
  readonly bytes: number;
  readonly filename: string;
  /** Where the platform put it, in words — a folder, not a URI. */
  readonly where: string;
  /**
   * Whether the platform confirmed the file exists. A browser never can, and
   * the row says *check* rather than *kept in* when it could not.
   */
  readonly confirmed: boolean;
};

export type BackupCardProps = {
  /** `AGE-SECRET-KEY-1…`, shown once. */
  identity: string;
  fingerprint: string;
  summary: BackupSummary;
  /** Absent where the platform has no clipboard; the key is selectable either way. */
  onCopyKey?: (identity: string) => void;
  /** What the last copy did — the card must not render success and failure identically. */
  copied?: "copied" | "refused";
};

export function BackupCard({ identity, fingerprint, summary, onCopyKey, copied }: BackupCardProps) {
  const t = useT();
  const styles = useStyles();
  // A named reference, because JSX may not carry an arrow (`CLAUDE.md`).
  const handleCopy = useCallback(() => onCopyKey?.(identity), [identity, onCopyKey]);

  return (
    <Card title={t("backup.yourKey")} tag={fingerprint}>
      <View style={styles.body}>
        {/*
          `selectable` so the key can be taken by hand on a platform whose
          clipboard this build cannot reach — the one string on the screen
          where "try the button again" is not an acceptable answer.

          **No `accessibilityLabel`.** One naming the card's heading replaced
          the key in the accessibility tree with the words *Your key*, so the
          74 characters this component exists to make readable were the one
          thing a screen reader could not reach. The text is its own label.
        */}
        <Text style={styles.keyText} selectable>
          {identity}
        </Text>
        <Text style={styles.warning}>{t("backup.shownOnce")}</Text>
        {onCopyKey === undefined ? null : (
          <View style={styles.copy}>
            <Button
              label={t("backup.copyKey")}
              onPress={handleCopy}
              variant="secondary"
              size="sm"
            />
            {copied === undefined ? null : (
              <Text style={copied === "copied" ? styles.copied : styles.refused}>
                {t(copied === "copied" ? "backup.copied" : "backup.copyRefused")}
              </Text>
            )}
          </View>
        )}

        <View style={styles.summary}>
          <SummaryRow label={t("backup.file")} value={summary.filename} />
          <SummaryRow
            label={t("backup.entries")}
            value={t("backup.entriesValue", {
              count: summary.transactions,
              size: kilobytes(summary.bytes),
            })}
          />
          {summary.outboxEntries > 0 ? (
            <SummaryRow
              label={t("backup.unsent")}
              value={t("backup.unsentValue", { count: summary.outboxEntries })}
            />
          ) : null}
          <SummaryRow
            label={t(summary.confirmed ? "backup.where" : "backup.whereUnconfirmed")}
            value={summary.where}
            last
          />
        </View>
      </View>
    </Card>
  );
}

function SummaryRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.row, last ? null : styles.ruled]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** Whole kilobytes — a backup's size is context, not a figure to reconcile against. */
function kilobytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

const useStyles = makeStyles((theme) => ({
  body: { gap: space.lg },
  /**
   * Monospace, and the one place in the app that needs it: this string is read
   * character by character off a screen and typed into something else, where
   * `l`/`1` and `0`/`O` are the whole difference between a backup and a file.
   */
  keyText: {
    color: theme.text,
    padding: space.xl,
    borderWidth: hairline.width,
    borderColor: theme.hairline,
    borderRadius: radius.sm,
    backgroundColor: theme.insetFill,
    ...text.ui("label", 400),
    // After the spread: `text.ui` sets the loaded UI face, and this is the one
    // string in the app that must not be read in it.
    fontFamily: fontFamily.mono,
  },
  warning: { color: theme.textMuted, ...text.ui("caption", 400) },
  copy: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: space.lg },
  copied: { color: theme.textMuted, ...text.ui("caption", 400) },
  refused: { color: theme.dangerText, ...text.ui("caption", 400) },

  summary: { marginTop: space.xs },
  row: {
    minHeight: touchTarget.row,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
  },
  ruled: { borderBottomWidth: hairline.width, borderBottomColor: theme.hairline },
  rowLabel: { color: theme.textMuted, ...text.ui("label", 400) },
  rowValue: { color: theme.text, flexShrink: 1, ...text.ui("label") },
}));
