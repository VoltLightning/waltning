/**
 * `<StartupFailed>` — the layout's own composition when `startPhoneLedger`
 * failed, so `_layout.tsx` shows this instead of crashing on expo-router's
 * own `ErrorBoundary` (`architecture/14` §14.6).
 *
 * **In `packages/ui`, not the app — it composes only already platform-neutral
 * pieces.** `GroundPanel` and `ErrorState` (`design-system/08` §8.2) are both
 * cross-platform on their own; nothing here reads a platform, so nothing
 * about it is `apps/mobile`'s to own. `_layout.tsx` imports it exactly the
 * way it imports every other composed piece of the shell.
 *
 * **No `action`.** The one recovery is relaunching the app, and nothing
 * running inside a crashed session can do that for someone — `action` is
 * optional on `<ErrorState>` for exactly this case.
 *
 * **Centred, not top-aligned.** A `GroundPanel` page starts its content at
 * the top by default, which is right for a form and wrong for the one thing
 * on this screen — `flexGrow: 1` on the wrapping `View` (never `flex: 1`,
 * which would also set `flexBasis: 0` and reintroduce the bug `card.tsx`'s
 * own H1 fix removed) lets it fill the panel and centre within it when the
 * content is shorter than the device, without breaking the scroll on one
 * that is not.
 */

import { View } from "react-native";
import { useT } from "../i18n/provider";
import { GroundPanel } from "../shell/card";
import { makeStyles } from "../theme/styles.ts";
import { ErrorState } from "./error-state";

export type StartupFailedProps = { error: Error };

export function StartupFailed({ error }: StartupFailedProps) {
  const t = useT();
  const styles = useStyles();

  return (
    <GroundPanel>
      <View style={styles.center}>
        {/* The migrator's own sentence is written for a person, so it is shown
            verbatim rather than replaced with a generic one. */}
        <ErrorState
          variant="terminal"
          what={t("startup.ledgerFailedTitle")}
          why={t("startup.ledgerFailedBody", { message: error.message })}
        />
      </View>
    </GroundPanel>
  );
}

const useStyles = makeStyles(() => ({
  center: { flexGrow: 1, justifyContent: "center" },
}));
