/**
 * `StartupFailedScreen` — the layout's own composition when
 * `startPhoneLedger` failed, so `_layout.tsx` shows a screen instead of
 * crashing on expo-router's own `ErrorBoundary` (`architecture/14` §14.6).
 *
 * A route-level file, not `packages/ui`: the design system names no
 * ledger-startup screen, only the general-purpose `<ErrorState>`
 * (`design-system/08` §8.2) it is built from.
 *
 * **No `action`.** The one recovery is relaunching the app, and nothing
 * running inside a crashed session can do that for someone — `action` is
 * optional on `<ErrorState>` for exactly this case.
 */

import { useT } from "@waltning/ui/i18n/provider";
import { ErrorState } from "@waltning/ui/states/error-state";
import { makeStyles } from "@waltning/ui/theme/styles";
import { View } from "react-native";

export function StartupFailedScreen({ error }: { error: Error }) {
  const t = useT();
  const styles = useStyles();
  return (
    <View style={styles.root}>
      {/* The migrator's own sentence is written for a person, so it is shown
          verbatim rather than replaced with a generic one. */}
      <ErrorState
        variant="terminal"
        what={t("startup.ledgerFailedTitle")}
        why={t("startup.ledgerFailedBody", { message: error.message })}
      />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { flex: 1, justifyContent: "center", backgroundColor: theme.ground },
}));
