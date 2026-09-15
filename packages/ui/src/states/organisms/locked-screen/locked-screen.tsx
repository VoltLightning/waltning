/**
 * `<LockedScreen>` — what stands where the ledger would be while the device
 * has not yet said who is holding it (`SPEC.md` §5.7, *App launch*).
 *
 * **Two modes, one look.** `locked` is the gate: the ledger's tree is not on
 * the page (before the first unlock) or is under this (after it), and the
 * one thing to do is the button, which raises the device's own prompt. On a
 * device that opens with a prompt of its own the button is what a person taps
 * after cancelling it — cancelling leaves the ledger locked, not a stale
 * balance behind a dismissed sheet. `cover` is the same surface with no
 * button: the app is in the background and this is what the switcher's
 * snapshot shows instead of a balance.
 *
 * **In `packages/ui`, like `StartupFailed`** — it composes nothing but
 * platform-neutral pieces and reads no platform; which state it is in is the
 * layout's to say.
 *
 * Opaque by construction: `theme.ground` fills it, because a translucent
 * cover is a cover that is not one.
 */

import { Text, View } from "react-native";
import { useT } from "../../../i18n/provider";
import { Button } from "../../../primitives/atoms/button/button";
import { text, textCap } from "../../../theme/fonts.ts";
import { makeStyles } from "../../../theme/styles.ts";
import { gutter, space } from "../../../tokens.ts";

export type LockedScreenFailure = "cancelled" | "failed" | "lockout" | "unavailable";

export type LockedScreenProps =
  | {
      mode: "locked";
      onUnlock: () => void;
      /** The platform's prompt is up — the button waits rather than raising a second one. */
      prompting: boolean;
      /** Why the last attempt did not unlock, for the line under the button. */
      failure?: LockedScreenFailure | null | undefined;
    }
  | { mode: "cover" };

const FAILURE_LINE = {
  cancelled: "lock.cancelled",
  failed: "lock.failed",
  lockout: "lock.lockout",
  unavailable: "lock.unavailable",
} as const;

export function LockedScreen(props: LockedScreenProps) {
  const t = useT();
  const styles = useStyles();

  return (
    <View style={styles.root} accessibilityRole={props.mode === "cover" ? "none" : undefined}>
      <View style={styles.centre}>
        <Text style={styles.title} maxFontSizeMultiplier={textCap("displayTwo")}>
          {t("lock.title")}
        </Text>
        {props.mode === "cover" ? null : (
          <>
            <Text style={styles.body}>{t("lock.body")}</Text>
            <View style={styles.action}>
              <Button
                variant="primary"
                size="lg"
                label={t("lock.unlock")}
                onPress={props.onUnlock}
                loading={props.prompting}
              />
            </View>
            {props.failure === undefined || props.failure === null ? null : (
              <Text style={styles.failure} accessibilityRole="alert">
                {t(FAILURE_LINE[props.failure])}
              </Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.ground, paddingHorizontal: gutter },
  centre: { flexGrow: 1, justifyContent: "center", alignItems: "stretch", gap: space.lg },
  title: { color: theme.text, ...text.ui("displayTwo"), textAlign: "center" },
  body: { color: theme.textMuted, ...text.ui("body"), textAlign: "center" },
  action: { marginTop: space.x3 },
  failure: { color: theme.textMuted, ...text.ui("caption"), textAlign: "center" },
}));
